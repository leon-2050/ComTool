// ComTool Rust rewrite, 2026-10-13; LGPL-3.0-only. Upstream: Neutree/COMTool.
pub mod model;
pub mod profile;
pub mod transport;
use model::*;
use std::{collections::HashMap,path::PathBuf,sync::{Arc,Mutex,atomic::{AtomicBool,AtomicU64,Ordering}},time::Duration};
use tauri::{Emitter,ipc::Channel};
use tokio::{io::{AsyncReadExt,AsyncWriteExt},sync::{mpsc,oneshot}};
use tokio_util::sync::CancellationToken;

struct Runtime {
    cancel:CancellationToken, sender:Mutex<mpsc::Sender<Control>>, status:Mutex<StatusEvent>,
    rx:Arc<AtomicU64>,tx:Arc<AtomicU64>,dropped:Arc<AtomicU64>,
    ack:Mutex<Option<(u64,oneshot::Sender<()>)>>,schedule:Mutex<Option<CancellationToken>>,transfer:Mutex<Option<CancellationToken>>,
    datagram:bool,finished:AtomicBool,generation:u64,
}
struct AppState {
    dir:PathBuf,profile:Mutex<Profile>,runtimes:Mutex<HashMap<String,Arc<Runtime>>>,
    trust:Mutex<HashMap<String,oneshot::Sender<bool>>>,startup_error:String,
    closing:AtomicBool,next_generation:AtomicU64,read_only:AtomicBool,
}
impl AppState {
    fn runtime(&self,id:&str)->Result<Arc<Runtime>,String>{self.runtimes.lock().unwrap().get(id).cloned().ok_or("会话尚未连接".into())}
    fn config(&self,id:&str)->Result<SessionConfig,String>{self.profile.lock().unwrap().sessions.iter().find(|s|s.id==id).cloned().ok_or("会话不存在".into())}
}
fn publish(app:&tauri::AppHandle,runtime:&Runtime,id:&str,state:&str,message:String,peers:Vec<String>){
    let value=StatusEvent{session_id:id.into(),generation:runtime.generation,state:state.into(),message,peers,rx:runtime.rx.load(Ordering::Relaxed),tx:runtime.tx.load(Ordering::Relaxed),dropped:runtime.dropped.load(Ordering::Relaxed)};
    *runtime.status.lock().unwrap()=value.clone();let _=app.emit("connection-status",value);
}
fn notice(app:&tauri::AppHandle,runtime:&Runtime,id:&str,message:String){let s=runtime.status.lock().unwrap().clone();publish(app,runtime,id,&s.state,message,s.peers);}

#[derive(serde::Serialize)]#[serde(rename_all="camelCase")]
struct Bootstrap { profile:Profile,legacy_available:bool,startup_error:String }
#[tauri::command]fn bootstrap(state:tauri::State<'_,Arc<AppState>>)->Bootstrap{
    Bootstrap{profile:state.profile.lock().unwrap().clone(),legacy_available:profile::legacy_path().exists(),startup_error:if state.read_only.load(Ordering::Acquire){state.startup_error.clone()}else{String::new()}}
}
#[tauri::command]fn save_profile(profile:Profile,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    if state.read_only.load(Ordering::Acquire){return Err("当前配置无法读取，原文件保持不变；请先导入配置或备份并重建".into());}
    if profile.version!=1{return Err("不支持的配置版本".into());}
    let mut ids=std::collections::HashSet::new();for s in &profile.sessions{if s.id.is_empty()||!ids.insert(s.id.clone()){return Err("会话 ID 重复或为空".into());}}
    let mut current=state.profile.lock().unwrap();let mut incoming=profile;incoming.known_hosts=current.known_hosts.clone();
    profile::save(&state.dir,&incoming)?;*current=incoming;Ok(())
}
#[tauri::command]fn list_ports()->Result<Vec<serde_json::Value>,String>{
    serialport::available_ports().map(|ports|ports.into_iter().map(|p|serde_json::json!({"device":p.port_name,"description":format!("{:?}",p.port_type)})).collect()).map_err(|e|e.to_string())
}
#[tauri::command]fn statuses(state:tauri::State<'_,Arc<AppState>>)->Vec<StatusEvent>{
    state.runtimes.lock().unwrap().values().map(|r|{let mut s=r.status.lock().unwrap().clone();s.rx=r.rx.load(Ordering::Relaxed);s.tx=r.tx.load(Ordering::Relaxed);s.dropped=r.dropped.load(Ordering::Relaxed);s}).collect()
}
#[tauri::command]fn ack_data(session_id:String,generation:u64,sequence:u64,state:tauri::State<'_,Arc<AppState>>){
    if let Ok(r)=state.runtime(&session_id){if r.generation!=generation{return;}let mut ack=r.ack.lock().unwrap();if ack.as_ref().is_some_and(|(seq,_)|*seq==sequence){if let Some((_,tx))=ack.take(){let _=tx.send(());}}}
}
#[tauri::command]fn respond_host_key(session_id:String,accept:bool,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    if let Some(sender)=state.trust.lock().unwrap().remove(&session_id){let _=sender.send(accept);Ok(())}else{Err("此主机确认已过期".into())}
}
#[tauri::command]fn connect_session(session_id:String,mut secrets:Secrets,on_data:Channel<DataFrame>,app:tauri::AppHandle,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    if state.read_only.load(Ordering::Acquire){return Err("请先完成配置恢复".into());}
    let config=state.config(&session_id)?;config.validate()?;
    if let Some(existing)=state.runtimes.lock().unwrap().get(&session_id){if !existing.finished.load(Ordering::Acquire){return Err("会话已连接、正在连接或正在关闭，请稍后再试".into());}}
    if config.remember_secret {
        if secrets.password.is_empty()&&secrets.passphrase.is_empty(){secrets=profile::get_secrets(&session_id)?;}
    }else{profile::forget_secret(&session_id)?;}
    let (tx,_rx)=mpsc::channel(1);
    let generation=state.next_generation.fetch_add(1,Ordering::Relaxed)+1;
    let runtime=Arc::new(Runtime{cancel:CancellationToken::new(),sender:Mutex::new(tx),status:Mutex::new(StatusEvent{session_id:session_id.clone(),generation,state:"connecting".into(),message:"正在连接…".into(),peers:vec![],rx:0,tx:0,dropped:0}),rx:Arc::new(AtomicU64::new(0)),tx:Arc::new(AtomicU64::new(0)),dropped:Arc::new(AtomicU64::new(0)),ack:Mutex::new(None),schedule:Mutex::new(None),transfer:Mutex::new(None),datagram:config.kind=="udp",finished:AtomicBool::new(false),generation});
    state.runtimes.lock().unwrap().insert(session_id.clone(),runtime.clone());
    let shared=state.inner().clone();let task_runtime=runtime.clone();let task_app=app.clone();
    publish(&app,&runtime,&session_id,"connecting","正在连接…".into(),vec![]);
    tauri::async_runtime::spawn(async move{
        let (output,input)=mpsc::channel(128);let pump_runtime=task_runtime.clone();let pump_app=task_app.clone();let pump_config=config.clone();
        let pump=tauri::async_runtime::spawn(async move{pump_data(input,on_data,pump_runtime,pump_app,pump_config).await;});
        let tx_logging_failed=Arc::new(AtomicBool::new(false));
        let (sent_log_sender,sent_log_task)=if config.record_send&&!config.log_path.is_empty(){
            let(tx,rx)=mpsc::channel(128);let rt=task_runtime.clone();let a=task_app.clone();let cfg=config.clone();let failed=tx_logging_failed.clone();
            (Some(tx),Some(tauri::async_runtime::spawn(async move{record_sent(rx,rt,a,cfg,failed).await;})))
        }else{(None,None)};
        let credential_saved=Arc::new(AtomicBool::new(false));
        while !task_runtime.cancel.is_cancelled(){
            let(tx,rx)=mpsc::channel(128);*task_runtime.sender.lock().unwrap()=tx;
            let ev_runtime=task_runtime.clone();let ev_app=task_app.clone();let ev_id=session_id.clone();
            let trust_shared=shared.clone();let trust_app=task_app.clone();let trust_runtime=task_runtime.clone();let trust_id=session_id.clone();let host=format!("{}:{}",config.host,config.port);
            let sent_sender=sent_log_sender.clone();let sent_failed=tx_logging_failed.clone();let sent_runtime=task_runtime.clone();let sent_app=task_app.clone();let sent_id=session_id.clone();let datagram=config.kind=="udp";
            let save_credential=config.kind=="ssh"&&config.remember_secret;let credential=secrets.clone();let saved=credential_saved.clone();
            let events=transport::Events{state:Arc::new(move|status,message,peers|{publish(&ev_app,&ev_runtime,&ev_id,status,message,peers);if status=="connected"&&save_credential&&!saved.swap(true,Ordering::Relaxed){if let Err(e)=profile::put_secrets(&ev_id,&credential){notice(&ev_app,&ev_runtime,&ev_id,format!("连接成功，但凭据保存失败：{e}"));}}}),tx:task_runtime.tx.clone(),dropped:task_runtime.dropped.clone(),
                sent:Arc::new(move|peer,bytes|{if sent_failed.load(Ordering::Relaxed){return;}if let Some(sender)=&sent_sender{if sender.try_send(Packet{peer:peer.into(),bytes:bytes.to_vec(),datagram}).is_err(){if !sent_failed.swap(true,Ordering::Relaxed){notice(&sent_app,&sent_runtime,&sent_id,"发送记录队列溢出或关闭，发送记录已停止".into());}}}}),
                trust:Arc::new(move|fingerprint|{let shared=trust_shared.clone();let app=trust_app.clone();let runtime=trust_runtime.clone();let id=trust_id.clone();let host=host.clone();Box::pin(async move{
                    if let Some(saved)=shared.profile.lock().unwrap().known_hosts.get(&host).cloned(){return if saved==fingerprint{Ok(true)}else{anyhow::bail!("SSH 主机密钥已变化，连接已拒绝：{host}")};}
                    let(tx,rx)=oneshot::channel();shared.trust.lock().unwrap().insert(id.clone(),tx);
                    app.emit("host-key",serde_json::json!({"sessionId":id,"host":host,"fingerprint":fingerprint}))?;
                    let accepted=tokio::select!{_=runtime.cancel.cancelled()=>false,v=tokio::time::timeout(Duration::from_secs(90),rx)=>v.ok().and_then(Result::ok).unwrap_or(false)};
                    shared.trust.lock().unwrap().remove(&id);
                    if accepted{let mut p=shared.profile.lock().unwrap();if let Some(saved)=p.known_hosts.get(&host){if saved!=&fingerprint{anyhow::bail!("SSH 主机密钥已变化");}}p.known_hosts.insert(host,fingerprint);profile::save(&shared.dir,&p).map_err(anyhow::Error::msg)?;}Ok(accepted)
                })})};
            let result=tokio::select!{_=task_runtime.cancel.cancelled()=>Ok(()),r=transport::run(config.clone(),secrets.clone(),rx,task_runtime.cancel.child_token(),output.clone(),events)=>r};
            if task_runtime.cancel.is_cancelled(){break;}
            let message=result.err().map(|e|e.to_string()).unwrap_or_else(||"远端连接已关闭".into());
            if !config.reconnect||config.server{publish(&task_app,&task_runtime,&session_id,"error",message,vec![]);break;}
            // Finish all old receive blocks and frontend acknowledgements before a new stream.
            let(fence,flushed)=oneshot::channel();
            tokio::select!{_=task_runtime.cancel.cancelled()=>break,r=output.send(Incoming::Fence(fence))=>if r.is_err(){break;}}
            tokio::select!{_=task_runtime.cancel.cancelled()=>break,_=flushed=>{}}
            publish(&task_app,&task_runtime,&session_id,"reconnecting",message,vec![]);
            tokio::select!{_=task_runtime.cancel.cancelled()=>break,_=tokio::time::sleep(Duration::from_millis(config.reconnect_interval.max(250)))=>{}}
            publish(&task_app,&task_runtime,&session_id,"connecting","正在重新连接…".into(),vec![]);
        }
        let cancelled=task_runtime.cancel.is_cancelled();drop(output);
        // Let the receiver finish accepted packets; cancellation stops any pending UI acknowledgement.
        if cancelled{task_runtime.cancel.cancel();}
        let _=pump.await;drop(sent_log_sender);if let Some(task)=sent_log_task{let _=task.await;}
        task_runtime.cancel.cancel();
        if cancelled&&task_runtime.status.lock().unwrap().state!="error"{publish(&task_app,&task_runtime,&session_id,"disconnected","已断开".into(),vec![]);}
        task_runtime.finished.store(true,Ordering::Release);
    });Ok(())
}
async fn pump_data(mut input:mpsc::Receiver<Incoming>,channel:Channel<DataFrame>,runtime:Arc<Runtime>,app:tauri::AppHandle,config:SessionConfig){
    let mut sequence=0u64;let mut log=None;let mut index=None;let mut offset=0u64;let mut pending=None;
    if !config.log_path.is_empty(){
        match tokio::fs::OpenOptions::new().create(true).append(true).open(&config.log_path).await{
            Ok(file)=>{offset=file.metadata().await.map(|m|m.len()).unwrap_or(0);log=Some(file);match tokio::fs::OpenOptions::new().create(true).append(true).open(format!("{}.index.jsonl",config.log_path)).await{Ok(f)=>index=Some(f),Err(e)=>{notice(&app,&runtime,&config.id,format!("记录索引无法写入，已停止记录：{e}"));log=None;}}},
            Err(e)=>notice(&app,&runtime,&config.id,format!("记录文件无法写入：{e}"))
        }
    }
    loop{
        let incoming=if let Some(packet)=pending.take(){packet}else{let Some(packet)=input.recv().await else{break;};packet};
        let mut packet=match incoming{Incoming::Data(packet)=>packet,Incoming::Fence(done)=>{if let Some(file)=&mut log{let _=file.flush().await;}if let Some(file)=&mut index{let _=file.flush().await;}let _=done.send(());continue;}};
        if !packet.datagram&&packet.bytes.len()<65536{
            let deadline=tokio::time::Instant::now()+Duration::from_millis(16);
            while packet.bytes.len()<65536{
                let next=if runtime.cancel.is_cancelled(){input.try_recv().ok()}else{tokio::time::timeout_at(deadline,input.recv()).await.ok().flatten()};
                let Some(next)=next else{break;};
                match next{Incoming::Data(next) if !next.datagram&&next.peer==packet.peer&&packet.bytes.len()+next.bytes.len()<=65536=>packet.bytes.extend(next.bytes),other=>{pending=Some(other);break;}}
            }
        }
        runtime.rx.fetch_add(packet.bytes.len() as u64,Ordering::Relaxed);let time=chrono::Local::now().to_rfc3339();
        if let (Some(file),Some(meta))=(&mut log,&mut index){
            let line=format!("{}\n",serde_json::json!({"offset":offset,"length":packet.bytes.len(),"peer":packet.peer,"datagram":packet.datagram,"timestamp":time}));
            if let Err(e)=async{file.write_all(&packet.bytes).await?;meta.write_all(line.as_bytes()).await}.await{
                notice(&app,&runtime,&config.id,format!("磁盘写入失败，通信记录已停止：{e}"));log=None;index=None;
            }else{offset+=packet.bytes.len() as u64;}
        }
        sequence+=1;let (ack_tx,ack_rx)=oneshot::channel();*runtime.ack.lock().unwrap()=Some((sequence,ack_tx));
        if let Err(e)=channel.send(DataFrame{session_id:config.id.clone(),generation:runtime.generation,peer_id:packet.peer,sequence,bytes:packet.bytes,datagram:packet.datagram,timestamp:time}){
            publish(&app,&runtime,&config.id,"error",format!("界面数据通道已关闭：{e}"),vec![]);runtime.cancel.cancel();break;
        }
        tokio::select!{_=runtime.cancel.cancelled()=>{},ack=tokio::time::timeout(Duration::from_secs(15),ack_rx)=>if ack.is_err(){publish(&app,&runtime,&config.id,"error","界面长时间未处理数据，连接已停止".into(),vec![]);runtime.cancel.cancel();}}
    }
    if let Some(mut file)=log{let _=file.flush().await;}if let Some(mut file)=index{let _=file.flush().await;}
}
async fn record_sent(mut input:mpsc::Receiver<Packet>,runtime:Arc<Runtime>,app:tauri::AppHandle,config:SessionConfig,failed:Arc<AtomicBool>){
    let result:Result<(),String>=async{
        let mut file=tokio::fs::OpenOptions::new().create(true).append(true).open(format!("{}.tx.bin",config.log_path)).await.map_err(|e|e.to_string())?;
        let mut index=tokio::fs::OpenOptions::new().create(true).append(true).open(format!("{}.tx.index.jsonl",config.log_path)).await.map_err(|e|e.to_string())?;
        let mut offset=file.metadata().await.map_err(|e|e.to_string())?.len();
        while let Some(packet)=input.recv().await{
            file.write_all(&packet.bytes).await.map_err(|e|e.to_string())?;
            let line=format!("{}\n",serde_json::json!({"offset":offset,"length":packet.bytes.len(),"peer":packet.peer,"datagram":packet.datagram,"timestamp":chrono::Local::now().to_rfc3339()}));
            index.write_all(line.as_bytes()).await.map_err(|e|e.to_string())?;offset+=packet.bytes.len()as u64;
        }file.flush().await.map_err(|e|e.to_string())?;index.flush().await.map_err(|e|e.to_string())?;Ok(())
    }.await;
    if let Err(e)=result{failed.store(true,Ordering::Relaxed);notice(&app,&runtime,&config.id,format!("发送记录写入失败，记录已停止：{e}"));}
}
#[tauri::command]fn disconnect_session(session_id:String,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    let r=state.runtime(&session_id)?;r.cancel.cancel();if let Some(t)=r.schedule.lock().unwrap().take(){t.cancel();}if let Some(t)=r.transfer.lock().unwrap().take(){t.cancel();}Ok(())
}
async fn enqueue(runtime:&Runtime,bytes:Vec<u8>,peer:Option<String>)->Result<(),String>{
    enqueue_with_token(runtime,bytes,peer,None).await
}
async fn enqueue_with_token(runtime:&Runtime,bytes:Vec<u8>,peer:Option<String>,token:Option<CancellationToken>)->Result<(),String>{
    if runtime.status.lock().unwrap().state!="connected"{return Err("连接尚未就绪".into());}
    if runtime.datagram&&bytes.len()>65507{return Err("UDP 单个报文不能超过 65507 字节".into());}
    let sender=runtime.sender.lock().unwrap().clone();
    let chunk_size=if runtime.datagram{65507}else{65536};let chunks:Vec<&[u8]>=if bytes.is_empty(){vec![&[]]}else{bytes.chunks(chunk_size).collect()};
    for chunk in chunks{tokio::select!{_=runtime.cancel.cancelled()=>return Err("连接已断开".into()),_=async{if let Some(t)=&token{t.cancelled().await}else{std::future::pending::<()>().await}}=>return Ok(()),r=sender.send(Control::Send{bytes:chunk.to_vec(),peer:peer.clone(),token:token.clone()})=>r.map_err(|_|"连接数据通道已关闭".to_string())?}}
    Ok(())
}
#[tauri::command]async fn send_input(session_id:String,text:String,peer:Option<String>,state:tauri::State<'_,Arc<AppState>>)->Result<usize,String>{
    let config=state.config(&session_id)?;let bytes=encode_input(&text,&config)?;let size=bytes.len();if size>1024*1024{return Err("单次发送超过 1 MiB，请使用文件发送".into());}
    let r=state.runtime(&session_id)?;enqueue(&r,bytes,peer).await?;Ok(size)
}
#[tauri::command]async fn send_bytes(session_id:String,bytes:Vec<u8>,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    if bytes.len()>65536{return Err("发送块超过 64 KiB".into());}let r=state.runtime(&session_id)?;enqueue(&r,bytes,None).await
}
#[tauri::command]async fn send_terminal_input(session_id:String,text:String,peer:Option<String>,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    let config=state.config(&session_id)?;if config.kind=="tcp"&&config.server&&peer.is_none(){return Err("请先选择一个 TCP 客户端".into());}let bytes=encode_text(&text,&config.encoding)?;if bytes.len()>65536{return Err("终端输入超过 64 KiB".into());}let r=state.runtime(&session_id)?;enqueue(&r,bytes,peer).await
}
#[tauri::command]async fn resize_terminal(session_id:String,cols:u32,rows:u32,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    let r=state.runtime(&session_id)?;let tx=r.sender.lock().unwrap().clone();tx.send(Control::Resize{cols,rows}).await.map_err(|e|e.to_string())
}
#[tauri::command]async fn disconnect_peer(session_id:String,peer:String,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    let r=state.runtime(&session_id)?;let tx=r.sender.lock().unwrap().clone();tx.send(Control::DisconnectPeer(peer)).await.map_err(|e|e.to_string())
}
#[tauri::command]fn schedule_send(session_id:String,text:String,interval_ms:u64,peer:Option<String>,enabled:bool,app:tauri::AppHandle,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    let r=state.runtime(&session_id)?;if let Some(token)=r.schedule.lock().unwrap().take(){token.cancel();}
    if !enabled{return Ok(());}if interval_ms<20{return Err("定时发送间隔最小为 20 ms".into());}
    let bytes=encode_input(&text,&state.config(&session_id)?)?;let token=r.cancel.child_token();*r.schedule.lock().unwrap()=Some(token.clone());
    tauri::async_runtime::spawn(async move{let mut timer=tokio::time::interval(Duration::from_millis(interval_ms));timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop{tokio::select!{_=token.cancelled()=>break,_=timer.tick()=>if let Err(e)=enqueue_with_token(&r,bytes.clone(),peer.clone(),Some(token.clone())).await{notice(&app,&r,&session_id,format!("定时发送已停止：{e}"));break;}}}
    });Ok(())
}
#[tauri::command]async fn send_file(session_id:String,path:String,peer:Option<String>,app:tauri::AppHandle,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    let config=state.config(&session_id)?;
    let r=state.runtime(&session_id)?;if let Some(t)=r.transfer.lock().unwrap().take(){t.cancel();}let token=r.cancel.child_token();*r.transfer.lock().unwrap()=Some(token.clone());
    let mut file=tokio::fs::File::open(path).await.map_err(|e|e.to_string())?;let total=file.metadata().await.map_err(|e|e.to_string())?.len();let mut sent=0u64;let mut buffer=vec![0;if config.kind=="udp"{61440}else{65536}];
    if config.kind=="udp"{notice(&app,&r,&session_id,"UDP 文件按 60 KiB 分报文发送，接收端需要自行处理丢包与顺序".into());}
    loop{let n=tokio::select!{_=token.cancelled()=>return Ok(()),r=file.read(&mut buffer)=>r.map_err(|e|e.to_string())?};if n==0{break;}
        tokio::select!{_=token.cancelled()=>return Ok(()),r=enqueue_with_token(&r,buffer[..n].to_vec(),peer.clone(),Some(token.clone()))=>r?};sent+=n as u64;
        let _=app.emit("file-progress",serde_json::json!({"sessionId":session_id,"sent":sent,"total":total}));
    }Ok(())
}
#[tauri::command]fn cancel_transfer(session_id:String,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{let r=state.runtime(&session_id)?;if let Some(t)=r.transfer.lock().unwrap().take(){t.cancel();}Ok(())}
#[tauri::command]fn import_config(path:Option<String>,state:tauri::State<'_,Arc<AppState>>)->Result<profile::ImportReport,String>{
    if state.runtimes.lock().unwrap().values().any(|r|!r.cancel.is_cancelled()){return Err("请先断开所有会话再导入配置".into());}
    let source=path.map(PathBuf::from).unwrap_or_else(profile::legacy_path);let bytes=std::fs::read(&source).map_err(|e|e.to_string())?;let value:serde_json::Value=serde_json::from_slice(&bytes).map_err(|e|e.to_string())?;
    let mut report=if value["version"]==1{profile::ImportReport{profile:serde_json::from_value(value).map_err(|e|e.to_string())?,skipped:vec![],warnings:vec![],backup:String::new()}}else{profile::convert_legacy(&value)?};
    let mut ids=std::collections::HashSet::new();if report.profile.sessions.iter().any(|s|s.id.is_empty()||!ids.insert(s.id.clone())||!["serial","tcp","udp","ssh"].contains(&s.kind.as_str())){return Err("导入配置包含重复 ID 或未知连接类型".into());}
    report.profile.known_hosts.clear();report.profile.import_dismissed=true;for s in &mut report.profile.sessions{s.remember_secret=false;}
    if state.read_only.load(Ordering::Acquire){backup_current(&state.dir)?;}
    let backup=state.dir.join(format!("import-original-{}.json",uuid::Uuid::new_v4()));std::fs::write(&backup,bytes).map_err(|e|e.to_string())?;
    report.backup=backup.to_string_lossy().into();profile::save(&state.dir,&report.profile)?;*state.profile.lock().unwrap()=report.profile.clone();state.read_only.store(false,Ordering::Release);Ok(report)
}
fn backup_current(dir:&std::path::Path)->Result<(),String>{let current=dir.join("config.json");if current.exists(){std::fs::copy(current,dir.join(format!("config-recovery-{}.json",uuid::Uuid::new_v4()))).map_err(|e|format!("原配置备份失败，未覆盖：{e}"))?;}Ok(())}
#[tauri::command]fn recover_profile(state:tauri::State<'_,Arc<AppState>>)->Result<Profile,String>{
    if state.runtimes.lock().unwrap().values().any(|r|!r.finished.load(Ordering::Acquire)){return Err("请先断开所有连接".into());}
    backup_current(&state.dir)?;let p=Profile::default();profile::save(&state.dir,&p)?;*state.profile.lock().unwrap()=p.clone();state.read_only.store(false,Ordering::Release);Ok(p)
}
#[tauri::command]fn export_config(path:String,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    let mut p=state.profile.lock().unwrap().clone();p.known_hosts.clear();for s in &mut p.sessions{s.remember_secret=false;}
    std::fs::write(path,serde_json::to_vec_pretty(&p).map_err(|e|e.to_string())?).map_err(|e|e.to_string())
}
#[tauri::command]fn ui_ready(window:tauri::WebviewWindow,state:tauri::State<'_,Arc<AppState>>)->Result<(),String>{
    window.show().map_err(|e|e.to_string())?;
    if let Some(file)=std::env::var_os("COMTOOL_RUST_READY_FILE"){std::fs::write(file,serde_json::to_vec(&serde_json::json!({"ready":true,"sessions":state.profile.lock().unwrap().sessions.len(),"pid":std::process::id()})).unwrap()).map_err(|e|e.to_string())?;}Ok(())
}
pub fn run(){
    let dir=profile::directory();let (loaded,startup_error)=match profile::load(&dir){Ok(p)=>(p,String::new()),Err(e)=>(Profile::default(),e)};
    let read_only=!startup_error.is_empty();let shared=Arc::new(AppState{dir,profile:Mutex::new(loaded),runtimes:Mutex::new(HashMap::new()),trust:Mutex::new(HashMap::new()),startup_error,closing:AtomicBool::new(false),next_generation:AtomicU64::new(0),read_only:AtomicBool::new(read_only)});
    tauri::Builder::default().plugin(tauri_plugin_dialog::init()).manage(shared.clone())
        .invoke_handler(tauri::generate_handler![bootstrap,save_profile,recover_profile,list_ports,statuses,connect_session,disconnect_session,send_input,send_bytes,send_terminal_input,resize_terminal,ack_data,respond_host_key,disconnect_peer,schedule_send,send_file,cancel_transfer,import_config,export_config,ui_ready])
        .on_window_event(move|window,event|if let tauri::WindowEvent::CloseRequested{api,..}=event{
            api.prevent_close();if shared.closing.swap(true,Ordering::AcqRel){return;}
            let runtimes:Vec<_>=shared.runtimes.lock().unwrap().values().cloned().collect();for r in &runtimes{r.cancel.cancel();}
            let closing_window=window.clone();tauri::async_runtime::spawn(async move{while runtimes.iter().any(|r|!r.finished.load(Ordering::Acquire)){tokio::time::sleep(Duration::from_millis(10)).await;}let _=closing_window.destroy();});
        })
        .run(tauri::generate_context!()).expect("ComTool desktop runtime failed");
}
