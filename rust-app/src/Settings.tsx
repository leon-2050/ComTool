import {useEffect,useState} from 'react';
import {FolderOpen,RefreshCw,X,SlidersHorizontal} from 'lucide-react';
import {open,save} from '@tauri-apps/plugin-dialog';
import {call,native} from './api';
import type {Session,Secrets} from './types';
interface Props{session:Session;secrets:Secrets;locked:boolean;patch:(values:Partial<Session>)=>void;setSecrets:(values:Secrets)=>void;close:()=>void;error:(e:unknown)=>void}
export default function Settings({session:s,secrets,locked,patch,setSecrets,close,error}:Props){
  const[tab,setTab]=useState('connection');const[ports,setPorts]=useState<{device:string;description:string}[]>([]);
  const refresh=()=>{if(native)void call<{device:string;description:string}[]>('list_ports').then(setPorts).catch(error)};
  useEffect(refresh,[s.id,s.kind]);
  const text=(key:keyof Session,label:string,type='text')=><label className="field"><span>{label}</span><input type={type} value={s[key] as string|number} onChange={e=>patch({[key]:type==='number'?Number(e.target.value):e.target.value})}/></label>;
  const select=(key:keyof Session,label:string,values:[string|number,string][])=> <label className="field"><span>{label}</span><select value={String(s[key])} onChange={e=>patch({[key]:typeof s[key]==='number'?Number(e.target.value):e.target.value})}>{values.map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></label>;
  const check=(key:keyof Session,label:string)=><label className="check-field"><input type="checkbox" checked={s[key] as boolean} onChange={e=>patch({[key]:e.target.checked})}/><span>{label}</span></label>;
  return <aside className="drawer" aria-label="连接配置"><div className="drawer-heading"><h2><SlidersHorizontal size={18}/>连接配置</h2><button className="icon-button" title="关闭配置" aria-label="关闭配置" onClick={close}><X size={18}/></button></div>
    <div className="drawer-tabs"><button className={tab==='connection'?'active':''} onClick={()=>setTab('connection')}>连接</button><button className={tab==='options'?'active':''} onClick={()=>setTab('options')}>收发与显示</button></div>
    <div className="drawer-body">{tab==='connection'?<>
      <fieldset disabled={locked}><legend>连接参数</legend>
        {select('kind','连接类型',[['serial','串口'],['tcp','TCP'],['udp','UDP'],['ssh','SSH']])}
        {s.kind==='serial'?<>
          <label className="field"><span>串口设备 <button type="button" className="mini-button" title="扫描串口" onClick={refresh}><RefreshCw size={13}/></button></span><input list="serial-devices" placeholder="例如 COM3" value={s.device} onChange={e=>patch({device:e.target.value})}/><datalist id="serial-devices">{ports.map(p=><option key={p.device} value={p.device}>{p.description}</option>)}</datalist></label>
          {text('baud','波特率','number')}
          <div className="field-pair">{select('dataBits','数据位',[[5,'5'],[6,'6'],[7,'7'],[8,'8']])}{select('stopBits','停止位',[['1','1'],['1.5','1.5'],['2','2']])}</div>
          {select('parity','校验',[['none','无'],['odd','奇校验'],['even','偶校验'],['mark','Mark'],['space','Space']])}
          {select('flow','流控',[['none','无'],['software','XON/XOFF'],['hardware','RTS/CTS'],['dsrdtr','DSR/DTR']])}
          <div className="check-pair">{check('rts','RTS')}{check('dtr','DTR')}</div>
        </>:<>
          {s.kind!=='ssh'&&<label className="field"><span>工作模式</span><select value={s.server?'server':'client'} onChange={e=>patch({server:e.target.value==='server'})}><option value="client">{s.kind==='udp'?'发送 / 接收':'客户端'}</option><option value="server">{s.kind==='udp'?'绑定监听':'服务端'}</option></select></label>}
          {(s.kind==='ssh'||!s.server||s.kind==='udp')&&<>{text('host',s.kind==='ssh'?'主机':'目标地址')}{text('port','目标端口','number')}</>}
          {(s.server||s.kind==='udp')&&<>{text('bindHost','本地绑定地址')}{text('bindPort','本地端口','number')}</>}
          {s.kind==='ssh'&&<>
            {text('user','用户名')}
            <label className="field"><span>密码</span><input type="password" autoComplete="off" value={secrets.password} onChange={e=>setSecrets({...secrets,password:e.target.value})} placeholder={s.rememberSecret?'留空使用已保存密码':''}/></label>
            <label className="field"><span>私钥文件</span><div className="input-action"><input value={s.keyFile} onChange={e=>patch({keyFile:e.target.value})}/><button type="button" className="icon-button" title="选择私钥文件" disabled={!native} onClick={()=>void open({multiple:false}).then(path=>{if(typeof path==='string')patch({keyFile:path})}).catch(error)}><FolderOpen size={17}/></button></div></label>
            <label className="field"><span>私钥口令</span><input type="password" autoComplete="off" value={secrets.passphrase} onChange={e=>setSecrets({...secrets,passphrase:e.target.value})}/></label>
            {check('rememberSecret','在 Windows 凭据管理器记住密码')}
          </>}
          {!s.server&&s.kind!=='udp'&&<>{check('reconnect','断开后自动重连')}{s.reconnect&&text('reconnectInterval','重连间隔（毫秒）','number')}</>}
        </>}
      </fieldset>{locked&&<p className="subtle">连接期间参数锁定，断开后可修改。</p>}
    </>:<>
      <fieldset><legend>显示</legend>{select('encoding','字符编码',[['UTF-8','UTF-8'],['ASCII','ASCII'],['UTF-16','UTF-16 LE'],['GBK','GBK'],['GB2312','GB2312'],['GB18030','GB18030']])}
        {text('fontSize','字号','number')}{check('timestamp','接收数据显示时间戳')}{check('keywordHighlighting','终端关键词高亮')}
      </fieldset>
      <fieldset><legend>发送</legend>{check('escape','解析转义：\\n、\\r、\\t、\\xNN')}{select('newline','自动追加换行',[['none','不追加'],['lf','LF'],['crlf','CRLF'],['cr','CR']])}</fieldset>
      <fieldset disabled={locked}><legend>通信记录</legend><label className="field"><span>原始记录文件</span><div className="input-action"><input value={s.logPath} placeholder="未启用" onChange={e=>patch({logPath:e.target.value})}/><button type="button" className="icon-button" title="选择记录文件" disabled={!native} onClick={()=>void save({defaultPath:'ComTool-receive.bin'}).then(path=>{if(path)patch({logPath:path})}).catch(error)}><FolderOpen size={17}/></button></div></label>{check('recordSend','另存已发送数据记录')}<p className="subtle">连接时开始记录原始接收字节，另存来源与时间索引。发送数据写入独立的 .tx.bin 文件。</p></fieldset>
    </>}</div>
  </aside>;
}
