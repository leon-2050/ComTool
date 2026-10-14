import {describe,it,expect} from 'vitest';
import {ReceiveBuffer,BUFFER_LIMIT,ROW_LIMIT} from './buffer';
import {highlightKeywords} from './keywords';
import type {DataFrame} from './types';
const frame=(bytes:number[],peer='one'):DataFrame=>({sessionId:'test',peerId:peer,sequence:1,bytes,datagram:false,timestamp:'2026-10-14T00:00:00Z'});
describe('raw data display',()=>{
  it('bounds empty datagrams and redecodes retained raw bytes',()=>{
    const b=new ReceiveBuffer();for(let n=0;n<ROW_LIMIT+3;n++)b.append({...frame([]),datagram:true});expect(b.rows.length).toBe(ROW_LIMIT);expect(b.trimmedRows).toBe(3);
    b.clear();b.append(frame([0xd6,0xd0]));b.setEncoding('GBK');expect(b.rows[0].text).toBe('中');expect(b.rows[0].hex).toBe('D6 D0');b.setEncoding('ASCII');expect(b.rows[0].text).toBe('��');
  });
  it('keeps UTF-8 decoder state across packets and isolates clients',()=>{
    const b=new ReceiveBuffer();b.append(frame([0xe4,0xb8]));b.append(frame([65],'two'));b.append(frame([0xad]));expect(b.rows.map(r=>r.text)).toEqual(['','A','中']);expect(b.text(true,false)).toContain('E4 B8');
  });
  it('resets decoder at UDP boundaries',()=>{
    const b=new ReceiveBuffer();b.append({...frame([0xe4,0xb8]),datagram:true});b.append({...frame([0xad]),datagram:true});expect(b.rows.map(r=>r.text).join('')).not.toContain('中');
  });
  it('keeps exact 8 MiB bound and visibly counts removed bytes',()=>{
    const b=new ReceiveBuffer();const bytes=Array(65536).fill(65);for(let n=0;n<130;n++)b.append(frame(bytes));expect(b.size).toBe(BUFFER_LIMIT);expect(b.rows).toHaveLength(128);expect(b.trimmed).toBe(131072);b.clear();expect(b.size).toBe(0);expect(b.rows).toHaveLength(0);
  });
});
describe('display-only keywords',()=>{
  it('uses UTF-16 offsets after Chinese text and does not alter output',()=>{
    const text='中文 😀 127.0.0.1 --color <access denied>';const spans=highlightKeywords(text);expect(spans.map(s=>text.slice(s.start,s.end))).toEqual(['127.0.0.1','--color','<access denied>']);expect(text).toBe('中文 😀 127.0.0.1 --color <access denied>');
  });
  it('rejects invalid IP addresses and option-like paths',()=>{
    expect(highlightKeywords('999.1.2.3 /--path')).toEqual([]);
  });
});
