// UI/terminal rendering tests only. Real native/protocol tests are separate.
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const output=path.resolve(process.argv[2]||'../../outputs/rust-ui');await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.COMTOOL_BROWSER_CHANNEL||undefined});const checks=[];
try{
  for(const dpr of [1,1.25,1.5,2]){
    const context=await browser.newContext({viewport:{width:1280,height:840},deviceScaleFactor:dpr});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:1420/');await page.getByRole('heading',{name:'串口收发',exact:true}).waitFor();
    await page.waitForFunction(()=>!!window.__COMTOOL_QA);
    const closed=page.getByRole('button',{name:'关闭 串口收发',exact:true});assert.equal(await closed.evaluate(e=>getComputedStyle(e).opacity),'0');
    const before=await page.locator('.workspace-tab').first().boundingBox();await page.locator('.workspace-tab').first().hover();assert.equal(await closed.evaluate(e=>getComputedStyle(e).opacity),'1');const after=await page.locator('.workspace-tab').first().boundingBox();assert.equal(before.width,after.width);
    await page.screenshot({path:path.join(output,`light-${dpr}.png`)});
    await page.getByRole('button',{name:'切换主题',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.screenshot({path:path.join(output,`dark-${dpr}.png`)});
    await page.getByRole('button',{name:'新建会话',exact:true}).click();await page.getByRole('button',{name:'SSH 会话',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'终端',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'收发',exact:true}).count(),0);await page.locator('.session-views:visible .xterm').waitFor();
    await page.evaluate(()=>{const qa=window.__COMTOOL_QA;const s=Array.from(document.querySelectorAll('.workspace-tab')).length;qa.injectData({sessionId:'unknown',peerId:'qa',sequence:1,bytes:[],datagram:false,timestamp:new Date().toISOString()});});
    // Read the generated session id through the first-party frontend model, then inject byte fixtures.
    await page.evaluate(async()=>{
      const {defaultSession}=await import('/src/types.ts');const s=defaultSession('ssh');s.id='terminal-qa';s.user='qa';s.name='SSH 终端';s.view='terminal';
      window.__COMTOOL_QA.setProfile({version:1,theme:'dark',activeId:s.id,sessions:[s],knownHosts:{},importDismissed:true});
    });
    await page.waitForTimeout(250);
    await page.evaluate(()=>{
      const text='\x1b[32mANSI green\x1b[0m  中文终端\r\n\x1b[38;5;208m256 orange\x1b[0m\r\n\x1b[38;2;120;180;240mRGB colour\x1b[0m\r\n127.0.0.1 --color <access denied>\r\n';
      window.__COMTOOL_QA.injectData({sessionId:'terminal-qa',peerId:'qa',sequence:1,bytes:[...new TextEncoder().encode(text)],datagram:false,timestamp:new Date().toISOString()});
    });
    await page.waitForTimeout(300);await page.screenshot({path:path.join(output,`terminal-${dpr}.png`)});
    assert.equal(errors.length,0,errors.join('\n'));checks.push({dpr,theme:'light/dark',tabsNoLayoutShift:true,terminalFixtureRendered:true,pageErrors:errors});
    await context.close();
  }
  for(const [width,height] of [[1100,840],[900,640],[850,640],[800,560]]){
    const context=await browser.newContext({viewport:{width,height}});const page=await context.newPage();await page.goto('http://127.0.0.1:1420/');await page.getByRole('heading',{name:'串口收发',exact:true}).waitFor();
    assert(await page.locator('.drawer').isVisible());assert.equal(await page.getByRole('button',{name:'关闭配置',exact:true}).count(),0);
    assert.equal(await page.locator('.sidebar').isVisible(),false);await page.getByRole('button',{name:'切换会话侧栏',exact:true}).click();assert(await page.locator('.sidebar').isVisible());assert(await page.locator('.drawer').isVisible());
    await page.getByRole('textbox',{name:'查找会话',exact:true}).fill('不存在');assert.equal(await page.locator('.session-item').count(),0);await page.getByRole('textbox',{name:'查找会话',exact:true}).fill('');
    await page.locator('.session-item').first().click();assert.equal(await page.locator('.sidebar').isVisible(),false);
    assert.equal(await page.getByRole('button',{name:'连接配置',exact:true}).count(),0);assert(await page.getByRole('combobox',{name:'串口设备',exact:true}).isVisible());await page.keyboard.press('Control+,');assert(await page.locator('.drawer input:focus,.drawer select:focus').count());
    for(const theme of ['light','dark']){
      const bounds=await page.locator('.config-footer').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
      await page.getByRole('button',{name:'发送',exact:true}).scrollIntoViewIfNeeded();const send=await page.getByRole('button',{name:'发送',exact:true}).boundingBox();assert(send.x>=0&&send.x+send.width<=width&&send.y+send.height<=height);
      assert(await page.locator('.workbench').evaluate(e=>e.scrollWidth<=e.clientWidth));
      await page.screenshot({path:path.join(output,`persistent-${width}-${theme}.png`)});if(theme==='light')await page.getByRole('button',{name:'切换主题',exact:true}).click();
    }
    await page.getByRole('button',{name:'关闭 串口收发',exact:true}).click();await page.getByRole('heading',{name:'一个工作台，连接你的设备',exact:true}).waitFor();
    checks.push({width,height,persistentSettings:true,sidebarAccessible:true,noClippedActions:true,closeLastSession:true});await context.close();
  }
  const context=await browser.newContext({viewport:{width:1280,height:840}});const page=await context.newPage();await page.goto('http://127.0.0.1:1420/');await page.waitForFunction(()=>!!window.__COMTOOL_QA);
  const id=await page.evaluate(()=>{const qa=window.__COMTOOL_QA;const s=qa.profile().sessions[0];qa.setStatus({[s.id]:{sessionId:s.id,generation:1,state:'connected',message:'QA',peers:[],rx:0,tx:0,dropped:0}});return s.id;});
  await page.getByRole('spinbutton',{name:'波特率',exact:true}).fill('9600');assert.equal(await page.getByRole('spinbutton',{name:'波特率',exact:true}).inputValue(),'9600');assert((await page.locator('.session-heading').innerText()).includes('115200'));
  assert.equal(await page.evaluate(id=>window.__COMTOOL_QA.profile().sessions.find(s=>s.id===id).baud,id),115200);
  await page.getByRole('button',{name:'新建会话',exact:true}).click();await page.getByRole('button',{name:'TCP 会话',exact:true}).click();await page.locator('.workspace-tab').filter({hasText:'串口收发'}).click();assert.equal(await page.getByRole('spinbutton',{name:'波特率',exact:true}).inputValue(),'9600');
  await page.getByRole('button',{name:'撤销修改',exact:true}).click();assert.equal(await page.getByRole('spinbutton',{name:'波特率',exact:true}).inputValue(),'115200');
  await page.getByText('收发与显示',{exact:true}).click();assert(await page.getByRole('spinbutton',{name:'波特率',exact:true}).isVisible());
  await page.getByRole('spinbutton',{name:'波特率',exact:true}).fill('9600');await page.getByRole('spinbutton',{name:'波特率',exact:true}).fill('115200');
  await page.evaluate(id=>window.__COMTOOL_QA.setStatus({[id]:{sessionId:id,generation:1,state:'disconnected',message:'已断开',peers:[],rx:0,tx:0,dropped:0}}),id);
  await page.getByRole('spinbutton',{name:'波特率',exact:true}).fill('57600');assert.equal(await page.evaluate(id=>window.__COMTOOL_QA.profile().sessions.find(s=>s.id===id).baud,id),57600);assert.equal(await page.getByRole('spinbutton',{name:'波特率',exact:true}).inputValue(),'57600');
  await page.getByRole('combobox',{name:'连接类型',exact:true}).selectOption('tcp');await page.getByRole('combobox',{name:'工作模式',exact:true}).selectOption('server');await page.getByRole('combobox',{name:'连接类型',exact:true}).selectOption('ssh');
  assert.equal(await page.evaluate(id=>window.__COMTOOL_QA.profile().sessions.find(s=>s.id===id).server,id),false);assert(await page.getByRole('checkbox',{name:'断开后自动重连',exact:true}).isVisible());
  checks.push({draftDoesNotChangeRunningConnection:true,draftSurvivesSessionSwitch:true,undo:true,manualRevertRestoresOfflineAutoSave:true,connectionKindNormalizesServerMode:true,optionsDoNotReplaceConnectionFields:true});await context.close();

}finally{await browser.close()}
await fs.writeFile(path.join(output,'ui-check.json'),JSON.stringify({boundary:'Chromium UI/terminal fixture rendering; no native I/O proof',checks},null,2));console.log(JSON.stringify({passed:checks.length,output}));
