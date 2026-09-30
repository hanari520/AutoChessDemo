"""Build a dependency-free GLB sample: raised 8x8 board and Suiji chibi."""
from __future__ import annotations

import json
import math
import struct
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "models" / "sample"
OUT.mkdir(parents=True, exist_ok=True)

COLORS = {
    "base": "#44375a", "base_top": "#6a5879", "edge": "#d6b179",
    "ally": "#bce8df", "ally_alt": "#d8f1e9", "enemy": "#e9b9cc",
    "enemy_alt": "#f3d4de", "line": "#f8e7b6", "glass": "#a6eadf",
    "shadow": "#74657b", "skin": "#f6d7c9", "hair": "#e7e8f0",
    "hair_dark": "#bfc0cf", "hat": "#ab264b", "red": "#b72849",
    "red_dark": "#711b38", "rose": "#d84867", "black": "#27222d",
    "black_light": "#453844", "white": "#fbf3ed", "gold": "#e5bd82",
    "eye": "#a62947", "eye_hi": "#fff5f0", "cheek": "#eb9fad",
    "sock": "#28232c", "boot": "#362931", "magic": "#91dfae",
}

parts: dict[str, list[tuple[list[tuple[float, float, float]], list[tuple[int, int, int]]]]] = defaultdict(list)

def add(mat, verts, faces):
    parts[mat].append((verts, faces))

def box(mat, cx, cy, cz, sx, sy, sz, open_top=False):
    x0, x1 = cx-sx/2, cx+sx/2
    y0, y1 = cy-sy/2, cy+sy/2
    z0, z1 = cz-sz/2, cz+sz/2
    v = [(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1),
         (x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)]
    f = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),
         (0,1,5),(0,5,4),(1,2,6),(1,6,5),
         (2,3,7),(2,7,6),(3,0,4),(3,4,7)]
    add(mat,v,f[4:] if open_top else f)

def ellipsoid(mat, cx, cy, cz, rx, ry, rz, stacks=7, sides=12):
    v=[]; f=[]
    for j in range(stacks+1):
        p=math.pi*j/stacks
        for i in range(sides):
            a=math.tau*i/sides
            v.append((cx+rx*math.sin(p)*math.cos(a),cy+ry*math.cos(p),cz+rz*math.sin(p)*math.sin(a)))
    for j in range(stacks):
        for i in range(sides):
            a=j*sides+i; b=j*sides+(i+1)%sides; c=a+sides; d=b+sides
            f.extend(((a,c,b),(b,c,d)))
    add(mat,v,f)

def frustum(mat,cx,y0,cz,r0,y1,r1,sides=16):
    v=[];f=[]
    for y,r in ((y0,r0),(y1,r1)):
        for i in range(sides):
            a=math.tau*i/sides
            v.append((cx+r*math.cos(a),y,cz+r*math.sin(a)))
    for i in range(sides):
        n=(i+1)%sides
        f.extend(((i,n,sides+n),(i,sides+n,sides+i)))
    add(mat,v,f)

def rod(mat,a,b,r,sides=8):
    ax,ay,az=a; bx,by,bz=b
    dx,dy,dz=bx-ax,by-ay,bz-az
    length=math.sqrt(dx*dx+dy*dy+dz*dz)
    if not length:return
    dx,dy,dz=dx/length,dy/length,dz/length
    ux,uy,uz=(-dz,0,dx) if abs(dy)<.94 else (1,0,0)
    ul=math.sqrt(ux*ux+uy*uy+uz*uz);ux,uy,uz=ux/ul,uy/ul,uz/ul
    vx,vy,vz=dy*uz-dz*uy,dz*ux-dx*uz,dx*uy-dy*ux
    v=[];f=[]
    for px,py,pz in (a,b):
        for i in range(sides):
            t=math.tau*i/sides
            v.append((px+r*(ux*math.cos(t)+vx*math.sin(t)),
                      py+r*(uy*math.cos(t)+vy*math.sin(t)),
                      pz+r*(uz*math.cos(t)+vz*math.sin(t))))
    for i in range(sides):
        n=(i+1)%sides
        f.extend(((i,n,sides+n),(i,sides+n,sides+i)))
    add(mat,v,f)

def build_board():
    box('base',0,-.19,0,8.72,.36,8.72,open_top=True)
    box('base_top',0,-.012,0,8.6,.055,8.6,open_top=True)
    box('edge',0,.025,-4.31,8.7,.07,.07)
    box('edge',0,.025,4.31,8.7,.07,.07)
    box('edge',-4.31,.025,0,.07,.07,8.7)
    box('edge',4.31,.025,0,.07,.07,8.7)
    for row in range(8):
        for col in range(8):
            name=('enemy' if row<4 else 'ally')+('_alt' if (row+col)%2 else '')
            box(name,col-3.5,.045,row-3.5,.958,.065,.958)
    box('line',0,.095,0,8.06,.028,.045)
    for x in (-3.95,3.95):
        for z in (-3.95,3.95):
            frustum('gold',x,.07,z,.13,.25,.105)
            ellipsoid('glass',x,.3,z,.087,.09,.087)
    for x in (-3.5,3.5):
        box('gold',x,-.215,4.375,.65,.14,.045)

def rose(x,y,z,s=.06):
    ellipsoid('rose',x,y,z,s,s*.7,s)
    for i in range(5):
        a=math.tau*i/5
        ellipsoid('red',x+math.cos(a)*s*.8,y+math.sin(a)*s*.25,z+math.sin(a)*s*.75,s*.57,s*.31,s*.43)

def build_suiji():
    x,z=-1.5,1.5
    # Ground pedestal and offset contact shadow.
    ellipsoid('shadow',x,.102,z,.35,.018,.26)
    frustum('red_dark',x,.12,z,.35,.17,.31)
    frustum('gold',x,.17,z,.315,.19,.29)
    # Legs, white stocking accents and chunky boots.
    for d in (-1,1):
        lx=x+d*.12
        rod('skin',(lx,.36,z),(lx+d*.018,.67,z-.005),.065)
        rod('sock',(lx,.37,z-.005),(lx+d*.012,.55,z-.005),.068)
        ellipsoid('boot',lx,.315,z-.065,.112,.09,.17)
        box('gold',lx,.36,z-.16,.13,.025,.025)
    # Bell skirt and checked dark panels.
    frustum('black',x,.6,z,.37,.91,.18)
    for d in (-1,1):
        rod('red_dark',(x+d*.16,.86,z-.18),(x+d*.28,.6,z-.19),.025)
        box('white',x+d*.19,.73,z-.33,.018,.22,.014)
    box('red',x,.64,z-.36,.23,.035,.025)
    ellipsoid('white',x,.94,z,.215,.25,.17)
    ellipsoid('black_light',x,.96,z+.08,.16,.17,.085)
    box('red',x,.84,z-.17,.19,.055,.025)
    ellipsoid('gold',x,.85,z-.2,.035,.04,.026)
    # Voluminous detached sleeves, hand reaching towards the camera.
    for d in (-1,1):
        sx=x+d*.225
        ellipsoid('white',sx,1.03,z,.12,.12,.125)
        rod('skin',(sx+d*.04,1.0,z-.035),(x+d*.41,.91,z-.14),.055)
        ellipsoid('skin',x+d*.43,.9,z-.15,.074,.066,.074)
        rod('red',(sx+d*.04,1.04,z+.03),(x+d*.36,.94,z+.03),.026)
    # Head, silver hair cap, bangs and flowing twin tails.
    ellipsoid('skin',x,1.36,z-.005,.28,.28,.245)
    ellipsoid('hair',x,1.51,z+.035,.305,.165,.265)
    for i in range(5):
        xx=x+(i-2)*.113
        ellipsoid('hair',xx,1.47,z-.19,.066,.12,.072)
    for d in (-1,1):
        xx=x+d*.29
        ellipsoid('hair_dark',xx,1.45,z+.02,.105,.15,.135)
        ellipsoid('red',xx,1.46,z-.01,.07,.058,.08)
        ellipsoid('hair',x+d*.405,1.35,z+.01,.155,.115,.15)
        ellipsoid('hair',x+d*.49,1.23,z+.07,.16,.12,.14)
        ellipsoid('hair_dark',x+d*.55,1.12,z+.12,.112,.105,.115)
        # Face details face the front of the board (negative z).
        ellipsoid('eye',x+d*.115,1.37,z-.224,.057,.077,.019)
        ellipsoid('eye_hi',x+d*.132,1.396,z-.244,.015,.024,.008)
        ellipsoid('cheek',x+d*.207,1.294,z-.2,.037,.018,.013)
    ellipsoid('red_dark',x,1.26,z-.25,.027,.013,.009)
    # Crimson beret, crossed crown branches and clustered roses.
    ellipsoid('red_dark',x,1.625,z+.035,.3,.055,.27)
    ellipsoid('hat',x,1.687,z+.05,.273,.095,.245)
    rod('gold',(x-.26,1.72,z-.03),(x+.23,1.81,z+.04),.018)
    rod('gold',(x+.22,1.71,z-.08),(x-.20,1.79,z+.10),.018)
    for dx,dz in ((-.21,-.11),(-.06,-.21),(.13,-.15),(.24,.06)):
        rose(x+dx,1.69,z+dz,.052)
    # Rose microphone / support spell, held beside the left hand.
    rod('black_light',(x-.43,.93,z-.17),(x-.58,1.24,z-.3),.019)
    rose(x-.59,1.27,z-.31,.085)
    ellipsoid('magic',x-.59,1.27,z-.31,.11,.014,.11)

def rgb(hexcolor):
    h=hexcolor.lstrip('#')
    return [int(h[i:i+2],16)/255 for i in (0,2,4)] + [1]

def pack_glb(selected, target):
    # One primitive per material. Flat-ish vertex normals keep the silhouette readable.
    blob=bytearray(); views=[]; accessors=[]; primitives=[]
    mats=list(COLORS)
    for material in mats:
        groups=[mesh for key, meshes in selected.items() if key==material for mesh in meshes]
        if not groups:continue
        vertices=[];indices=[]
        for v,f in groups:
            start=len(vertices);vertices.extend(v)
            indices.extend(start+i for tri in f for i in tri)
        def append(data,target_kind):
            while len(blob)%4:blob.append(0)
            offset=len(blob);blob.extend(data)
            views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data),'target':target_kind})
            return len(views)-1
        vb=append(b''.join(struct.pack('<fff',*p) for p in vertices),34962)
        ib=append(struct.pack('<'+'I'*len(indices),*indices),34963)
        lo=[min(p[i] for p in vertices) for i in range(3)]
        hi=[max(p[i] for p in vertices) for i in range(3)]
        accessors.append({'bufferView':vb,'componentType':5126,'count':len(vertices),'type':'VEC3','min':lo,'max':hi})
        ai=len(accessors)-1
        accessors.append({'bufferView':ib,'componentType':5125,'count':len(indices),'type':'SCALAR'})
        primitives.append({'attributes':{'POSITION':ai},'indices':len(accessors)-1,'material':mats.index(material),'mode':4})
    doc={'asset':{'version':'2.0','generator':'Codex procedural 3D sample'},
         'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':target.stem,'mesh':0}],
         'meshes':[{'name':target.stem,'primitives':primitives}],
         'materials':[{'name':name,'pbrMetallicRoughness':{'baseColorFactor':rgb(color),'metallicFactor':0,'roughnessFactor':.83},'doubleSided':True} for name,color in COLORS.items()],
         'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors}
    js=json.dumps(doc,separators=(',',':')).encode('utf-8')
    js+=b' ' * (-len(js)%4)
    blob.extend(b'\0'*(-len(blob)%4))
    target.write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(blob))+
                       struct.pack('<I4s',len(js),b'JSON')+js+
                       struct.pack('<I4s',len(blob),b'BIN\0')+blob)

if __name__=='__main__':
    build_board();board={k:list(v) for k,v in parts.items()}
    pack_glb(board,OUT/'stage_board.glb')
    parts.clear();build_suiji()
    pack_glb(parts,OUT/'suiji_chibi.glb')
    # Lightweight projection data for the browser preview, independently inspectable.
    (OUT/'sample_scene.json').write_text(json.dumps({'materials':COLORS,'board':board,'suiji':parts},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Wrote',OUT/'stage_board.glb',OUT/'suiji_chibi.glb')
