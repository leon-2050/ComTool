"""Generate distribution notices from locked, installed Cargo/npm dependency sources."""
import json, re, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
metadata=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
out=root/'src-tauri'/'licenses';out.mkdir(exist_ok=True)
records=[];texts=[];missing=[]
def collect(kind,name,version,license,folder,source):
    candidates=[p for p in folder.iterdir() if p.is_file() and re.match(r'^(licen[cs]e|copying|notice|copyright|unlicense)([._-]|$)',p.name,re.I)]
    files=[]
    for p in candidates:
        try:text=p.read_text(encoding='utf-8')
        except (UnicodeError,OSError):continue
        files.append(p.name);texts.append(f'\n{"="*72}\n{kind}: {name} {version}\nSource: {source}\nLicense: {license}\nFile: {p.name}\n\n{text}\n')
    records.append(dict(ecosystem=kind,name=name,version=version,license=license,source=source,files=files))
    if not files:missing.append(f'{kind} {name} {version} ({license})')
for package in metadata['packages']:
    if package['name']=='comtool-rust':continue
    collect('Cargo',package['name'],package['version'],package.get('license'),Path(package['manifest_path']).parent,package.get('repository') or f'https://crates.io/crates/{package["name"]}/{package["version"]}')
lock=json.loads((root/'package-lock.json').read_text())
for key,value in lock['packages'].items():
    if not key:continue
    folder=root/key
    if not folder.exists():continue
    manifest=json.loads((folder/'package.json').read_text(encoding='utf-8'))
    collect('npm',manifest['name'],value['version'],manifest.get('license') or value.get('license'),folder,manifest.get('homepage') or f'https://www.npmjs.com/package/{manifest["name"]}/v/{value["version"]}')
(out/'DEPENDENCIES.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'THIRD-PARTY-LICENSES.txt').write_text('Locked build dependency license and notice texts.\nIncludes build/test tools; not all listed packages ship in the executable.\n'+''.join(texts),encoding='utf-8')
print(json.dumps({'dependencies':len(records),'licenseTexts':len(texts),'missingLicenseFiles':missing}))
