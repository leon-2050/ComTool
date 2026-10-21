// ComTool Rust rewrite, 2026-10-13. LGPL-3.0-only; upstream Neutree/COMTool.
import {lazy,Suspense,useCallback,useEffect,useRef,useState,type SetStateAction} from 'react';
import {ArrowDownToLine,ArrowUpFromLine,ArrowRightLeft,Check,ChevronDown,Copy,Download,FolderOpen,History,Menu,Minus,Moon,Network,PanelLeft,Plug,Plus,Search,Send,Square,Sun,Terminal as TerminalIcon,Trash2,Upload,X} from 'lucide-react';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {open,save} from '@tauri-apps/plugin-dialog';
import {call,channel,native,onEvent} from './api';
import {defaultProfile,defaultSession,normalizeSessionView,emptyStatus,formatBytes,KIND_LABEL,type ConnectionStatus,type DataFrame,type HostKey,type Kind,type Profile,type Secrets,type Session} from './types';
import {ReceiveBuffer} from './buffer';
import {connectionConfig,connectionKeys,connectionChanged,sameIdentity,type ConnectionDraft} from './connection';
import Settings from './Settings';
import ReceivePane from './ReceivePane';
import type {TerminalHandle} from './TerminalPane';
const TerminalPane=lazy(()=>import('./TerminalPane'));
const blankSecret=():Secrets=>({password:'',passphrase:''});
const stateLabels:Record<string,string>={disconnected:'未连接',connecting:'连接中',connected:'已连接',reconnecting:'等待重连',error:'连接错误'};
function KindIcon({kind,size=18}:{kind:Kind;size?:number}){return kind==='ssh'?<TerminalIcon size={size}/>:kind==='serial'?<ArrowRightLeft size={size}/>:<Network size={size}/>}
export default function App(){
  const[profile,setRawProfile]=useState<Profile|null>(null);
  const setProfile=useCallback((action:SetStateAction<Profile|null>)=>setRawProfile(previous=>{const next=typeof action==='function'?action(previous):action;return next?{...next,sessions:next.sessions.map(normalizeSessionView)}:null;}),[]);const[status,setStatus]=useState<Record<string,ConnectionStatus>>({});
  const[sidebar,setSidebar]=useState(()=>!window.matchMedia('(max-width:1100px)').matches);const[filter,setFilter]=useState('');const[newMenu,setNewMenu]=useState(false);const[menu,setMenu]=useState(false);
  const[toast,setToast]=useState('');const[hostKeys,setHostKeys]=useState<HostKey[]>([]);const hostKey=hostKeys[0]||null;const[legacy,setLegacy]=useState(false);const[closing,setClosing]=useState<Session|null>(null);
  const[renaming,setRenaming]=useState<Session|null>(null);const[renameText,setRenameText]=useState('');
  const[recoveryError,setRecoveryError]=useState('');
  const[terminalReady,setTerminalReady]=useState(0);const readinessSent=useRef(false);const visitedTerminals=useRef(new Set<string>());
  const[tick,setTick]=useState(0);const[input,setInput]=useState<Record<string,string>>({});const[peers,setPeers]=useState<Record<string,string>>({});const[schedule,setSchedule]=useState<Record<string,boolean>>({});const[interval,setIntervalMs]=useState(300);const[terminalSearch,setTerminalSearch]=useState('');
  const[secretVersion,setSecretVersion]=useState(0);const[progress,setProgress]=useState<Record<string,{sent:number;total:number}>>({});
  const profiles=useRef<Profile|null>(null);profiles.current=profile;const buffers=useRef(new Map<string,ReceiveBuffer>());const terminals=useRef(new Map<string,TerminalHandle>());const secrets=useRef(new Map<string,Secrets>());const saving=useRef(Promise.resolve());const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const[drafts,setDrafts]=useState<Record<string,ConnectionDraft>>({});const draftRef=useRef(drafts);draftRef.current=drafts;
  const[applying,setApplying]=useState<Record<string,boolean>>({});
  const[configMessages,setConfigMessages]=useState<Record<string,{error:boolean;text:string}>>({});
  const pending=useRef(new Map<string,{config:Session;generation:number;done:boolean;settled:boolean}>());
  const appliedGenerations=useRef(new Map<string,number>());const actions=useRef(new Set<string>());const running=useRef(new Map<string,Session>());
  const dirty=useRef(false);const liveStatuses=useRef(status);liveStatuses.current=status;
  const generations=useRef<Record<string,number>>({});const livePeers=useRef(peers);livePeers.current=peers;
  const report=useCallback((e:unknown)=>{setToast(String(e));if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),8000)},[]);
  const register=useCallback((id:string,handle:TerminalHandle|null)=>{if(handle){const s=profiles.current?.sessions.find(s=>s.id===id);const peer=livePeers.current[id];const rows=buffers.current.get(id)?.rows||[];for(const row of rows)if(row.epoch===(buffers.current.get(id)?.epoch||0)&&(!(s?.kind==='tcp'&&s.server)||row.peer===peer))void handle.write(row.bytes).catch(report);terminals.current.set(id,handle);setTerminalReady(n=>n+1)}else terminals.current.delete(id)},[]);
  const bufferFor=(id:string)=>{let buffer=buffers.current.get(id);if(!buffer){buffer=new ReceiveBuffer();buffers.current.set(id,buffer)}return buffer};
  const queue=<T,>(operation:()=>Promise<T>):Promise<T>=>{const result=saving.current.then(operation);saving.current=result.then(()=>{},()=>{});return result;};
  const saveCurrent=()=>queue(async()=>{if(profiles.current)await call('save_profile',{profile:profiles.current});});
  const focusConfig=()=>{const panel=document.querySelector<HTMLElement>('.drawer');panel?.focus();panel?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled)')?.focus();};
  const finishApply=(id:string)=>{const item=pending.current.get(id);if(item?.done&&item.settled){pending.current.delete(id);actions.current.delete(id);setApplying(old=>({...old,[id]:false}));}};
  const acceptStatus=(s:ConnectionStatus)=>{
    if(s.generation<(generations.current[s.sessionId]||0))return;
    const previous=liveStatuses.current[s.sessionId];
    const boundary=s.generation>(generations.current[s.sessionId]||0)||(s.state==='connecting'&&previous?.state==='reconnecting');
    if(boundary){bufferFor(s.sessionId).resetDecoders();terminals.current.get(s.sessionId)?.clear();setPeers(old=>({...old,[s.sessionId]:''}));setProgress(old=>{const next={...old};delete next[s.sessionId];return next;});}
    generations.current[s.sessionId]=s.generation;liveStatuses.current={...liveStatuses.current,[s.sessionId]:s};setStatus(liveStatuses.current);
    if(s.state!=='connected'){setSchedule(old=>({...old,[s.sessionId]:false}));setProgress(old=>{const next={...old};delete next[s.sessionId];return next;});}
    if(['error','disconnected'].includes(s.state))setHostKeys(old=>old.filter(k=>k.sessionId!==s.sessionId));
    const item=pending.current.get(s.sessionId);
    if(item&&s.generation>item.generation){
      running.current.set(s.sessionId,item.config);appliedGenerations.current.set(s.sessionId,s.generation);
      if(['connected','error','reconnecting','disconnected'].includes(s.state)){
        item.settled=true;setConfigMessages(old=>({...old,[s.sessionId]:{error:s.state!=='connected',text:s.state==='connected'?'参数已生效':s.message}}));finishApply(s.sessionId);
      }
    }else if(!item&&appliedGenerations.current.get(s.sessionId)===s.generation&&['connected','error','reconnecting','disconnected'].includes(s.state)){
      setConfigMessages(old=>({...old,[s.sessionId]:{error:s.state!=='connected',text:s.state==='connected'?'参数已生效':s.message}}));
    }
  };
  useEffect(()=>{
    let stop=false;const unsubscribe:(()=>void)[]=[];
    async function boot(){
      try{
        unsubscribe.push(await onEvent<ConnectionStatus>('connection-status',acceptStatus));
        unsubscribe.push(await onEvent<HostKey>('host-key',key=>{if(key.generation===(generations.current[key.sessionId]||0))setHostKeys(old=>[...old.filter(k=>k.sessionId!==key.sessionId),key]);}));
        unsubscribe.push(await onEvent<{sessionId:string;generation:number;sent:number;total:number}>('file-progress',p=>{if(p.generation===(generations.current[p.sessionId]||0)&&liveStatuses.current[p.sessionId]?.state==='connected'&&!actions.current.has(p.sessionId))setProgress(old=>({...old,[p.sessionId]:p}));}));
        if(native){const boot=await call<{profile:Profile;legacyAvailable:boolean;startupError:string}>('bootstrap');if(stop)return;setProfile(boot.profile);setLegacy(!boot.startupError&&boot.legacyAvailable&&!boot.profile.importDismissed);if(boot.startupError)setRecoveryError(boot.startupError);}
        else{setProfile(defaultProfile());}
      }catch(e){report(e)}
    }void boot();
    const paint=setInterval(()=>{if(dirty.current){dirty.current=false;setTick(n=>n+1)}},50);const stats=setInterval(()=>{if(native&&Object.values(liveStatuses.current).some(s=>['connected','connecting','reconnecting'].includes(s.state)))void call<ConnectionStatus[]>('statuses').then(values=>{for(const value of values)acceptStatus(value)}).catch(report)},500);
    return()=>{stop=true;unsubscribe.forEach(fn=>fn());clearInterval(paint);clearInterval(stats);if(toastTimer.current)clearTimeout(toastTimer.current)};
  },[]);
  useEffect(()=>{if(!profile)return;document.documentElement.dataset.theme=profile.theme;if(native&&!recoveryError){const timer=setTimeout(()=>{void saveCurrent().catch(report)},250);return()=>clearTimeout(timer)}},[profile,recoveryError]);
  useEffect(()=>{if(profile&&native&&!readinessSent.current&&profile.sessions.filter(s=>s.view==='terminal').every(s=>terminals.current.has(s.id))){readinessSent.current=true;void call('ui_ready').catch(report)}},[!!profile,terminalReady]);
  const selected=profile?.sessions.find(s=>s.id===profile.activeId)||profile?.sessions[0];
  const update=(changes:Partial<Profile>)=>setProfile(p=>p?{...p,...changes}:p);
  const patch=(values:Partial<Session>)=>{if(selected&&!actions.current.has(selected.id))setProfile(p=>p?{...p,sessions:p.sessions.map(s=>s.id===selected.id?{...s,...values}:s)}:p)};
  const putDraft=(session:Session,draft:ConnectionDraft)=>{
    const next={...draftRef.current};
    if(connectionChanged(session,secrets.current.get(session.id)||blankSecret(),draft))next[session.id]=draft;else delete next[session.id];
    draftRef.current=next;setDrafts(next);
  };
  const patchSettings=(values:Partial<Session>)=>{
    if(!selected||actions.current.has(selected.id))return;
    const id=selected.id;const staging=!!draftRef.current[id]||['connected','connecting','reconnecting'].includes(liveStatuses.current[id]?.state);
    const connection=Object.fromEntries(Object.entries(values).filter(([key])=>connectionKeys.includes(key as typeof connectionKeys[number])));
    if(values.kind&&values.kind!=='tcp'&&values.kind!=='udp')connection.server=false;
    const immediate=Object.fromEntries(Object.entries(values).filter(([key])=>!connectionKeys.includes(key as typeof connectionKeys[number])));
    if(Object.keys(immediate).length)patch(immediate);
    if(!Object.keys(connection).length)return;
    if(staging){
      const before=draftRef.current[id]||{config:connectionConfig(selected),secrets:secrets.current.get(id)||blankSecret()};
      const config={...before.config,...connection};const secret=sameIdentity(before.config,config)?before.secrets:blankSecret();
      putDraft(selected,{config,secrets:secret});
    }else{if(!sameIdentity(connectionConfig(selected),{...connectionConfig(selected),...connection}))secrets.current.set(id,blankSecret());patch(connection);}
    setConfigMessages(old=>({...old,[id]:{error:false,text:''}}));
  };
  const editSecrets=(value:Secrets)=>{
    if(!selected||actions.current.has(selected.id))return;const id=selected.id;setConfigMessages(old=>({...old,[id]:{error:false,text:''}}));
    if(draftRef.current[id]||['connected','connecting','reconnecting'].includes(liveStatuses.current[id]?.state)){
      const before=draftRef.current[id]||{config:connectionConfig(selected),secrets:secrets.current.get(id)||blankSecret()};
      putDraft(selected,{...before,secrets:value});
    }else{secrets.current.set(id,value);setSecretVersion(n=>n+1);}
  };
  const undoSettings=()=>{if(!selected)return;const next={...draftRef.current};delete next[selected.id];draftRef.current=next;setDrafts(next);setConfigMessages(old=>({...old,[selected.id]:{error:false,text:''}}));};
  const applyConnection=async(id:string)=>{
    const session=profiles.current?.sessions.find(s=>s.id===id);const draft=draftRef.current[id];
    if(!native||!session||!draft||actions.current.has(id))return;
    actions.current.add(id);appliedGenerations.current.delete(id);setApplying(old=>({...old,[id]:true}));setConfigMessages(old=>({...old,[id]:{error:false,text:'正在应用…'}}));
    const candidate={...session,...draft.config};const item={config:candidate,generation:generations.current[id]||0,done:false,settled:false};pending.current.set(id,item);
    try{
      await queue(async()=>{
        await call('save_profile',{profile:profiles.current});
        const result=await call<{saved:boolean;generation:number|null;error:string|null}>('apply_connection_config',{sessionId:id,config:candidate,secrets:draft.secrets,onData:channel(receive)});
        if(result.saved){
          const current=profiles.current!;const next={...current,sessions:current.sessions.map(s=>s.id===id?{...s,...draft.config}:s)};profiles.current=next;setProfile(next);
          secrets.current.set(id,draft.secrets);const remaining={...draftRef.current};delete remaining[id];draftRef.current=remaining;setDrafts(remaining);
        }
        if(result.error)throw new Error(result.error);
        for(const value of await call<ConnectionStatus[]>('statuses'))acceptStatus(value);
      });
      item.done=true;finishApply(id);
    }catch(e){pending.current.delete(id);actions.current.delete(id);setApplying(old=>({...old,[id]:false}));setConfigMessages(old=>({...old,[id]:{error:true,text:String(e)}}));}
  };
  const add=(kind:Kind)=>{const s=defaultSession(kind);setProfile(p=>p?{...p,sessions:[...p.sessions,s],activeId:s.id}:p);setNewMenu(false);if(window.matchMedia('(max-width:1100px)').matches)setSidebar(false)};
  const receive=(frame:DataFrame)=>{
    const acknowledge=()=>native?call('ack_data',{sessionId:frame.sessionId,generation:frame.generation,sequence:frame.sequence}):Promise.resolve();
    if(frame.generation!==undefined&&frame.generation<(generations.current[frame.sessionId]||0)){void acknowledge().catch(report);return;}
    if(frame.generation!==undefined&&frame.generation>(generations.current[frame.sessionId]||0)){bufferFor(frame.sessionId).resetDecoders();terminals.current.get(frame.sessionId)?.clear();generations.current[frame.sessionId]=frame.generation;}
    const applyingConfig=pending.current.get(frame.sessionId);
    const current=applyingConfig&&frame.generation!==undefined&&frame.generation>applyingConfig.generation?applyingConfig.config:profiles.current?.sessions.find(s=>s.id===frame.sessionId);
    if(!current){void acknowledge().catch(report);return;}
    const buffer=bufferFor(frame.sessionId);buffer.setEncoding(current.encoding);buffer.append(frame);dirty.current=true;
    const t=terminals.current.get(frame.sessionId);const renderTerminal=!(current.kind==='tcp'&&current.server)||livePeers.current[frame.sessionId]===frame.peerId;
    const done=t&&renderTerminal?t.write(new Uint8Array(frame.bytes)):Promise.resolve();
    void done.then(acknowledge).catch(report);
  };
  useEffect(()=>{if(import.meta.env.DEV){Object.assign(window,{__COMTOOL_QA:{injectData:receive,setProfile,setStatus:(values:Record<string,ConnectionStatus>)=>Object.values(values).forEach(acceptStatus),profile:()=>profiles.current,copyTerminal:(id:string)=>terminals.current.get(id)?.copy()}});return()=>{delete (window as unknown as Record<string,unknown>).__COMTOOL_QA}}},[]);
  const connect=async()=>{if(!selected||actions.current.has(selected.id))return;const id=selected.id;const s=liveStatuses.current[id]||emptyStatus(id);
    if(!['connected','connecting','reconnecting'].includes(s.state)&&connectionChanged(selected,secrets.current.get(id)||blankSecret(),draftRef.current[id])){await applyConnection(id);return;}
    actions.current.add(id);setConfigMessages(old=>({...old,[id]:{error:false,text:''}}));setApplying(old=>({...old,[id]:true}));try{
      if(['connected','connecting','reconnecting'].includes(s.state)){await call('disconnect_session',{sessionId:id});return;}
      await queue(async()=>{await call('save_profile',{profile:profiles.current});running.current.set(id,profiles.current!.sessions.find(s=>s.id===id)!);bufferFor(id).clear();terminals.current.get(id)?.clear();await call('connect_session',{sessionId:id,secrets:secrets.current.get(id)||blankSecret(),onData:channel(receive)});});
    }catch(e){report(e)}finally{actions.current.delete(id);setApplying(old=>({...old,[id]:false}));}};
  const send=async(text?:string)=>{if(!selected||actions.current.has(selected.id))return;const value=text??input[selected.id]??'';try{
    if(!pending.current.size)await saveCurrent();await call('send_input',{sessionId:selected.id,text:value,peer:peers[selected.id]||null});
    const history=[value,...selected.history.filter(s=>s!==value)].slice(0,100);patch({history});
  }catch(e){report(e)}};
  const closeSession=async(s:Session)=>{if(actions.current.has(s.id))return;try{
    if(native&&status[s.id]&&['connected','connecting','reconnecting'].includes(status[s.id].state))await call('disconnect_session',{sessionId:s.id});
    setProfile(p=>{if(!p)return p;const sessions=p.sessions.filter(item=>item.id!==s.id);return{...p,sessions,activeId:p.activeId===s.id?(sessions[0]?.id||''):p.activeId}});
    secrets.current.delete(s.id);buffers.current.delete(s.id);running.current.delete(s.id);const remaining={...draftRef.current};delete remaining[s.id];draftRef.current=remaining;setDrafts(remaining);setClosing(null);
  }catch(e){report(e)}};
  const requestClose=(s:Session)=>{if(actions.current.has(s.id))return;if(['connected','connecting','reconnecting'].includes(status[s.id]?.state))setClosing(s);else void closeSession(s)};
  const rename=()=>{if(!renaming||!renameText.trim())return;setProfile(p=>p?{...p,sessions:p.sessions.map(s=>s.id===renaming.id?{...s,name:renameText.trim()}:s)}:p);setRenaming(null)};
  const importProfile=async(path?:string)=>{if(actions.current.size)return;try{const result=await call<{profile:Profile;skipped:string[];warnings:string[];backup:string}>('import_config',{path:path||null});setProfile(result.profile);setLegacy(false);setRecoveryError('');buffers.current.clear();secrets.current.clear();draftRef.current={};setDrafts({});running.current.clear();report([`已导入 ${result.profile.sessions.length} 个会话`,result.skipped.length?`暂不支持的会话：${result.skipped.join('、')}`:'',...result.warnings].filter(Boolean).join('；'))}catch(e){report(e)}};
  useEffect(()=>{const media=window.matchMedia('(max-width:1100px)');const resize=()=>setSidebar(!media.matches);media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);},[]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.ctrlKey&&e.key==='Enter'&&selected?.view==='receive'){e.preventDefault();void send()}if(e.ctrlKey&&e.key.toLowerCase()==='n'){e.preventDefault();add('serial')}if(e.ctrlKey&&e.key===','){e.preventDefault();focusConfig()}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[selected,input,peers,drafts]);
  if(!profile)return <div className="boot-message">正在载入 ComTool…{toast&&<p>{toast}</p>}</div>;
  for(const s of profile.sessions)if(s.view==='terminal')visitedTerminals.current.add(s.id);
  const activeStatus=selected?(status[selected.id]||emptyStatus(selected.id)):emptyStatus('');const isApplying=!!selected&&!!applying[selected.id];const connected=activeStatus.state==='connected'&&!isApplying;const busy=['connected','connecting','reconnecting'].includes(activeStatus.state);
  const shown=selected&&busy?(running.current.get(selected.id)||selected):selected;
  const summary=shown?shown.kind==='serial'?`${shown.device||'未选择端口'} / ${shown.baud} baud`:shown.server?`${shown.bindHost}:${shown.bindPort} / ${shown.kind==='tcp'?'服务端':'监听'}`:`${shown.kind==='ssh'&&shown.user?`${shown.user}@`:''}${shown.host}:${shown.port}`:'';
  const draft=selected?drafts[selected.id]:undefined;const effective=selected&&draft?{...selected,...draft.config}:selected;
  const changed=!!selected&&connectionChanged(selected,secrets.current.get(selected.id)||blankSecret(),draft);
  return <div className={`app-shell ${sidebar?'sidebar-open':'sidebar-hidden'} ${selected?'has-config':''}`}>
    <header className="app-header" data-tauri-drag-region><div className="brand" data-tauri-drag-region><img src="/brand.svg" alt="ComTool 会话连接图标"/><span data-tauri-drag-region>ComTool</span><span className="preview-label" data-tauri-drag-region>RUST PREVIEW</span></div><div className="header-actions">{!native&&<span className="preview-hint">界面预览</span>}<button className="icon-button" aria-label="切换主题" title="切换浅色 / 深色" onClick={()=>update({theme:profile.theme==='light'?'dark':'light'})}>{profile.theme==='light'?<Moon size={19}/>:<Sun size={19}/>}</button><div className="menu-wrapper"><button className="icon-button" aria-label="应用菜单" title="应用菜单" onClick={()=>setMenu(!menu)}><Menu size={19}/></button>{menu&&<div className="popover app-menu"><button disabled={!native||Object.values(applying).some(Boolean)} onClick={()=>{setMenu(false);void open({multiple:false,filters:[{name:'配置文件',extensions:['json']}]}).then(path=>{if(typeof path==='string')return importProfile(path)}).catch(report)}}><Upload size={16}/>导入配置</button><button disabled={!native} onClick={()=>{setMenu(false);void save({defaultPath:'ComTool-config.json'}).then(path=>{if(path)return call('export_config',{path})}).catch(report)}}><Download size={16}/>导出配置</button><a href="https://github.com/leon-2050/ComTool" target="_blank" rel="noreferrer">项目源码与许可</a></div>}</div>{native&&<div className="window-controls"><button aria-label="最小化" onClick={()=>void getCurrentWindow().minimize().catch(report)}><Minus size={16}/></button><button aria-label="最大化或还原" onClick={()=>void getCurrentWindow().toggleMaximize().catch(report)}><Square size={13}/></button><button className="window-close" aria-label="关闭程序" onClick={()=>void saveCurrent().then(()=>getCurrentWindow().close()).catch(report)}><X size={18}/></button></div>}</div></header>
    <section className="session-header"><button className="icon-button sidebar-toggle" aria-label="切换会话侧栏" onClick={()=>setSidebar(!sidebar)}><PanelLeft size={21}/></button><div className="session-heading"><h1>{selected?.name||'通信工作台'}</h1><p>{selected?`${KIND_LABEL[shown!.kind]} / ${summary}`:'创建会话，开始连接设备'}</p></div><div className="session-actions"><span className={`status-pill ${activeStatus.state}`}><i/>{stateLabels[activeStatus.state]}</span><button className={`primary-button ${busy?'disconnect':''}`} disabled={!selected||!native||isApplying} onClick={()=>void connect()}>{busy?<Square size={16}/>:<Plug size={19}/>}<span>{busy?'断开连接':'连接'}</span></button></div></section>
    <div className="workbench">
      <aside className="sidebar"><div className="sidebar-heading"><h2>会话</h2><div className="menu-wrapper"><button className="add-button" aria-label="新建会话" title="新建会话 · Ctrl+N" onClick={()=>setNewMenu(!newMenu)}><Plus size={21}/></button>{newMenu&&<div className="popover new-menu">{(['serial','tcp','udp','ssh'] as Kind[]).map(kind=><button key={kind} onClick={()=>add(kind)}><KindIcon kind={kind}/>{KIND_LABEL[kind]} 会话</button>)}</div>}</div></div><label className="session-search"><Search size={16}/><input placeholder="查找会话…" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="查找会话"/></label><div className="session-group"><ChevronDown size={13}/>已打开 <span>{profile.sessions.length}</span></div><nav className="session-list">{profile.sessions.filter(s=>`${s.name} ${s.host} ${s.device}`.toLowerCase().includes(filter.toLowerCase())).map(s=><button className={`session-item ${s.id===selected?.id?'active':''}`} key={s.id} onClick={()=>{update({activeId:s.id});if(window.matchMedia('(max-width:1100px)').matches)setSidebar(false)}}><KindIcon kind={s.kind}/><span><strong>{s.name}</strong><small>{s.kind==='serial'?s.device||'未选择端口':`${s.host}:${s.port}`}</small></span><i className={`session-dot ${status[s.id]?.state==='connected'?'on':''}`}/></button>)}</nav><div className="sidebar-footer"><span>{profile.sessions.length} 个会话</span><span className="local-badge"><Check size={12}/>本地运行</span></div></aside>
      {sidebar&&<button className="sidebar-backdrop" aria-label="收起会话侧栏" onClick={()=>setSidebar(false)}/>}
      <main className="main-pane"><div className="workspace-tabs"><div className="tabs-scroll">{profile.sessions.map(s=><div className={`workspace-tab ${s.id===selected?.id?'active':''}`} key={s.id}><button className="tab-label" title="双击重命名" onClick={()=>{update({activeId:s.id});if(window.matchMedia('(max-width:1100px)').matches)setSidebar(false)}} onDoubleClick={()=>{setRenaming(s);setRenameText(s.name)}}>{status[s.id]?.state==='connected'&&<i/>}{s.name}</button><button className="tab-close" disabled={!!applying[s.id]} aria-label={`关闭 ${s.name}`} title="关闭会话" onClick={()=>requestClose(s)}><X size={12}/></button></div>)}</div>{selected&&<select className="encoding-select" aria-label="字符编码" disabled={isApplying} value={selected.encoding} onChange={e=>patch({encoding:e.target.value})}>{['UTF-8','ASCII','UTF-16','GBK','GB2312','GB18030'].map(v=><option key={v}>{v}</option>)}</select>}</div>
        {!selected?<div className="welcome-panel"><img src="/brand.svg" alt=""/><h2>一个工作台，连接你的设备</h2><p>串口、网络与远程终端，都从这里开始。</p><div>{(['serial','tcp','udp','ssh'] as Kind[]).map(kind=><button className="welcome-button" key={kind} onClick={()=>add(kind)}><KindIcon kind={kind} size={23}/>{KIND_LABEL[kind]}</button>)}</div></div>:<>
          <section className="receive-card"><div className="card-heading"><div><h2>{selected.view==='terminal'?'交互终端':'接收监视'}</h2><p>{selected.view==='terminal'?'ANSI 色彩与远程交互':'实时接收设备数据'}</p></div><div className="card-tools">{selected.view==='receive'?<div className="segment"><button className={!selected.receiveHex?'active':''} onClick={()=>patch({receiveHex:false})}>文本</button><button className={selected.receiveHex?'active':''} onClick={()=>patch({receiveHex:true})}>HEX</button></div>:<input className="terminal-search" placeholder="搜索终端…" aria-label="搜索终端" value={terminalSearch} onChange={e=>{setTerminalSearch(e.target.value);terminals.current.get(selected.id)?.search(e.target.value)}}/>}<button className="icon-button" title="复制" aria-label="复制接收数据" onClick={()=>void navigator.clipboard.writeText(selected.view==='terminal'?terminals.current.get(selected.id)?.copy()||'':bufferFor(selected.id).text(selected.receiveHex,selected.timestamp)).catch(report)}><Copy size={18}/></button><button className="icon-button" title="清空" aria-label="清空接收数据" onClick={()=>{bufferFor(selected.id).clear();terminals.current.get(selected.id)?.clear();setTick(n=>n+1)}}><Trash2 size={18}/></button></div></div>
            {selected.kind==='tcp'&&selected.server&&selected.view==='terminal'&&<div className="terminal-peer"><label>交互客户端 <select aria-label="交互客户端" value={peers[selected.id]||''} onChange={e=>setPeers(old=>({...old,[selected.id]:e.target.value}))}><option value="">请选择一个客户端</option>{activeStatus.peers.map(peer=><option key={peer}>{peer}</option>)}</select></label><small>每次切换客户端会清空终端；完整接收记录仍保留。</small></div>}
            <div className="receive-body">{profile.sessions.map(s=><div className="session-views" key={s.id} style={{display:s.id===selected.id?'flex':'none'}}><div className="receive-view" style={{display:s.view==='receive'?'flex':'none'}}><ReceivePane session={s} buffer={bufferFor(s.id)} tick={tick}/></div><div className="terminal-view" style={{display:s.view==='terminal'?'flex':'none'}}>{visitedTerminals.current.has(s.id)&&<Suspense fallback={<div className="terminal-loading">正在载入终端…</div>}><TerminalPane session={s} peer={peers[s.id]||''} active={s.id===selected.id&&s.view==='terminal'} connected={status[s.id]?.state==='connected'&&!applying[s.id]} register={register} error={report}/></Suspense>}</div></div>)}</div>
          </section>
          {selected.view==='receive'&&<section className="send-card"><div className="card-heading"><div><h2>发送编辑</h2><p>编辑并发送下一条消息</p></div><div className="segment"><button className={!selected.sendHex?'active':''} onClick={()=>patch({sendHex:false})}>文本</button><button className={selected.sendHex?'active':''} onClick={()=>patch({sendHex:true})}>HEX</button></div></div><textarea value={input[selected.id]||''} onChange={e=>setInput(old=>({...old,[selected.id]:e.target.value}))} placeholder={selected.sendHex?'输入十六进制数据，例如 01 AF 32':'输入要发送的数据 · Ctrl+Enter'} aria-label="发送数据" spellCheck={false}/><div className="send-footer"><div className="send-left"><label className="history-picker"><History size={16}/><select value="" aria-label="发送历史" onChange={e=>setInput(old=>({...old,[selected.id]:e.target.value}))}><option value="">发送历史</option>{selected.history.map((value,index)=><option key={index} value={value}>{value.slice(0,70)}</option>)}</select></label><button className="icon-button" title="清空发送数据" aria-label="清空发送数据" onClick={()=>setInput(old=>({...old,[selected.id]:''}))}><Trash2 size={17}/></button><button className="icon-button" title="文件发送" aria-label="文件发送" disabled={!connected||!native} onClick={()=>void open({multiple:false}).then(path=>{if(typeof path==='string')return call('send_file',{sessionId:selected.id,path,peer:peers[selected.id]||null})}).catch(report)}><FolderOpen size={18}/></button><button className="icon-button" title="保存为自定义发送" aria-label="保存为自定义发送" onClick={()=>{const text=input[selected.id]||'';if(text&&!selected.presets.includes(text))patch({presets:[...selected.presets,text]})}}><Plus size={18}/></button></div><div className="send-right">{selected.server&&selected.kind==='tcp'&&<select aria-label="目标客户端" value={peers[selected.id]||''} onChange={e=>setPeers(old=>({...old,[selected.id]:e.target.value}))}><option value="">全部客户端</option>{activeStatus.peers.map(peer=><option key={peer}>{peer}</option>)}</select>}<label className="scheduled"><input type="checkbox" checked={schedule[selected.id]||false} disabled={!connected} onChange={e=>{const enabled=e.target.checked;void call('schedule_send',{sessionId:selected.id,text:input[selected.id]||'',intervalMs:interval,peer:peers[selected.id]||null,enabled}).then(()=>setSchedule(old=>({...old,[selected.id]:enabled}))).catch(report)}}/>定时</label><input className="interval-input" type="number" min="20" aria-label="定时发送间隔毫秒" value={interval} onChange={e=>setIntervalMs(Number(e.target.value))}/><small>ms</small><button className="primary-button send-button" disabled={!connected} onClick={()=>void send()}><Send size={16}/>发送</button></div></div>{selected.presets.length>0&&<div className="presets">{selected.presets.map((value,i)=><div key={i}><button disabled={!connected} title={value} onClick={()=>void send(value)}>{value.slice(0,30)||'空消息'}</button><button className="preset-close" title="删除自定义发送" onClick={()=>patch({presets:selected.presets.filter((_,j)=>j!==i)})}><X size={11}/></button></div>)}</div>}</section>}
          {progress[selected.id]&&<div className="file-transfer"><ArrowUpFromLine size={15}/><span>文件已排队 {formatBytes(progress[selected.id].sent)} / {formatBytes(progress[selected.id].total)}</span><button onClick={()=>void call('cancel_transfer',{sessionId:selected.id}).then(()=>setProgress(old=>{const copy={...old};delete copy[selected.id];return copy})).catch(report)}>停止</button></div>}
          <footer className="status-bar"><span className={activeStatus.state==='error'?'error-text':''} title={activeStatus.message}>{activeStatus.message}</span><div><span>TX <b>{formatBytes(activeStatus.tx)}</b></span><span>RX <b>{formatBytes(activeStatus.rx)}</b></span>{activeStatus.dropped>0&&<span className="error-text">丢弃 {activeStatus.dropped}</span>}</div></footer>
        </>}
      </main>
      {selected&&effective&&<Settings session={effective} secrets={draft?.secrets||secrets.current.get(selected.id)||blankSecret()} locked={busy} applying={isApplying} changed={changed} message={configMessages[selected.id]} patch={patchSettings} setSecrets={editSecrets} apply={()=>void applyConnection(selected.id)} undo={undoSettings} error={report}/>}

    </div>
    {toast&&<div className="toast" role="status"><span>{toast}</span><button className="icon-button" aria-label="关闭提示" onClick={()=>setToast('')}><X size={15}/></button></div>}
    {hostKey&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="确认 SSH 主机"><div className="modal-symbol"><TerminalIcon size={25}/></div><h2>确认 SSH 主机</h2><p>首次连接 <strong>{hostKey.host}</strong>，请核对主机指纹。</p><code>{hostKey.fingerprint}</code><div className="modal-actions"><button className="secondary-button" onClick={()=>void call('respond_host_key',{sessionId:hostKey.sessionId,accept:false}).then(()=>setHostKeys(old=>old.filter(k=>k.sessionId!==hostKey.sessionId))).catch(report)}>取消连接</button><button className="primary-button" onClick={()=>void call('respond_host_key',{sessionId:hostKey.sessionId,accept:true}).then(()=>setHostKeys(old=>old.filter(k=>k.sessionId!==hostKey.sessionId))).catch(report)}>信任并连接</button></div></section></div>}
    {legacy&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="导入旧版配置"><div className="modal-symbol"><Upload size={25}/></div><h2>继续使用你的会话</h2><p>发现旧版 ComTool 配置，可以导入连接参数、历史、主题和字号。密码需要重新输入。</p><div className="modal-actions"><button className="secondary-button" onClick={()=>{setLegacy(false);update({importDismissed:true})}}>暂不导入</button><button className="primary-button" onClick={()=>void importProfile()}>导入旧配置</button></div></section></div>}
    {closing&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="关闭会话"><h2>关闭 {closing.name}？</h2><p>正在使用的连接会断开，定时和文件发送会停止。</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setClosing(null)}>保留会话</button><button className="primary-button" onClick={()=>void closeSession(closing)}>关闭会话</button></div></section></div>}
    {renaming&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="重命名会话"><h2>重命名会话</h2><input className="rename-input" autoFocus value={renameText} onChange={e=>setRenameText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')rename();if(e.key==='Escape')setRenaming(null)}} aria-label="会话名称"/><div className="modal-actions"><button className="secondary-button" onClick={()=>setRenaming(null)}>取消</button><button className="primary-button" disabled={!renameText.trim()} onClick={rename}>保存名称</button></div></section></div>}
    {recoveryError&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="配置恢复"><h2>配置需要恢复</h2><p>{recoveryError}</p><p>原文件保持不变，可以导入正确配置，或先备份原文件再创建新配置。</p><div className="modal-actions"><button className="secondary-button" onClick={()=>void open({multiple:false,filters:[{name:'配置文件',extensions:['json']}]}).then(path=>{if(typeof path==='string')return importProfile(path)}).catch(report)}>导入配置</button><button className="primary-button" onClick={()=>void call<Profile>('recover_profile').then(p=>{setProfile(p);setRecoveryError('');setLegacy(false)}).catch(report)}>备份并重建</button></div></section></div>}
  </div>;
}
