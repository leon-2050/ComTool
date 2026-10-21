// Actual Release application + actual TCP sockets. Profiles and logs are isolated.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {defaultProfile,defaultSession} from '../src/types.ts';
const output=path.resolve(process.env.COMTOOL_NETWORK_OUTPUT||'../../outputs/rust-network');await fs.mkdir(output,{recursive:true});
const root=path.join(output,`run-${Date.now()}`);await fs.mkdir(root,{recursive:true});
const seconds=Number(process.env.COMTOOL_STRESS_SECONDS||600);
const parallel=process.env.COMTOOL_AUX_TRAFFIC==='1';
const peers=[];const servers=[];const p=defaultProfile();p.sessions=[];p.importDismissed=true;
for(let n=0;n<8;n++){
  const server=net.createServer(socket=>{peers[n]=socket;socket.on('data',bytes=>socket.write(bytes));socket.on('error',()=>{})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
  const s=defaultSession('tcp');s.name=`TCP ${n+1}`;s.port=server.address().port;s.logPath=path.join(root,`rx-${n}.bin`);p.sessions.push(s);
}
p.activeId=p.sessions[0].id;await fs.writeFile(path.join(root,'config.json'),JSON.stringify(p));
const ready=path.join(root,'ready');const child=spawn(path.resolve(process.env.COMTOOL_BINARY||'../../work/rust-target/release/ComTool.exe'),[],{windowsHide:true,env:{...process.env,COMTOOL_RUST_PROFILE:root,COMTOOL_RUST_READY_FILE:ready,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9224 --disable-background-timer-throttling'}});
const exited=new Promise(resolve=>child.once('exit',resolve));let browser;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
  for(let n=0;;n++){try{await fs.access(ready);break}catch{}if(n>500)throw Error('Startup timed out');await sleep(50)}
  browser=await chromium.connectOverCDP('http://127.0.0.1:9224');const page=browser.contexts()[0].pages()[0];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const rpc=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const wait=async check=>{for(let n=0;n<400;n++){if(await check())return;await sleep(50)}throw Error('Condition timed out')};
  for(const s of p.sessions){await page.locator('.workspace-tab').filter({hasText:s.name}).click();await page.getByRole('button',{name:'连接',exact:true}).click();await wait(async()=> (await rpc('statuses')).some(v=>v.sessionId===s.id&&v.state==='connected'))}
  for(let n=0;n<8;n++)await rpc('send_bytes',{sessionId:p.sessions[n].id,bytes:Array.from(Buffer.from(`session-${n}-中文\n`))});
  await wait(async()=> (await rpc('statuses')).every(v=>v.rx>0));
  // File transfer shares the production queue, not a mock frontend handler.
  const file=Buffer.alloc(1024*1024);for(let i=0;i<file.length;i++)file[i]=i%251;
  const filePath=path.join(root,'send-fixture.bin');await fs.writeFile(filePath,file);
  await rpc('send_file',{sessionId:p.sessions[1].id,path:filePath,peer:null});
  await wait(async()=> (await rpc('statuses')).find(v=>v.sessionId===p.sessions[1].id).rx>=file.length+Buffer.byteLength('session-1-中文\n'));
  await rpc('schedule_send',{sessionId:p.sessions[2].id,text:'timer\n',intervalMs:50,peer:null,enabled:true});await sleep(250);await rpc('schedule_send',{sessionId:p.sessions[2].id,text:'',intervalMs:50,peer:null,enabled:false});
  await sleep(200);const afterStop=(await rpc('statuses')).find(v=>v.sessionId===p.sessions[2].id).tx;await sleep(250);assert.equal((await rpc('statuses')).find(v=>v.sessionId===p.sessions[2].id).tx,afterStop);
  const hash=createHash('sha256');hash.update(Buffer.from('session-0-中文\n'));let sent=Buffer.byteLength('session-0-中文\n');
  const auxiliary=p.sessions.map((s,n)=>{const prefix=[Buffer.from(`session-${n}-中文\n`)];if(n===1)prefix.push(file);if(n===2)prefix.push(Buffer.from('timer\n'.repeat((afterStop-Buffer.byteLength('session-2-中文\n'))/6)));const bytes=Buffer.concat(prefix);return{hash:createHash('sha256').update(bytes),bytes:bytes.length}});
  const chunk=Buffer.alloc(65536);for(let i=0;i<chunk.length;i++)chunk[i]=32+i%95;
  const start=performance.now();const uiSamples=[];let cycles=0;
  console.log(`Connected 8 native sessions. Stress duration: ${seconds}s.`);
  for(let n=0;n<seconds*16;n++){
    if(!peers[0].write(chunk))await new Promise(r=>peers[0].once('drain',r));hash.update(chunk);sent+=chunk.length;
    if(parallel&&n%4===0)for(let i=1;i<8;i++){const bytes=Buffer.alloc(1024,65+i);peers[i].write(bytes);auxiliary[i].hash.update(bytes);auxiliary[i].bytes+=bytes.length;}
    if(n%160===0){const t=performance.now();await page.getByRole('button',{name:'切换主题',exact:true}).click();uiSamples.push(performance.now()-t);cycles++;if(cycles%6===0)console.log(`Stress ${(n/16).toFixed(0)}s, ${(sent/1048576).toFixed(1)} MiB`)}
    const delay=start+(n+1)*62.5-performance.now();if(delay>0)await sleep(delay);
  }
  await wait(async()=> (await rpc('statuses')).find(v=>v.sessionId===p.sessions[0].id).rx===sent);
  if(parallel)await wait(async()=>{const states=await rpc('statuses');return p.sessions.slice(1).every((s,n)=>states.find(v=>v.sessionId===s.id).rx===auxiliary[n+1].bytes)});
  const duration=(performance.now()-start)/1000;const statuses=await rpc('statuses');
  await page.locator('.workspace-tab').filter({hasText:'TCP 1'}).click();await page.screenshot({path:path.join(output,'stress-native.png')});
  for(const s of p.sessions)await rpc('disconnect_session',{sessionId:s.id});
  await rpc('plugin:window|close',{label:'main'}).catch(e=>{if(!String(e).includes('has been closed'))throw e});await Promise.race([exited,sleep(15000).then(()=>{throw Error('Close timed out')})]);
  const actual=await fs.readFile(p.sessions[0].logPath);const actualHash=createHash('sha256').update(actual).digest('hex');const expectedHash=hash.digest('hex');assert.equal(actual.length,sent);assert.equal(actualHash,expectedHash);
  const fileLog=await fs.readFile(p.sessions[1].logPath);assert.deepEqual(fileLog.subarray(Buffer.byteLength('session-1-中文\n'),Buffer.byteLength('session-1-中文\n')+file.length),file);
  if(parallel)for(let i=1;i<8;i++)assert.equal(createHash('sha256').update(await fs.readFile(p.sessions[i].logPath)).digest('hex'),auxiliary[i].hash.digest('hex'));
  assert(statuses.every(s=>s.dropped===0));assert.deepEqual(errors,[]);
  const report={native:true,sessions:8,allSessionsContinuouslyReceiving:parallel,durationSeconds:duration,bytes:sent,MiBPerSecond:(sent-Buffer.byteLength('session-0-中文\n'))/1048576/duration,rawLogSha256:actualHash,rawLogMatches:true,fileTransferMatches:true,timerStops:true,statuses,uiInteractionMs:uiSamples,consoleErrors:errors};
  await fs.writeFile(path.join(output,parallel?'parallel-report.json':'network-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();for(const socket of peers)socket?.destroy();for(const server of servers)server.close()}
