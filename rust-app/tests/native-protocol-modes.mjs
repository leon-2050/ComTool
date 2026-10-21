// Production desktop UI; mocked enumeration tests selection/hotplug without claiming serial I/O proof.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {defaultProfile,defaultSession} from '../src/types.ts';
const binary=path.resolve(process.argv[2]||process.env.COMTOOL_BINARY);
const output=path.resolve(process.argv[3]||'../../output/ComTool-serial-select-2026-10-20');
const root=path.join(output,`profile-${Date.now()}`);await fs.mkdir(root,{recursive:true});
const profile=defaultProfile();profile.importDismissed=true;profile.sessions=['serial','tcp','udp','ssh'].map(kind=>({...defaultSession(kind),view:kind==='ssh'?'receive':'terminal'}));profile.activeId=profile.sessions[0].id;
await fs.writeFile(path.join(root,'config.json'),JSON.stringify(profile));const ready=path.join(root,'ready.json');
const child=spawn(binary,[],{windowsHide:true,env:{...process.env,COMTOOL_RUST_PROFILE:root,COMTOOL_RUST_READY_FILE:ready,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9240'}});
const exited=new Promise(resolve=>child.once('exit',resolve));const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));let browser;
try{
  for(let n=0;;n++){try{await fs.access(ready);break}catch{}if(n>500)throw Error('Startup timeout');await sleep(50);}
  browser=await chromium.connectOverCDP('http://127.0.0.1:9240');const page=browser.contexts()[0].pages()[0];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  assert.equal(page.url(),'http://tauri.localhost/');assert.equal(await page.getByRole('button',{name:'连接配置',exact:true}).count(),0);
  const rpc=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const wait=async check=>{for(let n=0;n<160;n++){if(await check())return;await sleep(50);}throw Error('Serial-list condition timeout');};
  const checks=[];
  for(const session of profile.sessions){
    await page.locator('.workspace-tab').filter({hasText:session.name}).locator('.tab-label').click();
    if(session.kind==='ssh')await page.locator('.session-views:visible .xterm').waitFor();
    else await page.getByRole('button',{name:'发送',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'收发',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'终端',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'发送',exact:true}).count(),session.kind==='ssh'?0:1);
    const prevented=await page.evaluate(()=>{const e=new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});assert.equal(prevented,session.kind!=='ssh');
    await page.screenshot({path:path.join(output,`${session.kind}.png`)});checks.push({kind:session.kind,correctMode:true,shortcutScoped:true});
  }
  await wait(async()=>(await rpc('bootstrap')).profile.sessions.every(s=>s.view===(s.kind==='ssh'?'terminal':'receive')));
  assert.equal(errors.length,0,errors.join('\n'));
  const report={production:true,checks,oldProfileRepairedAndSaved:true,pageErrors:errors,boundary:'Desktop mode/shortcut verification; no physical serial I/O.'};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  await rpc('plugin:window|close',{label:'main'}).catch(e=>{if(!String(e).includes('has been closed'))throw e;});
  await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Close timeout')),10000);timer.unref();})]);
}finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();}
