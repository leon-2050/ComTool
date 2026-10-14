import type {DataFrame} from './types';
export const BUFFER_LIMIT=8*1024*1024;
export const ROW_LIMIT=8192;
export interface ReceiveRow {id:number;peer:string;time:string;text:string;readonly hex:string;bytes:Uint8Array;size:number;datagram:boolean}
export class ReceiveBuffer {
  rows:ReceiveRow[]=[];size=0;trimmed=0;trimmedRows=0;version=0;private decoders=new Map<string,TextDecoder>();private encoding='UTF-8';private nextId=0;
  setEncoding(value:string){if(value!==this.encoding){this.encoding=value;this.decoders.clear();for(const row of this.rows)row.text=this.decode(row.bytes,row.peer,row.datagram);this.version++}}
  resetDecoders(){this.decoders.clear()}
  private decode(bytes:Uint8Array,peer:string,datagram:boolean){
    if(this.encoding==='ASCII')return Array.from(bytes,b=>b<128?String.fromCharCode(b):'\uFFFD').join('');
    let decoder=this.decoders.get(peer);if(!decoder){try{decoder=new TextDecoder(this.encoding==='UTF-16'?'utf-16le':this.encoding)}catch{decoder=new TextDecoder('utf-8')}this.decoders.set(peer,decoder)}
    return decoder.decode(bytes,{stream:!datagram});
  }
  append(frame:DataFrame){
    const bytes=new Uint8Array(frame.bytes);const text=this.decode(bytes,frame.peerId,frame.datagram);let cachedHex:string|undefined;
    const row:ReceiveRow={id:++this.nextId,peer:frame.peerId,time:frame.timestamp,text,get hex(){return cachedHex??(cachedHex=Array.from(bytes,b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' '))},bytes,size:bytes.length,datagram:frame.datagram};
    this.rows.push(row);this.size+=bytes.length;
    while((this.size>BUFFER_LIMIT||this.rows.length>ROW_LIMIT)&&this.rows.length>1){const old=this.rows.shift()!;this.size-=old.size;this.trimmed+=old.size;this.trimmedRows++;}
    this.version++;
  }
  clear(){this.rows=[];this.size=0;this.trimmed=0;this.trimmedRows=0;this.decoders.clear();this.version++}
  text(hex:boolean,timestamp:boolean){return this.rows.map(r=>`${timestamp?`[${new Date(r.time).toLocaleTimeString()}] `:''}${hex?r.hex:r.text}${r.datagram?'\n':''}`).join(hex?'\n':'')}
}
