"""20 starts per Release app, same one-session disconnected serial scenario."""
import json, os, statistics, subprocess, time
from pathlib import Path
import psutil
root=Path(__file__).resolve().parents[3];out=root/'outputs/rust-benchmark';out.mkdir(exist_ok=True)
old_exe=root/'outputs/ComTool-release/ComTool/ComTool.exe';new_exe=root/'work/rust-target/release/ComTool.exe'
legacy=json.loads((root/'work/startup-two-session-config.json').read_text(encoding='utf-8'));legacy['items']=legacy['items'][:1];legacy['currItem']='收发'
fresh={'version':1,'theme':'light','activeId':'benchmark','sessions':[{'id':'benchmark','name':'串口收发','kind':'serial','view':'receive','fontSize':14}],'knownHosts':{},'importDismissed':True}
results={}
for name,exe in [('python',old_exe),('rust',new_exe)]:
    profile=out/name;profile.mkdir(exist_ok=True);env=os.environ.copy();samples=[]
    if name=='python':
        config=profile/'COMTool';config.mkdir(exist_ok=True);(config/'config.json').write_text(json.dumps(legacy),encoding='utf-8');env['APPDATA']=str(profile)
        # Real desktop GUI; identical scale/font scenario rather than Qt offscreen.
        env.pop('QT_QPA_PLATFORM',None);env['QT_SCALE_FACTOR']='1';marker=profile/'ready.json';env['COMTOOL_STARTUP_PROBE']=str(marker)
    else:
        (profile/'config.json').write_text(json.dumps(fresh),encoding='utf-8');env['COMTOOL_RUST_PROFILE']=str(profile);env['WEBVIEW2_USER_DATA_FOLDER']=str(profile/'webview');marker=profile/'ready.json';env['COMTOOL_RUST_READY_FILE']=str(marker)
    for n in range(21):
        marker.unlink(missing_ok=True);started=time.perf_counter();process=subprocess.Popen([str(exe)],env=env,cwd=exe.parent,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            while not marker.exists():
                if process.poll() is not None or time.perf_counter()-started>30:raise RuntimeError(f'{name} startup failed')
                time.sleep(.01)
            ready=time.perf_counter()-started;parent=psutil.Process(process.pid);tree=[parent]+parent.children(recursive=True)
            def metrics():
                working=private=cpu=0
                for p in tree:
                    try:m=p.memory_info();working+=m.rss;private+=getattr(m,'private',m.vms);cpu+=p.cpu_times().user+p.cpu_times().system
                    except psutil.Error:pass
                return working,private,cpu
            working,private,cpu=metrics();time.sleep(.5);_,_,later=metrics()
            record={'sample':n,'seconds':ready,'workingSetBytes':working,'privateBytes':private,'startupCpuSeconds':cpu,'idleCpuPercentOneCore':(later-cpu)/.5*100,'processCount':len(tree)}
            samples.append(record);print(json.dumps({'app':name,**record}),flush=True)
        finally:
            try:children=psutil.Process(process.pid).children(recursive=True)
            except psutil.Error:children=[]
            for p in reversed(children):
                try:p.kill()
                except psutil.Error:pass
            process.kill();process.wait(timeout=10)
        time.sleep(.2)
    warm=samples[1:];times=sorted(s['seconds'] for s in warm)
    results[name]={'exe':str(exe),'coldFirst':samples[0],'samples':warm,'medianSeconds':statistics.median(times),'p95Seconds':times[18],'medianWorkingSetBytes':statistics.median(s['workingSetBytes'] for s in warm),'medianPrivateBytes':statistics.median(s['privateBytes'] for s in warm),'medianIdleCpuPercentOneCore':statistics.median(s['idleCpuPercentOneCore'] for s in warm)}
reduction=1-results['rust']['medianSeconds']/results['python']['medianSeconds'];report={'scenario':'one disconnected serial receive session, light theme, real Windows GUI; first cold sample separate, same profile reused for 20 starts','measurement':'process spawn until UI ready marker; Python marker includes a 50ms timer, Rust marker follows frontend initialization; polling 10ms','memoryNote':'sum of working sets includes shared pages more than once; private bytes also reported','results':results,'medianReduction':reduction,'startupTargetMet':results['rust']['medianSeconds']<=2 and reduction>=.3}
(out/'startup-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({'medians':{k:v['medianSeconds'] for k,v in results.items()},'reduction':reduction,'targetMet':report['startupTargetMet']}))
