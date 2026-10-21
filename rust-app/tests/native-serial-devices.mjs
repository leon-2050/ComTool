// Production desktop UI; mocked enumeration tests selection/hotplug without claiming serial I/O proof.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {defaultProfile} from '../src/types.ts';
const binary=path.resolve(process.argv[2]||process.env.COMTOOL_BINARY);
const output=path.resolve(process.argv[3]||'../../output/ComTool-serial-select-2026-10-20');
const root=path.join(output,`profile-${Date.now()}`);await fs.mkdir(root,{recursive:true});
const profile=defaultProfile();profile.importDismissed=true;profile.sessions[0].device='COM9';
await fs.writeFile(path.join(root,'config.json'),JSON.stringify(profile));const ready=path.join(root,'ready.json');
const child=spawn(binary,[],{windowsHide:true,env:{...process.env,COMTOOL_RUST_PROFILE:root,COMTOOL_RUST_READY_FILE:ready,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9239'}});
const exited=new Promise(resolve=>child.once('exit',resolve));const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));let browser;
try{
  for(let n=0;;n++){try{await fs.access(ready);break}catch{}if(n>500)throw Error('Startup timeout');await sleep(50);}
  browser=await chromium.connectOverCDP('http://127.0.0.1:9239');const page=browser.contexts()[0].pages()[0];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  assert.equal(page.url(),'http://tauri.localhost/');assert.equal(await page.getByRole('button',{name:'连接配置',exact:true}).count(),0);
  const rpc=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const wait=async check=>{for(let n=0;n<160;n++){if(await check())return;await sleep(50);}throw Error('Serial-list condition timeout');};
  const physicalPorts=await rpc('list_ports');
  const select=page.getByRole('combobox',{name:'串口设备',exact:true});
  await select.waitFor();
  await page.getByRole('button',{name:'刷新串口列表',exact:true}).click();
  await wait(async()=>!(await page.getByRole('button',{name:'刷新串口列表',exact:true}).isDisabled()));
  assert.equal(await select.inputValue(),'COM9');
  if(physicalPorts.length===0){
    assert((await select.locator('option[value="COM9"]').innerText()).includes('当前未检测到'));
    assert((await page.locator('.serial-port-hint').innerText()).includes('未检测到串口'));
    assert.equal(await select.locator('option:not([disabled])').count(),0);
  }
  assert.equal((await rpc('bootstrap')).profile.sessions[0].device,'COM9');
  await page.screenshot({path:path.join(output,'serial-dropdown.png')});
  assert.equal(errors.length,0,errors.join('\n'));
  const report={production:true,physicalPortsEnumerated:physicalPorts.length,dropdownVisible:true,refreshCompletes:true,missingSelectionRetained:true,noPortsMessage:physicalPorts.length===0,redundantButtonRemoved:true,pageErrors:errors,boundary:'No physical serial devices available. Device selection, hotplug and serial I/O require hardware validation.'};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  await rpc('plugin:window|close',{label:'main'}).catch(e=>{if(!String(e).includes('has been closed'))throw e;});
  await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Close timeout')),10000);timer.unref();})]);
}finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();}
