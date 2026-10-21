// Real desktop IPC + loopback sockets. Serial hardware is a separate acceptance gate.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import net from 'node:net';
import dgram from 'node:dgram';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {defaultProfile,defaultSession} from '../src/types.ts';

const binary=path.resolve(process.argv[2]||process.env.COMTOOL_BINARY||'../../work/rust-target/release/ComTool.exe');
const output=path.resolve(process.argv[3]||'../../output/ComTool-connection-config-2026-10-20/native-apply');
const root=path.join(output,`profile-${Date.now()}`);await fs.mkdir(root,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const sockets=[];let firstCount=0,secondCount=0,secondReceived=0;
const first=net.createServer(socket=>{firstCount++;sockets.push(socket);socket.on('error',()=>{});socket.on('data',bytes=>socket.write(bytes));socket.write('before-apply\r\n');});
const second=net.createServer(socket=>{secondCount++;sockets.push(socket);socket.on('error',()=>{});socket.on('data',bytes=>{secondReceived+=bytes.length;socket.write(bytes);});socket.write('after-apply\r\n');});
await new Promise(r=>first.listen(0,'127.0.0.1',r));await new Promise(r=>second.listen(0,'127.0.0.1',r));
const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const listenPort=reserve.address().port;await new Promise(r=>reserve.close(r));
const udp=dgram.createSocket('udp4');await new Promise(r=>udp.bind(0,'127.0.0.1',r));udp.on('message',(bytes,peer)=>udp.send(bytes,peer.port,peer.address));
const profile=defaultProfile();profile.importDismissed=true;
const tcp=defaultSession('tcp');tcp.name='应用参数 TCP';tcp.port=first.address().port;tcp.logPath=path.join(root,'tcp.bin');
const listener=defaultSession('tcp');listener.name='重新绑定 TCP';listener.server=true;listener.bindHost='127.0.0.1';listener.bindPort=listenPort;
const datagram=defaultSession('udp');datagram.name='重新绑定 UDP';datagram.bindHost='127.0.0.1';datagram.bindPort=0;datagram.port=udp.address().port;
profile.sessions=[tcp,listener,datagram];profile.activeId=tcp.id;await fs.writeFile(path.join(root,'config.json'),JSON.stringify(profile));
const ready=path.join(root,'ready.json');const child=spawn(binary,[],{windowsHide:true,env:{...process.env,COMTOOL_RUST_PROFILE:root,COMTOOL_RUST_READY_FILE:ready,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9238'}});
const exited=new Promise(r=>child.once('exit',r));let browser;
try{
  for(let n=0;;n++){try{await fs.access(ready);break}catch{}if(n>500)throw Error('Native startup timeout');await sleep(50);}
  browser=await chromium.connectOverCDP('http://127.0.0.1:9238');const page=browser.contexts()[0].pages()[0];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const rpc=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const wait=async check=>{for(let n=0;n<300;n++){if(await check())return;await sleep(50);}throw Error('Apply-config condition timeout');};
  const status=async id=>(await rpc('statuses')).find(s=>s.sessionId===id);
  const tab=async name=>page.locator('.workspace-tab').filter({hasText:name}).locator('.tab-label').click();
  const apply=()=>page.getByRole('button',{name:'应用并重连',exact:true}).click();
  const connect=()=>page.locator('.session-actions').getByRole('button',{name:'连接',exact:true}).click();
  assert(await page.locator('.drawer').isVisible());await connect();await wait(async()=> (await status(tcp.id))?.state==='connected');await page.getByText('before-apply',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'终端',exact:true}).count(),0);
  const original=(await status(tcp.id)).generation;
  await page.getByRole('spinbutton',{name:'目标端口',exact:true}).fill(String(second.address().port));
  assert.equal((await rpc('bootstrap')).profile.sessions.find(s=>s.id===tcp.id).port,tcp.port);assert((await page.locator('.session-heading').innerText()).includes(String(tcp.port)));
  await tab(listener.name);await tab(tcp.name);assert.equal(await page.getByRole('spinbutton',{name:'目标端口',exact:true}).inputValue(),String(second.address().port));
  await page.getByRole('button',{name:'撤销修改',exact:true}).click();assert.equal(await page.getByRole('spinbutton',{name:'目标端口',exact:true}).inputValue(),String(tcp.port));
  // Validation fails without cancelling the old connection.
  await page.getByRole('spinbutton',{name:'目标端口',exact:true}).fill('0');await apply();await page.locator('.config-footer [role=alert]').waitFor();assert.equal((await status(tcp.id)).generation,original);assert.equal((await status(tcp.id)).state,'connected');
  // A real persistence failure must also leave the stream and draft intact.
  await page.getByRole('spinbutton',{name:'目标端口',exact:true}).fill(String(second.address().port));await sleep(350);
  await fs.mkdir(path.join(root,'config.json.tmp'));await apply();await page.locator('.config-footer [role=alert]').waitFor();assert.equal((await status(tcp.id)).generation,original);assert.equal((await status(tcp.id)).state,'connected');assert.equal(await page.getByRole('spinbutton',{name:'目标端口',exact:true}).inputValue(),String(second.address().port));await fs.rmdir(path.join(root,'config.json.tmp'));
  // Applying stops a running schedule and does not restart it on the new socket.
  await page.getByRole('textbox',{name:'发送数据',exact:true}).fill('scheduled-old');await page.getByRole('checkbox',{name:'定时',exact:true}).click();await wait(()=>page.getByRole('checkbox',{name:'定时',exact:true}).isChecked());
  const file=path.join(root,'cancel-on-apply.bin');const handle=await fs.open(file,'w');await handle.truncate(64*1024*1024);await handle.close();sockets[0].pause();
  await page.evaluate(({sessionId,file})=>{window.__transferFinished=false;window.__TAURI_INTERNALS__.invoke('send_file',{sessionId,path:file,peer:null}).then(()=>{window.__transferFinished=true;},()=>{window.__transferFinished=true;});},{sessionId:tcp.id,file});
  await page.locator('.file-transfer').waitFor();
  await page.getByRole('button',{name:'应用并重连',exact:true}).evaluate(button=>{button.click();button.click();});
  await wait(async()=> (await status(tcp.id))?.generation>original&&(await status(tcp.id))?.state==='connected');await page.getByText('参数已生效',{exact:true}).waitFor();await sleep(500);
  assert.equal(firstCount,1);assert.equal(secondCount,1);assert.equal(secondReceived,0);await page.waitForFunction(()=>window.__transferFinished);assert.equal(await page.locator('.file-transfer').count(),0);assert.equal(await page.getByRole('checkbox',{name:'定时',exact:true}).isChecked(),false);
  const receive=await page.locator('.receive-card').innerText();assert(receive.includes('before-apply'));assert(receive.includes('after-apply'));assert(!receive.includes('目标端口必须'));
  await page.screenshot({path:path.join(output,'applied-with-history.png')});
  const generation=(await status(tcp.id)).generation;
  // Old progress/status events cannot resurrect a prior transfer or connection.
  await rpc('plugin:event|emit',{event:'file-progress',payload:{sessionId:tcp.id,generation:original,sent:1,total:9}});
  await rpc('plugin:event|emit',{event:'connection-status',payload:{sessionId:tcp.id,generation:original,state:'error',message:'stale-status',peers:[],rx:0,tx:0,dropped:0}});
  await sleep(100);assert.equal(await page.locator('.file-transfer').count(),0);assert(!(await page.locator('.status-bar').innerText()).includes('stale-status'));
  // A closed target saves the new parameters but is never reported as successfully applied.
  const unavailable=net.createServer();await new Promise(r=>unavailable.listen(0,'127.0.0.1',r));const unavailablePort=unavailable.address().port;await new Promise(r=>unavailable.close(r));
  await page.getByRole('spinbutton',{name:'目标端口',exact:true}).fill(String(unavailablePort));await apply();await wait(async()=> (await status(tcp.id))?.generation>generation&&(await status(tcp.id))?.state==='error');await page.locator('.config-footer [role=alert]').waitFor();assert(!(await page.locator('.config-footer').innerText()).includes('参数已生效'));assert((await page.locator('.receive-card').innerText()).includes('before-apply'));assert.equal((await rpc('bootstrap')).profile.sessions.find(s=>s.id===tcp.id).port,unavailablePort);
  // Same-port listener restart proves that old native resources were released first.
  await tab(listener.name);await connect();await wait(async()=> (await status(listener.id))?.state==='connected');const listenGeneration=(await status(listener.id)).generation;
  await page.getByRole('textbox',{name:'本地绑定地址',exact:true}).fill('0.0.0.0');await apply();await wait(async()=> (await status(listener.id))?.generation>listenGeneration&&(await status(listener.id))?.state==='connected');await page.getByText('参数已生效',{exact:true}).waitFor();
  const probe=net.createConnection(listenPort,'127.0.0.1');sockets.push(probe);await new Promise((resolve,reject)=>{probe.once('connect',resolve);probe.once('error',reject);});probe.write('listener-after-apply');
  await tab(datagram.name);await connect();await wait(async()=> (await status(datagram.id))?.state==='connected');await rpc('send_input',{sessionId:datagram.id,text:'udp-before',peer:null});await wait(async()=> (await status(datagram.id)).rx>0);
  const udpGeneration=(await status(datagram.id)).generation;await page.getByRole('textbox',{name:'本地绑定地址',exact:true}).fill('0.0.0.0');await apply();await wait(async()=> (await status(datagram.id))?.generation>udpGeneration&&(await status(datagram.id))?.state==='connected');await page.getByText('参数已生效',{exact:true}).waitFor();await rpc('send_input',{sessionId:datagram.id,text:'udp-after',peer:null});await wait(async()=> (await status(datagram.id)).rx>0);
  await page.getByText('udp-after',{exact:false}).waitFor();const udpText=await page.locator('.receive-card').innerText();assert(udpText.includes('udp-before'));assert(udpText.includes('udp-after'));assert.equal(errors.length,0,errors.join('\n'));
  for(const session of profile.sessions)await rpc('disconnect_session',{sessionId:session.id});
  const log=await fs.readFile(tcp.logPath,'utf8');assert(log.includes('before-apply'));assert(log.includes('after-apply'));
  const report={native:true,tcpEndpointChanged:true,draftIsolated:true,undo:true,validationKeepsOldConnection:true,saveFailureKeepsOldConnection:true,doubleClickSingleReconnect:true,receiveHistoryPreserved:true,tcpReceiveOnly:true,scheduleStopped:true,fileTransferStopped:true,staleEventsIgnored:true,failedConnectionNotReportedAsApplied:true,tcpListenerRebound:true,udpReconnected:true,rawLogPreserved:true,pageErrors:errors};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  await rpc('plugin:window|close',{label:'main'}).catch(e=>{if(!String(e).includes('has been closed'))throw e;});await Promise.race([exited,sleep(15000).then(()=>{throw Error('Close timeout');})]);
}finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();sockets.forEach(socket=>socket.destroy());first.close();second.close();udp.close();}
