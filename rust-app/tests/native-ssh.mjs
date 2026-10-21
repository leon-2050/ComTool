import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {defaultProfile,defaultSession} from '../src/types.ts';
const output=path.resolve(process.env.COMTOOL_SSH_OUTPUT||'../../outputs/rust-ssh');await fs.mkdir(output,{recursive:true});const root=path.join(output,`run-${Date.now()}`);await fs.mkdir(root,{recursive:true});
const fixture=spawn(path.resolve(process.env.COMTOOL_SSH_PYTHON||'../../work/.venv/Scripts/python.exe'),['tests/ssh-fixture.py',root],{windowsHide:true});const sleep=ms=>new Promise(r=>setTimeout(r,ms));let child,browser;
try{
  const ready=path.join(root,'ssh-ready.json');for(let n=0;;n++){try{await fs.access(ready);break}catch{}if(n>400)throw Error('SSH fixture timeout');await sleep(50)}
  const {port,rejectPort}=JSON.parse(await fs.readFile(ready,'utf8'));const p=defaultProfile();p.importDismissed=true;p.sessions=[];
  for(const [name,keyFile,remote] of [['密码认证','',port],['私钥认证',path.join(root,'client.pem'),port],['加密私钥',path.join(root,'encrypted.pem'),port],['拒绝PTY','',rejectPort]]){const s=defaultSession('ssh');s.name=name;s.user='probe';s.port=remote;s.keyFile=keyFile;s.logPath=path.join(root,`${p.sessions.length}.bin`);p.sessions.push(s)}
  p.activeId=p.sessions[0].id;await fs.writeFile(path.join(root,'config.json'),JSON.stringify(p));const uiReady=path.join(root,'ui-ready');
  child=spawn(path.resolve(process.env.COMTOOL_BINARY||'../../work/rust-target/release/ComTool.exe'),[],{windowsHide:true,env:{...process.env,COMTOOL_RUST_PROFILE:root,COMTOOL_RUST_READY_FILE:uiReady,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9225'}});const exited=new Promise(r=>child.once('exit',r));
  for(let n=0;;n++){try{await fs.access(uiReady);break}catch{}if(n>500)throw Error('UI timeout');await sleep(50)}
  browser=await chromium.connectOverCDP('http://127.0.0.1:9225');const page=browser.contexts()[0].pages()[0];
  const rpc=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const wait=async check=>{for(let n=0;n<400;n++){if(await check())return;await sleep(50)}throw Error('SSH condition timed out')};
  const results=[];
  for(let i=0;i<4;i++){
    const s=p.sessions[i];await page.locator('.workspace-tab').filter({hasText:s.name}).click();assert(await page.locator('.drawer').isVisible());
    if(i===0||i===3)await page.locator('input[type=password]').first().fill('fixture-password');
    if(i===0)await page.getByRole('checkbox',{name:'在 Windows 凭据管理器记住密码',exact:true}).check();
    if(i===2)await page.locator('input[type=password]').last().fill('fixture-passphrase');
    await page.locator('.session-actions').getByRole('button',{name:'连接',exact:true}).click();
    if(i===0||i===3){await page.getByRole('button',{name:'信任并连接',exact:true}).click()}
    await wait(async()=>{const status=(await rpc('statuses')).find(v=>v.sessionId===s.id);if(i!==3&&status?.state==='error')throw Error(`${s.name}: ${status.message}`);return status?.state===(i===3?'error':'connected')});
    if(i===3){const status=(await rpc('statuses')).find(v=>v.sessionId===s.id);assert.match(status.message,/拒绝 PTY/);results.push({case:s.name,rejectionVisible:true});continue}
    await rpc('resize_terminal',{sessionId:s.id,cols:120,rows:42});await rpc('send_terminal_input',{sessionId:s.id,text:'echo 中文\r',peer:null});
    await wait(async()=> (await rpc('statuses')).find(v=>v.sessionId===s.id).rx>70);await sleep(100);await page.screenshot({path:path.join(output,`ssh-${i}.png`)});
    // Reapply each authentication mode; empty fields reuse prepared runtime/keyring credentials.
    const oldGeneration=(await rpc('statuses')).find(v=>v.sessionId===s.id).generation;
    if(i===0){await page.locator('input[type=password]').first().fill('');await page.getByRole('checkbox',{name:'在 Windows 凭据管理器记住密码',exact:true}).uncheck();}
    else {if(i===2)await page.locator('input[type=password]').last().fill('');await page.getByRole('checkbox',{name:'断开后自动重连',exact:true}).check();}
    await page.getByRole('button',{name:'应用并重连',exact:true}).click();
    await wait(async()=>{const status=(await rpc('statuses')).find(v=>v.sessionId===s.id);if(status?.generation>oldGeneration&&status?.state==='error')throw Error(status.message);return status?.generation>oldGeneration&&status?.state==='connected';});await page.getByText('参数已生效',{exact:true}).waitFor();
    if(i===0){
      const generation=(await rpc('statuses')).find(v=>v.sessionId===s.id).generation;
      await page.getByRole('checkbox',{name:'断开后自动重连',exact:true}).check();await page.getByRole('button',{name:'应用并重连',exact:true}).click();
      await wait(async()=>{const status=(await rpc('statuses')).find(v=>v.sessionId===s.id);return status?.generation>generation&&status?.state==='connected';});await page.getByText('参数已生效',{exact:true}).waitFor();
    }
    await rpc('disconnect_session',{sessionId:s.id});await wait(async()=> (await rpc('statuses')).find(v=>v.sessionId===s.id).state==='disconnected');
    const raw=await fs.readFile(s.logPath);assert(raw.includes(Buffer.from('中文')));assert(raw.includes(Buffer.from('\x1b[38;2;')));assert(raw.includes(Buffer.from('echo 中文\r')));results.push({case:s.name,rawANSI:true,Chinese:true,echo:true,appliedAndReconnected:true,emptyCredentialFieldsReused:true});
  }
  const boot=await rpc('bootstrap');assert.equal(Object.keys(boot.profile.knownHosts).length,2);assert(!JSON.stringify(boot.profile).includes('fixture-password'));
  // Rotate the actual server key on the same endpoint; saved trust must reject it.
  const beforeAuth=(await fs.readFile(path.join(root,'ssh-events.jsonl'),'utf8')).split('\n').filter(v=>v.includes('"auth"')).length;
  await fs.writeFile(path.join(root,'rotate-host'),'rotate');await page.locator('.workspace-tab').filter({hasText:p.sessions[0].name}).click();
  await page.getByRole('checkbox',{name:'断开后自动重连',exact:true}).uncheck();
  await page.locator('.session-actions').getByRole('button',{name:'连接',exact:true}).click();
  await wait(async()=> (await rpc('statuses')).find(v=>v.sessionId===p.sessions[0].id)?.state==='error');
  assert.match((await rpc('statuses')).find(v=>v.sessionId===p.sessions[0].id).message,/主机密钥已变化/);
  const afterAuth=(await fs.readFile(path.join(root,'ssh-events.jsonl'),'utf8')).split('\n').filter(v=>v.includes('"auth"')).length;assert.equal(afterAuth,beforeAuth);
  await rpc('disconnect_session',{sessionId:p.sessions[3].id});await sleep(150);
  const configPath=path.join(root,'config.json');const disk=JSON.parse(await fs.readFile(configPath,'utf8'));assert.equal(Object.keys(disk.knownHosts).length,2);
  await rpc('plugin:window|close',{label:'main'}).catch(e=>{if(!String(e).includes('has been closed'))throw e});await Promise.race([exited,sleep(15000).then(()=>{throw Error('Close timeout')})]);
  const events=(await fs.readFile(path.join(root,'ssh-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert(events.some(e=>e.pty==='xterm-256color'));assert(events.some(e=>e.resize?.[0]===120&&e.resize?.[1]===42));assert(events.filter(e=>e.auth==='publickey'&&e.ok).length>=2);
  const report={native:true,results,hostKeyConfirmedAndRemembered:true,changedHostKeyRejectedBeforeAuth:true,term:'xterm-256color',resizeVerified:true,passwordExcludedFromProfile:true,events};await fs.writeFile(path.join(output,'ssh-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(browser)await browser.close().catch(()=>{});if(child&&child.exitCode===null)child.kill();fixture.kill()}
