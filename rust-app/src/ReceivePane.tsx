import {useRef,useState,useMemo,useLayoutEffect} from 'react';
import type {Session} from './types';
import {ReceiveBuffer} from './buffer';
export default function ReceivePane({session,buffer,tick}:{session:Session;buffer:ReceiveBuffer;tick:number}){
  const host=useRef<HTMLDivElement>(null);const[scroll,setScroll]=useState(0);const[height,setHeight]=useState(500);const following=useRef(true);
  const lineHeight=Math.round(session.fontSize*1.6);
  buffer.setEncoding(session.encoding);
  const cachedRows=useRef(new Map<number,{hex:boolean;lineHeight:number;text:string;height:number}>());
  const layout=useMemo(()=>{
    const ids=new Set(buffer.rows.map(row=>row.id));for(const id of cachedRows.current.keys())if(!ids.has(id))cachedRows.current.delete(id);
    let y=0;return buffer.rows.map(row=>{let cached=cachedRows.current.get(row.id);if(!cached||cached.hex!==session.receiveHex||cached.lineHeight!==lineHeight||(!session.receiveHex&&cached.text!==row.text)){const text=session.receiveHex?'':row.text;cached={hex:session.receiveHex,lineHeight,text,height:Math.max(1,session.receiveHex?Math.ceil(row.size/16):text.split('\n').length)*lineHeight+8};cachedRows.current.set(row.id,cached)}const item={row,text:cached.text,y,height:cached.height};y+=cached.height;return item;});
  },[buffer.version,session.receiveHex,session.fontSize,session.encoding]);
  const total=layout.length?layout[layout.length-1].y+layout[layout.length-1].height:0;
  useLayoutEffect(()=>{if(host.current&&following.current)host.current.scrollTop=total;},[total]);
  useLayoutEffect(()=>{if(!host.current)return;const observer=new ResizeObserver(([entry])=>setHeight(entry.contentRect.height));observer.observe(host.current);return()=>observer.disconnect()},[]);
  const visible=layout.filter(row=>row.y+row.height>=scroll-100&&row.y<scroll+height+100);
  return <div className="receive-scroller" ref={host} onScroll={event=>{const e=event.currentTarget;setScroll(e.scrollTop);following.current=e.scrollHeight-e.scrollTop-e.clientHeight<60}} style={{fontSize:session.fontSize}} aria-label="接收数据">
    {buffer.trimmedRows>0&&<div className="buffer-notice">较早的显示内容已清理；通信记录文件独立保存。</div>}
    {!layout.length?<div className="empty-state"><div className="signal-mark"><span/><span/><span/><span/></div><h2>等待第一条数据</h2><p>连接设备后，收到的数据会显示在这里</p><small>文本与 HEX 随时切换 · 原始字节保持不变</small></div>:<div style={{height:total,position:'relative'}}>{visible.map(({row,text,y,height})=><div className="receive-row" key={row.id} style={{position:'absolute',top:y,height,lineHeight:`${lineHeight}px`}}>{session.timestamp&&<span className="data-time">{new Date(row.time).toLocaleTimeString()} </span>}{(session.server||row.datagram)&&<span className="data-peer">[{row.peer}] </span>}<span>{row.datagram&&row.size===0?'〈空 UDP 报文〉':session.receiveHex?row.hex.replace(/((?:[0-9A-F]{2} ){15}[0-9A-F]{2}) /g,'$1\n'):text||' '}</span></div>)}</div>}
  </div>;
}
