// Runs the actual Tauri executable, with an isolated profile and WebView2 CDP.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {defaultProfile} from '../src/types.ts';
const binary=path.resolve(process.argv[2]||'../../work/rust-target/release/ComTool.exe');
const output=path.resolve(process.argv[3]||'../../outputs/rust-native');await fs.mkdir(output,{recursive:true});
const root=path.join(output,`profile-${Date.now()}`);await fs.mkdir(root,{recursive:true});
const p=defaultProfile();p.importDismissed=true;await fs.writeFile(path.join(root,'config.json'),JSON.stringify(p));
const ready=path.join(root,'ready.json');const start=performance.now();
const child=spawn(binary,[],{windowsHide:true,env:{...process.env,COMTOOL_RUST_PROFILE:root,COMTOOL_RUST_READY_FILE:ready,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9223 --disable-background-timer-throttling'}});
const exited=new Promise(resolve=>child.once('exit',resolve));
let browser;
try{
  for(;;){try{await fs.access(ready);break}catch{}if(performance.now()-start>25000)throw new Error('Native startup readiness timed out');await new Promise(r=>setTimeout(r,50));}
  const seconds=(performance.now()-start)/1000;browser=await chromium.connectOverCDP('http://127.0.0.1:9223');const page=browser.contexts()[0].pages()[0];
  await page.getByRole('heading',{name:'串口收发',exact:true}).waitFor();
  const native=await page.evaluate(()=>!!window.__TAURI_INTERNALS__);if(!native)throw new Error('The page is not the native Tauri application');
  const boot=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('bootstrap'));
  const ports=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('list_ports'));
  await page.screenshot({path:path.join(output,'native-light.png')});
  await page.getByRole('button',{name:'连接配置',exact:true}).click();await page.screenshot({path:path.join(output,'native-config.png')});
  const report={native:true,seconds,sessionCount:boot.profile.sessions.length,portsEnumerated:ports.length,errors:boot.startupError};
  await fs.writeFile(path.join(output,'native-smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})).catch(e=>{if(!String(e).includes('has been closed'))throw e});
  await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Native close timed out')),10000);timer.unref()})]);
}finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();}
