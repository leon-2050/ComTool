import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {call,native} from './api';

interface Port {device:string;description:string}
interface Props {sessionId:string;value:string;disabled:boolean;onChange:(device:string)=>void}

export default function SerialDevice({sessionId,value,disabled,onChange}:Props){
  const[ports,setPorts]=useState<Port[]>([]);
  const[scanning,setScanning]=useState(false);const[scanned,setScanned]=useState(false);const[error,setError]=useState('');
  const refresh=useRef(()=>{});
  useEffect(()=>{
    let active=true;let pending=false;
    const scan=async()=>{
      if(!native||pending)return;
      pending=true;setScanning(true);
      try{
        const result=await call<Port[]>('list_ports');
        if(active){
          const unique=[...new Map(result.map(port=>[port.device,port])).values()];
          unique.sort((a,b)=>a.device.localeCompare(b.device,undefined,{numeric:true}));
          setPorts(unique);setError('');setScanned(true);
        }
      }catch(e){if(active)setError(`扫描串口失败：${String(e)}`);}
      finally{pending=false;if(active)setScanning(false);}
    };
    const rescan=()=>{if(document.visibilityState==='visible')void scan();};
    refresh.current=()=>{void scan();};void scan();
    const timer=setInterval(rescan,3000);
    window.addEventListener('focus',rescan);document.addEventListener('visibilitychange',rescan);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',rescan);document.removeEventListener('visibilitychange',rescan);refresh.current=()=>{};};
  },[sessionId]);
  const found=ports.some(port=>port.device===value);
  const hint=error||(!native?'运行桌面程序后自动识别串口':scanned&&!ports.length?'未检测到串口，请连接设备并确认驱动已安装。':value&&!found&&scanned?'所选串口当前未检测到，已保留原配置。':scanned?`${ports.length} 个可用串口`: '正在识别串口设备…');
  return <div className="serial-device">
    <label className="field"><span>串口设备 <button type="button" className="mini-button" aria-label="刷新串口列表" title="刷新串口列表" disabled={!native||disabled||scanning} onClick={()=>refresh.current()}><RefreshCw size={13}/></button></span>
      <select aria-label="串口设备" aria-describedby="serial-device-status" value={value} disabled={disabled} onFocus={()=>refresh.current()} onChange={e=>onChange(e.target.value)}>
        <option value="" disabled>{scanning&&!scanned?'正在扫描串口…':ports.length?'请选择串口设备':'未检测到串口设备'}</option>
        {value&&!found&&<option value={value} disabled>{value}（当前未检测到）</option>}
        {ports.map(port=><option key={port.device} value={port.device}>{port.device}{port.description?` — ${port.description}`:''}</option>)}
      </select>
    </label>
    <p id="serial-device-status" className={error?'serial-port-hint error-text':'serial-port-hint subtle'} role={error?'alert':'status'}>{hint}</p>
  </div>;
}
