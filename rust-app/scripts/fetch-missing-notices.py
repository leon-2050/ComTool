"""Fetch missing crate license files at the package's published source commit."""
import concurrent.futures,json,sys,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1];metadata=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'));out=root/'src-tauri/licenses';inventory=json.loads((out/'DEPENDENCIES.json').read_text())
packages={p['name']:p for p in metadata['packages']};tasks=[]
for record in inventory:
    if record['files'] or record['ecosystem']!='Cargo':continue
    package=packages[record['name']];folder=Path(package['manifest_path']).parent
    vcs=json.loads((folder/'.cargo_vcs_info.json').read_text());repository=package['repository'].removesuffix('.git').removeprefix('https://github.com/')
    tasks.append((record,repository,vcs['git']['sha1']))
def fetch(task):
    record,repo,sha=task;found=[]
    for filename in ['LICENSE','LICENSE.txt','LICENSE-MIT','LICENSE-APACHE','LICENSE-BSD','COPYING','NOTICE']:
        url=f'https://raw.githubusercontent.com/{repo}/{sha}/{filename}'
        try:
            with urllib.request.urlopen(url,timeout=12) as response:body=response.read().decode('utf-8')
            found.append((filename,url,body))
        except Exception:continue
    return record,found
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for record,found in pool.map(fetch,tasks):
        if not found:print('MISSING',record['name']);continue
        with (out/'THIRD-PARTY-LICENSES.txt').open('a',encoding='utf-8') as file:
            for filename,url,body in found:file.write(f'\n{"="*72}\nCargo: {record["name"]} {record["version"]}\nSource: {url}\n\n{body}\n')
        record['files']=[name for name,_,_ in found];record['licenseSourceUrls']=[url for _,url,_ in found];print('OK',record['name'])
(out/'DEPENDENCIES.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
