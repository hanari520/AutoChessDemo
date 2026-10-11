"""Verify existing entry and character paths; emits a provenance-aware inventory."""
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
units=json.loads((ROOT/'tools/units.json').read_text(encoding='utf-8'))
manifest=json.loads((ROOT/'assets/redraw_manifest.json').read_text(encoding='utf-8'))
rows={row['id']:row for row in manifest['units']}
assert len(units)==len(rows)==50
assert {unit['id'] for unit in units}==set(rows)
characters=[]
for unit in units:
    row=rows[unit['id']]
    for path in [row['source'],*row['production']]:
        assert (ROOT/path).is_file(),path
    portrait=f"assets/units_big/{unit['id']}.webp"
    with Image.open(ROOT/portrait) as im:
        im.load()
        assert im.size==(512,512)
        assert im.mode=='RGBA'
        characters.append({'id':unit['id'],'displayName':unit['name'],'portrait':portrait,'size':list(im.size),'mode':im.mode,'legacyManifestSource':row['source'],'provenance':'Existing project redraw; generation prompt/model/licensing provenance not recorded'})
entries=[]
for path,network in [('classic.html','local game'),('arena.html','online service required for matches'),('online.html','online room service required'),('survival.html','local game'),('rpg/classic.html','local prototype')]:
    assert (ROOT/path).is_file(),path
    entries.append({'path':path,'network':network,'verification':'Entry exists; not a complete gameplay regression'})
report={'date':'2026-10-11','entries':entries,'characters':characters,'notes':['Case-sensitive legacy ID liAn retained','50 base characters; do not advertise 100 outfit variants as currently playable','Assets units_redraw are deployment-excluded source art; units_big production portraits are used at runtime']}
out=ROOT/'specs/game-library/implementation/P01-inventory.json'
out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'PASS: {len(entries)} entry files and {len(characters)} decoded character portraits; {out}')
