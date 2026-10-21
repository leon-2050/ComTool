// ComTool Rust rewrite, 2026-10-13; LGPL-3.0-only. Upstream: Neutree/COMTool.
use crate::model::*;
use anyhow::{Result, bail};
use std::{collections::HashMap, future::Future, pin::Pin, sync::{Arc, atomic::{AtomicU64,Ordering}}, time::Duration};
use tokio::{io::{AsyncRead,AsyncReadExt,AsyncWrite,AsyncWriteExt},net::{TcpListener,TcpStream,UdpSocket},sync::mpsc};
use tokio_util::sync::CancellationToken;

pub type TrustFn=Arc<dyn Fn(String)->Pin<Box<dyn Future<Output=Result<bool>>+Send>>+Send+Sync>;
#[derive(Clone)]
pub struct Events { pub state: Arc<dyn Fn(&str,String,Vec<String>)+Send+Sync>, pub trust:TrustFn, pub tx:Arc<AtomicU64>, pub dropped:Arc<AtomicU64>, pub sent:Arc<dyn Fn(&str,&[u8])+Send+Sync> }
impl Events { pub fn status(&self,state:&str,message:impl Into<String>,peers:Vec<String>){(self.state)(state,message.into(),peers)} }
async fn wait_token(token:Option<&CancellationToken>){if let Some(token)=token{token.cancelled().await}else{std::future::pending::<()>().await}}

pub async fn run(config:SessionConfig,secrets:Secrets,mut commands:mpsc::Receiver<Control>,cancel:CancellationToken,output:mpsc::Sender<Incoming>,events:Events)->Result<()> {
    match config.kind.as_str() {
        "tcp" if config.server=>tcp_server(config,&mut commands,cancel,output,events).await,
        "tcp"=>{
            let socket=tokio::select!{_ = cancel.cancelled()=>return Ok(()),v=tokio::time::timeout(Duration::from_secs(15),TcpStream::connect((config.host.as_str(),config.port)))=>v??};
            socket.set_nodelay(true)?;let peer=socket.peer_addr()?.to_string();events.status("connected",format!("已连接 {peer}"),vec![]);
            stream(socket,peer,&mut commands,cancel,output,events).await
        },
        "udp"=>udp(config,&mut commands,cancel,output,events).await,
        "serial"=>serial(config,commands,cancel,output,events).await,
        "ssh"=>ssh(config,secrets,&mut commands,cancel,output,events).await,
        _=>bail!("未知连接类型"),
    }
}
async fn stream<S:AsyncRead+AsyncWrite+Unpin>(socket:S,peer:String,commands:&mut mpsc::Receiver<Control>,cancel:CancellationToken,output:mpsc::Sender<Incoming>,events:Events)->Result<()> {
    let (mut reader,mut writer)=tokio::io::split(socket);let mut buffer=vec![0u8;65536];
    loop { tokio::select!{
        _=cancel.cancelled()=>break,
        command=commands.recv()=>match command {
            Some(Control::Send{bytes,token,..})=>{let mut offset=0;while offset<bytes.len(){let written=tokio::select!{_=cancel.cancelled()=>return Ok(()),_=wait_token(token.as_ref())=>break,r=writer.write(&bytes[offset..])=>r?};if written==0{bail!("远端停止接收数据");}events.tx.fetch_add(written as u64,Ordering::Relaxed);(events.sent)(&peer,&bytes[offset..offset+written]);offset+=written;}},
            None=>break,_=>{},
        },
        read=reader.read(&mut buffer)=>{let count=read?;if count==0{break;}
            tokio::select!{_=cancel.cancelled()=>break,r=output.send(Packet{peer:peer.clone(),bytes:buffer[..count].to_vec(),datagram:false}.into())=>if r.is_err(){break;}}
        }
    }}
    let _=writer.shutdown().await;Ok(())
}
async fn tcp_server(config:SessionConfig,commands:&mut mpsc::Receiver<Control>,cancel:CancellationToken,output:mpsc::Sender<Incoming>,events:Events)->Result<()> {
    let listener=TcpListener::bind((config.bind_host.as_str(),config.bind_port)).await?;
    events.status("connected",format!("监听 {}",listener.local_addr()?),vec![]);
    let mut clients:HashMap<String,(mpsc::Sender<Control>,CancellationToken)>=HashMap::new();
    let mut jobs=tokio::task::JoinSet::new();
    loop{tokio::select!{
        _=cancel.cancelled()=>break,
        accepted=listener.accept()=>{let(socket,address)=accepted?;socket.set_nodelay(true)?;let peer=address.to_string();
            let(tx,mut rx)=mpsc::channel(128);let token=cancel.child_token();clients.insert(peer.clone(),(tx,token.clone()));
            let out=output.clone();let ev=events.clone();jobs.spawn(async move{let result=stream(socket,peer.clone(),&mut rx,token,out,ev).await;(peer,result)});
            events.status("connected","客户端已连接",clients.keys().cloned().collect());
        },
        Some(done)=jobs.join_next(),if !jobs.is_empty()=>{let(peer,result)=done?;clients.remove(&peer);events.status("connected",if let Err(e)=result{format!("{peer}: {e}")}else{format!("{peer} 已断开")},clients.keys().cloned().collect());},
        command=commands.recv()=>match command {
            Some(Control::Send{bytes,peer,token})=>{if token.as_ref().is_some_and(CancellationToken::is_cancelled){continue;}let targets:Vec<_>=clients.iter().filter(|(p,_)|peer.as_ref().is_none_or(|target|target==*p)).map(|(_,v)|v.0.clone()).collect();
                if targets.is_empty(){events.status("connected","没有可发送的客户端",clients.keys().cloned().collect());}
                for client in targets{tokio::select!{_=cancel.cancelled()=>break,_=wait_token(token.as_ref())=>break,r=client.send(Control::Send{bytes:bytes.clone(),peer:None,token:token.clone()})=>{let _=r;}}}
            },
            Some(Control::DisconnectPeer(peer))=>{if let Some((_,token))=clients.get(&peer){token.cancel();}},None=>break,_=>{}
        }
    }}
    cancel.cancel();jobs.abort_all();while jobs.join_next().await.is_some(){};Ok(())
}
async fn udp(config:SessionConfig,commands:&mut mpsc::Receiver<Control>,cancel:CancellationToken,output:mpsc::Sender<Incoming>,events:Events)->Result<()> {
    let socket=UdpSocket::bind((config.bind_host.as_str(),config.bind_port)).await?;
    events.status("connected",format!("UDP 本地 {}",socket.local_addr()?),vec![]);let mut buffer=vec![0u8;65536];
    loop{tokio::select!{
        _=cancel.cancelled()=>break,
        read=socket.recv_from(&mut buffer)=>{let(count,peer)=read?;
            if let Err(error)=output.try_send(Packet{peer:peer.to_string(),bytes:buffer[..count].to_vec(),datagram:true}.into()){
                if matches!(error,mpsc::error::TrySendError::Closed(_)){break;}let dropped=events.dropped.fetch_add(1,Ordering::Relaxed)+1;
                if dropped==1||dropped.is_power_of_two(){events.status("connected",format!("接收队列溢出，已丢弃 {dropped} 个 UDP 报文"),vec![]);}
            }
        },
        command=commands.recv()=>match command {
            Some(Control::Send{bytes,peer,token})=>{if token.as_ref().is_some_and(CancellationToken::is_cancelled){continue;}if bytes.len()>65507{events.status("connected","UDP 单个报文不能超过 65507 字节",vec![]);continue;}
                let target=peer.unwrap_or_else(||if config.host.contains(':'){format!("[{}]:{}",config.host.trim_matches(['[',']']),config.port)}else{format!("{}:{}",config.host,config.port)});let sent=socket.send_to(&bytes,&target).await?;
                events.tx.fetch_add(sent as u64,Ordering::Relaxed);(events.sent)(&target,&bytes[..sent]);
            },None=>break,_=>{}
        }
    }}Ok(())
}
async fn serial(config:SessionConfig,mut commands:mpsc::Receiver<Control>,cancel:CancellationToken,output:mpsc::Sender<Incoming>,events:Events)->Result<()> {
    tokio::task::spawn_blocking(move||->Result<()>{
        use std::io::{Read,Write};
        let mut port=serialport::new(&config.device,config.baud).timeout(Duration::from_millis(10))
            .data_bits(match config.data_bits{5=>serialport::DataBits::Five,6=>serialport::DataBits::Six,7=>serialport::DataBits::Seven,_=>serialport::DataBits::Eight})
            .parity(match config.parity.as_str(){"odd"=>serialport::Parity::Odd,"even"=>serialport::Parity::Even,_=>serialport::Parity::None})
            .stop_bits(if config.stop_bits=="2"{serialport::StopBits::Two}else{serialport::StopBits::One})
            .flow_control(match config.flow.as_str(){"software"=>serialport::FlowControl::Software,"hardware"=>serialport::FlowControl::Hardware,_=>serialport::FlowControl::None})
            .open_native()?;
        #[cfg(windows)] set_windows_serial(&port,&config)?;
        #[cfg(not(windows))] if config.parity=="mark"||config.parity=="space"||config.stop_bits=="1.5"||config.flow=="dsrdtr"{bail!("此串口设置暂仅支持 Windows");}
        use serialport::SerialPort;
        if config.flow!="hardware"{port.write_request_to_send(config.rts)?;}
        if config.flow!="dsrdtr"{port.write_data_terminal_ready(config.dtr)?;}
        events.status("connected",format!("{} · {} baud",config.device,config.baud),vec![]);
        let mut buffer=vec![0u8;65536];
        while !cancel.is_cancelled(){
            while let Ok(command)=commands.try_recv(){if let Control::Send{bytes,token,..}=command{let mut offset=0;while offset<bytes.len()&&!cancel.is_cancelled()&&!token.as_ref().is_some_and(CancellationToken::is_cancelled){let written=port.write(&bytes[offset..])?;if written==0{bail!("串口无法继续发送");}events.tx.fetch_add(written as u64,Ordering::Relaxed);(events.sent)(&config.device,&bytes[offset..offset+written]);offset+=written;}}}
            match port.read(&mut buffer){
                Ok(0)=>{},Ok(count)=>if let Err(error)=output.try_send(Packet{peer:config.device.clone(),bytes:buffer[..count].to_vec(),datagram:false}.into()){
                    if matches!(error,mpsc::error::TrySendError::Closed(_)){break;}events.dropped.fetch_add(count as u64,Ordering::Relaxed);bail!("串口接收队列溢出，连接已停止；请降低数据率或启用设备流控");
                },Err(e) if e.kind()==std::io::ErrorKind::TimedOut=>{},Err(e)=>return Err(e.into()),
            }
        }Ok(())
    }).await?
}
#[cfg(windows)]
fn set_windows_serial(port:&serialport::COMPort,config:&SessionConfig)->Result<()>{
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Devices::Communication::{DCB,GetCommState,SetCommState};
    let handle=port.as_raw_handle();let mut dcb:DCB=unsafe{std::mem::zeroed()};dcb.DCBlength=std::mem::size_of::<DCB>() as u32;
    if unsafe{GetCommState(handle,&mut dcb)}==0{return Err(std::io::Error::last_os_error().into());}
    dcb.Parity=match config.parity.as_str(){"odd"=>1,"even"=>2,"mark"=>3,"space"=>4,_=>0};
    dcb.StopBits=match config.stop_bits.as_str(){"1.5"=>1,"2"=>2,_=>0};
    // Win32 DCB flags: fParity bit1, fOutxDsrFlow bit3, fDtrControl bits4–5.
    dcb._bitfield=if config.parity=="none"{dcb._bitfield&!(1<<1)}else{dcb._bitfield|(1<<1)};
    if config.flow=="dsrdtr"{dcb._bitfield=(dcb._bitfield&!(3<<4))|(1<<3)|(2<<4);}else{dcb._bitfield&=!(1<<3);}
    if unsafe{SetCommState(handle,&dcb)}==0{bail!("驱动拒绝所选串口参数：{}",std::io::Error::last_os_error());}
    let mut readback:DCB=unsafe{std::mem::zeroed()};readback.DCBlength=dcb.DCBlength;
    if unsafe{GetCommState(handle,&mut readback)}==0{return Err(std::io::Error::last_os_error().into());}
    let flow_mask=(1<<1)|(1<<2)|(1<<3)|(3<<4)|(1<<8)|(1<<9)|(3<<12);
    if readback.Parity!=dcb.Parity||readback.StopBits!=dcb.StopBits||readback.BaudRate!=dcb.BaudRate||readback.ByteSize!=dcb.ByteSize||(readback._bitfield&flow_mask)!=(dcb._bitfield&flow_mask){bail!("驱动没有应用请求的串口参数或流控设置");}Ok(())
}

struct SshHandler{trust:TrustFn}
impl russh::client::Handler for SshHandler{
    type Error=anyhow::Error;
    async fn check_server_key(&mut self,key:&russh::keys::PublicKeyOrCertificate)->Result<bool>{
        (self.trust)(key.public_key().fingerprint(russh::keys::HashAlg::Sha256).to_string()).await
    }
}
async fn ssh(config:SessionConfig,secrets:Secrets,commands:&mut mpsc::Receiver<Control>,cancel:CancellationToken,output:mpsc::Sender<Incoming>,events:Events)->Result<()> {
    let mut handle=tokio::select!{_=cancel.cancelled()=>return Ok(()),r=tokio::time::timeout(Duration::from_secs(120),russh::client::connect(Arc::new(russh::client::Config::default()),(config.host.as_str(),config.port),SshHandler{trust:events.trust.clone()}))=>r??};
    let authenticated=if !config.key_file.is_empty(){
        let key=russh::keys::load_secret_key(&config.key_file,if secrets.passphrase.is_empty(){None}else{Some(&secrets.passphrase)}).map_err(|e|anyhow::anyhow!("无法读取私钥，请检查口令与文件格式（推荐 OpenSSH 格式）：{e}"))?;
        let hash=handle.best_supported_rsa_hash().await?.flatten();
        handle.authenticate_publickey(&config.user,russh::keys::PrivateKeyWithHashAlg::new(Arc::new(key),hash)).await?.success()
    }else{handle.authenticate_password(&config.user,&secrets.password).await?.success()};
    if !authenticated{bail!("SSH 认证失败，请检查用户名、密码或私钥");}
    let mut channel=handle.channel_open_session().await?;
    channel.request_pty(true,"xterm-256color",80,24,0,0,&[]).await?;
    await_ssh_request(&mut channel,"PTY",&config.host,&output,&cancel).await?;
    channel.request_shell(true).await?;
    await_ssh_request(&mut channel,"shell",&config.host,&output,&cancel).await?;
    events.status("connected",format!("{}@{}:{}",config.user,config.host,config.port),vec![]);
    loop{tokio::select!{
        _=cancel.cancelled()=>break,
        command=commands.recv()=>match command{
            Some(Control::Send{bytes,token,..})=>{if token.as_ref().is_some_and(CancellationToken::is_cancelled){continue;}channel.data(&bytes[..]).await?;events.tx.fetch_add(bytes.len() as u64,Ordering::Relaxed);(events.sent)(&config.host,&bytes);},
            Some(Control::Resize{cols,rows})=>channel.window_change(cols.max(1),rows.max(1),0,0).await?,None=>break,_=>{}
        },
        message=channel.wait()=>match message{
            Some(russh::ChannelMsg::Data{data})|Some(russh::ChannelMsg::ExtendedData{data,..})=>{for chunk in data.chunks(65536){tokio::select!{_=cancel.cancelled()=>break,r=output.send(Packet{peer:config.host.clone(),bytes:chunk.to_vec(),datagram:false}.into())=>if r.is_err(){break;}}}},
            None|Some(russh::ChannelMsg::Eof)|Some(russh::ChannelMsg::Close)=>break,_=>{}
        }
    }}
    let _=channel.close().await;let _=handle.disconnect(russh::Disconnect::ByApplication,"ComTool disconnect","").await;Ok(())
}

async fn await_ssh_request(channel:&mut russh::Channel<russh::client::Msg>,request:&str,peer:&str,output:&mpsc::Sender<Incoming>,cancel:&CancellationToken)->Result<()>{
    let deadline=tokio::time::Instant::now()+Duration::from_secs(10);
    loop{
        let message=tokio::select!{_=cancel.cancelled()=>bail!("SSH 连接已取消"),r=tokio::time::timeout_at(deadline,channel.wait())=>r.map_err(|_|anyhow::anyhow!("SSH {request} 请求超时"))?};
        match message{
            Some(russh::ChannelMsg::Success)=>return Ok(()),
            Some(russh::ChannelMsg::Failure)=>bail!("SSH 服务端拒绝 {request} 请求"),
            Some(russh::ChannelMsg::Data{data})|Some(russh::ChannelMsg::ExtendedData{data,..})=>for chunk in data.chunks(65536){tokio::select!{_=cancel.cancelled()=>bail!("SSH 连接已取消"),r=output.send(Packet{peer:peer.into(),bytes:chunk.to_vec(),datagram:false}.into())=>r?};},
            None|Some(russh::ChannelMsg::Close)|Some(russh::ChannelMsg::Eof)=>bail!("SSH 通道在 {request} 请求期间关闭"),
            _=>{}
        }
    }
}

#[cfg(test)]mod tests{
    use super::*;
    fn events()->Events{Events{state:Arc::new(|_,_,_|{}),trust:Arc::new(|_|Box::pin(async{Ok(true)})),tx:Arc::new(AtomicU64::new(0)),dropped:Arc::new(AtomicU64::new(0)),sent:Arc::new(|_,_|{})}}
    #[tokio::test]async fn tcp_exact_bytes_and_cancellation(){
        let listener=TcpListener::bind("127.0.0.1:0").await.unwrap();let port=listener.local_addr().unwrap().port();
        let echo=tokio::spawn(async move{let(mut s,_)=listener.accept().await.unwrap();let mut b=vec![0;65536];loop{let n=s.read(&mut b).await.unwrap();if n==0{break;}s.write_all(&b[..n]).await.unwrap();}});
        let(tx,rx)=mpsc::channel(8);let(out,mut input)=mpsc::channel(8);let token=CancellationToken::new();
        let config=SessionConfig{kind:"tcp".into(),port,..SessionConfig::default()};let task=tokio::spawn(run(config,Secrets::default(),rx,token.clone(),out,events()));
        let expected:Vec<u8>=(0..200000).map(|n|(n%256)as u8).collect();tx.send(Control::Send{bytes:expected.clone(),peer:None,token:None}).await.unwrap();
        let mut got=vec![];while got.len()<expected.len(){let Incoming::Data(p)=tokio::time::timeout(Duration::from_secs(5),input.recv()).await.unwrap().unwrap() else{panic!("unexpected fence")};assert!(!p.datagram);got.extend(p.bytes);}
        assert_eq!(got,expected);token.cancel();tokio::time::timeout(Duration::from_secs(2),task).await.unwrap().unwrap().unwrap();echo.await.unwrap();
    }
    #[tokio::test]async fn udp_keeps_datagram_boundaries(){
        let remote=UdpSocket::bind("127.0.0.1:0").await.unwrap();let port=remote.local_addr().unwrap().port();
        let(tx,rx)=mpsc::channel(8);let(out,mut input)=mpsc::channel(8);let token=CancellationToken::new();let config=SessionConfig{kind:"udp".into(),port,bind_host:"127.0.0.1".into(),bind_port:0,..SessionConfig::default()};
        let task=tokio::spawn(run(config,Secrets::default(),rx,token.clone(),out,events()));
        tx.send(Control::Send{bytes:vec![1,2,3],peer:None,token:None}).await.unwrap();let mut buf=[0;16];let(n,from)=remote.recv_from(&mut buf).await.unwrap();assert_eq!(&buf[..n],&[1,2,3]);
        remote.send_to(&[4,5],from).await.unwrap();remote.send_to(&[6],from).await.unwrap();
        let Incoming::Data(a)=input.recv().await.unwrap() else{panic!("unexpected fence")};let Incoming::Data(b)=input.recv().await.unwrap() else{panic!("unexpected fence")};assert!(a.datagram&&b.datagram);assert_eq!(a.bytes,vec![4,5]);assert_eq!(b.bytes,vec![6]);
        token.cancel();task.await.unwrap().unwrap();
    }
}
