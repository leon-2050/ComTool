// ComTool Rust rewrite, 2026-10-13. LGPL-3.0-only; upstream Neutree/COMTool.
export type Kind = 'serial'|'tcp'|'udp'|'ssh';
export interface Session {
  id:string;name:string;kind:Kind;view:'receive'|'terminal';host:string;port:number;bindHost:string;bindPort:number;server:boolean;
  device:string;baud:number;dataBits:number;parity:string;stopBits:string;flow:string;rts:boolean;dtr:boolean;
  user:string;keyFile:string;rememberSecret:boolean;reconnect:boolean;reconnectInterval:number;
  encoding:string;sendHex:boolean;receiveHex:boolean;escape:boolean;newline:string;timestamp:boolean;fontSize:number;
  keywordHighlighting:boolean;history:string[];presets:string[];logPath:string;recordSend:boolean;
}
export interface Profile {version:number;theme:'light'|'dark';activeId:string;sessions:Session[];knownHosts:Record<string,string>;importDismissed:boolean}
export interface Secrets {password:string;passphrase:string}
export interface ConnectionStatus {sessionId:string;generation:number;state:'disconnected'|'connecting'|'connected'|'reconnecting'|'error';message:string;peers:string[];rx:number;tx:number;dropped:number}
export interface DataFrame {sessionId:string;generation?:number;peerId:string;sequence:number;bytes:number[];datagram:boolean;timestamp:string}
export interface HostKey {sessionId:string;host:string;fingerprint:string}
export const KIND_LABEL:Record<Kind,string>={serial:'串口',tcp:'TCP',udp:'UDP',ssh:'SSH'};
export const defaultSession=(kind:Kind='serial'):Session=>({
  id:crypto.randomUUID(),name:kind==='ssh'?'SSH 终端':kind==='serial'?'串口收发':`${kind.toUpperCase()} 调试`,kind,view:kind==='ssh'?'terminal':'receive',
  host:'127.0.0.1',port:kind==='ssh'?22:2345,bindHost:'0.0.0.0',bindPort:2345,server:false,device:'',baud:115200,dataBits:8,parity:'none',stopBits:'1',flow:'none',rts:false,dtr:false,
  user:'',keyFile:'',rememberSecret:false,reconnect:false,reconnectInterval:1000,encoding:'UTF-8',sendHex:false,receiveHex:false,escape:false,newline:'none',timestamp:false,fontSize:14,
  keywordHighlighting:true,history:[],presets:[],logPath:'',recordSend:false,
});
export const defaultProfile=():Profile=>{const s=defaultSession();return{version:1,theme:'light',activeId:s.id,sessions:[s],knownHosts:{},importDismissed:false}};
export const emptyStatus=(id:string):ConnectionStatus=>({sessionId:id,generation:0,state:'disconnected',message:'未连接',peers:[],rx:0,tx:0,dropped:0});
export function formatBytes(n:number){if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KiB`;return`${(n/1048576).toFixed(1)} MiB`}
