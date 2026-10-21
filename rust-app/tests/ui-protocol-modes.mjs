import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve(process.argv[2]);await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});const checks=[];
try{const page=await browser.newPage({viewport:{width:1280,height:840}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:1420');await page.waitForFunction(()=>window.__COMTOOL_QA);
for(const kind of ['serial','tcp','udp','ssh'])for(const server of kind==='tcp'||kind==='udp'?[false,true]:[false]){
 await page.evaluate(async({kind,server})=>{const {defaultSession,defaultProfile}=await import('/src/types.ts');const s={...defaultSession(kind),server,view:kind==='ssh'?'receive':'terminal'};window.__COMTOOL_QA.setProfile({...defaultProfile(),sessions:[s],activeId:s.id});},{kind,server});
 await page.waitForFunction(kind=>window.__COMTOOL_QA.profile().sessions[0].view===(kind==='ssh'?'terminal':'receive'),kind);
 assert.equal(await page.getByRole('button',{name:'终端',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'收发',exact:true}).count(),0);
 if(kind==='ssh'){await page.locator('.session-views:visible .xterm').waitFor();assert.equal(await page.getByRole('button',{name:'发送',exact:true}).count(),0);assert.equal(await page.getByRole('combobox',{name:'工作模式',exact:true}).count(),0);}else{assert(await page.getByRole('button',{name:'发送',exact:true}).isVisible());assert.equal(await page.locator('.session-views:visible .xterm').count(),0);}
 await page.locator('.settings-options').evaluate(e=>{e.open=true});assert.equal(await page.getByRole('checkbox',{name:'终端关键词高亮',exact:true}).count(),kind==='ssh'?1:0);assert.equal(await page.getByRole('checkbox',{name:'接收数据显示时间戳',exact:true}).count(),kind==='ssh'?0:1);assert.equal(await page.getByRole('combobox',{name:'自动追加换行',exact:true}).count(),kind==='ssh'?0:1);
 const prevented=await page.evaluate(()=>{const event=new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});assert.equal(prevented,kind!=='ssh');
 await page.screenshot({path:path.join(output,`${kind}-${server?'server':'client'}.png`)});checks.push({kind,server,legacyViewCorrected:true,irrelevantControlsAbsent:true});
}
assert.equal(errors.length,0);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({checks,pageErrors:errors,boundary:'UI fixtures, not protocol I/O'},null,2));console.log(JSON.stringify({passed:checks.length}));}finally{await browser.close();}
