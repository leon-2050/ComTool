import {useEffect,useRef} from 'react';
import {Terminal,type IDisposable} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {WebglAddon} from '@xterm/addon-webgl';
import {SearchAddon} from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import {call} from './api';
import {highlightKeywords} from './keywords';
import type {Session} from './types';
export interface TerminalHandle {write:(bytes:Uint8Array)=>Promise<void>;clear:()=>void;search:(text:string)=>void;copy:()=>string}
interface Props {session:Session;peer:string;active:boolean;connected:boolean;register:(id:string,value:TerminalHandle|null)=>void;error:(error:unknown)=>void}
export default function TerminalPane({session,peer,active,connected,register,error}:Props){
  const element=useRef<HTMLDivElement>(null);const terminal=useRef<Terminal|null>(null);const fit=useRef<FitAddon|null>(null);const self=useRef<TerminalHandle|null>(null);const latest=useRef({session,connected,peer});latest.current={session,connected,peer};
  useEffect(()=>{
    if(!element.current)return;
    const t=new Terminal({scrollback:10000,fontSize:session.fontSize,fontFamily:'"Cascadia Mono", Consolas, "Microsoft YaHei", monospace',cursorBlink:true,allowProposedApi:true,theme:{background:'#151c28',foreground:'#dde5f1',cursor:'#93e3cc',selectionBackground:'#395779',black:'#151c28',red:'#ef707f',green:'#8ed2a2',yellow:'#eed197',blue:'#82aaff',magenta:'#d394e5',cyan:'#8bdded',white:'#dce4ee',brightBlack:'#7b8aa5',brightRed:'#ff8995',brightGreen:'#b2e7bd',brightYellow:'#ffe5ae',brightBlue:'#abc7ff',brightMagenta:'#edbaff',brightCyan:'#b4f4ff',brightWhite:'#ffffff'}});
    const f=new FitAddon();const search=new SearchAddon();t.loadAddon(f);t.loadAddon(search);t.open(element.current);terminal.current=t;fit.current=f;
    try{const webgl=new WebglAddon();webgl.onContextLoss(()=>webgl.dispose());t.loadAddon(webgl);}catch{/* Built-in DOM renderer remains available. */}
    let decoder:TextDecoder|undefined;let decoderEncoding='';let frame=0;const decorations=new Map<number,{signature:string;values:IDisposable[]}>();
    const refreshHighlight=()=>{
      frame=0;const buffer=t.buffer.active;
      if(!latest.current.session.keywordHighlighting||buffer.type!=='normal'){for(const row of decorations.values())row.values.forEach(v=>v.dispose());decorations.clear();return;}
      const first=buffer.viewportY,last=Math.min(buffer.length,first+t.rows);
      for(const [line,row]of decorations)if(line<first||line>=last){row.values.forEach(v=>v.dispose());decorations.delete(line);}
      for(let line=first;line<last;line++){
        const row=buffer.getLine(line);if(!row)continue;let text='';const positions:number[]=[];let attributes='';
        for(let x=0;x<t.cols;x++){const cell=row.getCell(x);if(!cell||cell.getWidth()===0)continue;const chars=cell.getChars()||' ';for(let j=0;j<chars.length;j++)positions.push(x);text+=chars;attributes+=cell.isFgDefault()&&cell.isBgDefault()&&!cell.isInverse()?'0':'1';}
        const signature=`${text}|${attributes}`;if(decorations.get(line)?.signature===signature)continue;
        decorations.get(line)?.values.forEach(v=>v.dispose());const values:IDisposable[]=[];
        for(const hit of highlightKeywords(text)){
          for(let i=hit.start;i<hit.end;){const x=positions[i];const cell=row.getCell(x);if(!cell?.isFgDefault()||!cell.isBgDefault()||cell.isInverse()){i++;continue;}let end=i+1;while(end<hit.end){const next=row.getCell(positions[end]);if(!next?.isFgDefault()||!next.isBgDefault()||next.isInverse())break;end++;}
            const endCell=positions[end-1];const width=endCell-x+(row.getCell(endCell)?.getWidth()||1);const marker=t.registerMarker(line-buffer.baseY-buffer.cursorY);
            if(marker){const decoration=t.registerDecoration({marker,x,width,foregroundColor:hit.color,layer:'bottom'});if(decoration)values.push(decoration);values.push(marker);}i=end;
          }
        }decorations.set(line,{signature,values});
      }
    };
    const scheduleHighlight=()=>{if(!frame)frame=requestAnimationFrame(refreshHighlight)};
    const subscriptions=[t.onData(data=>{if(latest.current.connected)void call('send_terminal_input',{sessionId:session.id,text:data,peer:latest.current.peer||null}).catch(error)}),t.onResize(size=>{if(latest.current.connected)void call('resize_terminal',{sessionId:session.id,cols:size.cols,rows:size.rows}).catch(error)}),t.onRender(scheduleHighlight),t.onScroll(scheduleHighlight),t.buffer.onBufferChange(scheduleHighlight)];
    t.attachCustomKeyEventHandler(event=>{
      if(event.type==='keydown'&&event.ctrlKey&&event.shiftKey&&event.code==='KeyC'){void navigator.clipboard.writeText(t.getSelection()).catch(error);return false;}
      if(event.type==='keydown'&&event.ctrlKey&&event.shiftKey&&event.code==='KeyV'){void navigator.clipboard.readText().then(text=>{if(latest.current.connected)t.paste(text)}).catch(error);return false;}return true;
    });
    const resize=()=>{if(element.current?.offsetWidth&&element.current.offsetHeight){try{f.fit();}catch{}}};const observer=new ResizeObserver(resize);observer.observe(element.current);requestAnimationFrame(resize);
    const handle:TerminalHandle={write:bytes=>new Promise(resolve=>{
      const encoding=latest.current.session.encoding;if(encoding==='UTF-8'){t.write(bytes,()=>{scheduleHighlight();resolve()});return;}
      if(encoding==='ASCII'){t.write(Array.from(bytes,b=>b<128?String.fromCharCode(b):'\uFFFD').join(''),()=>{scheduleHighlight();resolve()});return;}
      if(!decoder||decoderEncoding!==encoding){decoderEncoding=encoding;try{decoder=new TextDecoder(encoding==='UTF-16'?'utf-16le':encoding)}catch{decoder=new TextDecoder()}}
      t.write(decoder.decode(bytes,{stream:true}),()=>{scheduleHighlight();resolve()});
    }),clear:()=>{for(const row of decorations.values())row.values.forEach(v=>v.dispose());decorations.clear();t.write('\x1bc');decoder=undefined;},search:text=>search.findNext(text),copy:()=>t.getSelection()};self.current=handle;
    return()=>{register(session.id,null);observer.disconnect();subscriptions.forEach(s=>s.dispose());if(frame)cancelAnimationFrame(frame);for(const row of decorations.values())row.values.forEach(v=>v.dispose());t.dispose();terminal.current=null;fit.current=null;self.current=null;};
  },[session.id]);
  useEffect(()=>{if(terminal.current){terminal.current.options.fontSize=session.fontSize;if(active)requestAnimationFrame(()=>{fit.current?.fit();terminal.current?.focus();if(connected&&terminal.current)void call('resize_terminal',{sessionId:session.id,cols:terminal.current.cols,rows:terminal.current.rows}).catch(error);});}},[session.fontSize,active,connected]);
  useEffect(()=>{if(self.current){self.current.clear();register(session.id,self.current)}},[session.id,peer]);
  useEffect(()=>{terminal.current?.refresh(0,Math.max(0,(terminal.current?.rows||1)-1));},[session.keywordHighlighting]);
  return <div className="terminal-host" ref={element} aria-label={`${session.name} 交互终端`}/>;
}
