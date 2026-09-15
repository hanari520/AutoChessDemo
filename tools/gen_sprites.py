# -*- coding: utf-8 -*-
"""参数化像素立绘生成器：为 50 名棋子生成 Q 版透明底头像。
输出: <repo>/assets/units/<id>.png (128x128, 64 网格 x2 NEAREST)
预览: <repo>/tools/sprite_sheet.png
"""
import json, os
from PIL import Image, ImageDraw, ImageFilter

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)
OUT_DIR = os.path.join(REPO, "assets", "units")
SHEET = os.path.join(TOOLS, "sprite_sheet.png")
G = 64  # 逻辑网格

# ---------------- 调色板 ----------------
HAIR = {
    "silver":  ("#cfd4e0", "#9aa2b8", "#f2f5fb"),
    "black":   ("#424761", "#2a2e44", "#5d6484"),
    "brown":   ("#a4714d", "#7c5236", "#c99a6f"),
    "blonde":  ("#f0d264", "#cfa93c", "#fae9a0"),
    "pink":    ("#f2a7c3", "#d17ea3", "#fad3e2"),
    "rose":    ("#e58aa0", "#bf5f7d", "#f7b8c9"),
    "red":     ("#d95f5f", "#a83e46", "#f1938c"),
    "crimson": ("#c94f6d", "#98354f", "#ec8ba0"),
    "orange":  ("#f0a05a", "#c4763a", "#f8c68e"),
    "green":   ("#7fc98f", "#55a06a", "#b1e6ba"),
    "teal":    ("#6fc7bd", "#479a92", "#a5e4da"),
    "blue":    ("#7da7e8", "#5379c0", "#b3cdf5"),
    "navy":    ("#6a7bd4", "#47539f", "#93a1e8"),
    "purple":  ("#b08ae0", "#8560bd", "#d4b8f2"),
    "lavender":("#c7b8ea", "#9c8ac6", "#e6dcf8"),
    "white":   ("#eeeef4", "#c2c4d2", "#ffffff"),
    "grey":    ("#aab0bd", "#7f8595", "#d2d6de"),
    "mint":    ("#9fdcc0", "#6fb397", "#c9f0dd"),
}
EYES = {"gold": "#f0c040", "red": "#e05555", "blue": "#5a86e8", "green": "#48b868",
        "purple": "#9a6ae0", "brown": "#96603a", "pink": "#ef8fb2", "teal": "#3cb8ac"}
SKIN = ("#ffe3c8", "#f3c8a4")   # base / shade
LINE = "#232637"

# 阵营 → 服装主色/饰色
FAC_OUTFIT = {
    "魔道":  ("#6d4fa8", "#c9a7f2"), "工造":  ("#c98f3a", "#f2dfae"),
    "星际":  ("#8a5fd0", "#f0d080"), "毛茸乐园": ("#e08b4a", "#ffe9c9"),
    "森之国": ("#4f9e63", "#bfe6c6"), "学园":  ("#3f6f9e", "#a8d8f0"),
    "夜幕":  ("#3a3f66", "#8f96c9"), "花语":  ("#c95f7d", "#f6c9d8"),
    "深海":  ("#3f8f9e", "#a0e0e6"), "音律":  ("#d477a8", "#fbe0ee"),
    "四禧丸子": ("#cf5050", "#f8e0c9"), "P-SP": ("#3f6fc9", "#c9d8f8"),
}
JOB_PROP = {"守护": "shield", "刀客": "katana", "狂战": "axe", "刺客": "dagger",
            "游侠": "bow", "法师": "staff", "咒术": "flask", "医者": "cross",
            "歌势": "mic", "偶像": "starwand"}

# ---------------- 每人外观表 ----------------
# hair: 发色 key / style: 发型 / eye: 瞳色 / orn: 头饰 / male: 男生风格
# ears: 兽耳 (cat|dog|wolf|deer|bird|fox) / ahoge: 呆毛 / blush: 腮红
O = {
 "ein":     dict(hair="lavender", style="hime",    eye="purple", orn="hairpin"),
 "kouichi": dict(hair="blonde",  style="spiky",   eye="gold",  male=True),
 "yua":     dict(hair="pink",    style="wavy",    eye="blue",  orn="star"),
 "goutan":  dict(hair="brown",   style="bob",     eye="brown", ears="deer", orn="flower"),
 "yujiu":   dict(hair="mint",    style="short",   eye="teal",  ears="bird", ahoge=True),
 "songlv":  dict(hair="green",   style="short",   eye="green"),
 "likou":   dict(hair="rose",    style="twintail",eye="pink",  orn="ribbon"),
 "agari":   dict(hair="orange",  style="sidetail",eye="gold",  orn="star"),
 "hoshimi": dict(hair="navy",    style="long",    eye="red",   orn="hairpin"),
 "chiharu": dict(hair="brown",   style="ponytail",eye="green"),
 "suiji":   dict(hair="green",   style="long",    eye="gold",  ahoge=True, orn="flower"),
 "kanban":  dict(hair="brown",   style="bob",     eye="brown", ears="cat", blush=True),
 "zhouyi":  dict(hair="black",   style="ponytail",eye="red"),
 "yuji":    dict(hair="blue",    style="long",    eye="blue",  orn="hairpin"),
 "tiandou": dict(hair="brown",   style="bun",     eye="brown", blush=True),
 "aza":     dict(hair="silver",  style="spiky",   eye="blue",  male=True),
 "pako":    dict(hair="blonde",  style="short",   eye="green", orn="ribbon"),
 "zhijin":  dict(hair="purple",  style="hime",    eye="purple", orn="flower"),
 "sishi":   dict(hair="grey",    style="sidetail",eye="teal"),
 "sumi":    dict(hair="black",   style="hime",    eye="gold"),
 "yukie":   dict(hair="pink",    style="long",    eye="blue",  orn="hairpin", blush=True),
 "miting":  dict(hair="blonde",  style="wavy",    eye="purple", orn="star"),
 "xuezhu":  dict(hair="white",   style="wavy",    eye="blue",  orn="hairpin"),
 "zeyin":   dict(hair="teal",    style="ponytail",eye="teal"),
 "sanli":   dict(hair="silver",  style="bob",     eye="blue",  orn="ribbon"),
 "diansu":  dict(hair="pink",    style="twintail",eye="red",   blush=True),
 "lianshiye":dict(hair="navy",   style="hime",    eye="red",   orn="flower"),
 "huize":   dict(hair="grey",    style="wavy",    eye="green"),
 "shengge": dict(hair="crimson", style="sidetail",eye="red",   orn="star"),
 "shadow":  dict(hair="black",   style="short",   eye="red"),
 "nox":     dict(hair="green",   style="twintail",eye="gold",  ears="bird"),
 "miyue":   dict(hair="white",   style="long",    eye="blue",  orn="moon"),
 "huali":   dict(hair="rose",    style="wavy",    eye="pink",  orn="flower", blush=True),
 "youyu":   dict(hair="orange",  style="ponytail",eye="gold"),
 "quanrong":dict(hair="brown",   style="fluffy",  eye="brown", ears="dog", blush=True),
 "ruiya":   dict(hair="purple",  style="twintail",eye="purple",orn="star"),
 "mumu":    dict(hair="blue",    style="bun",     eye="pink",  orn="ribbon", blush=True),
 "kroya":   dict(hair="navy",    style="hime",    eye="green", orn="hairpin"),
 "shiliu":  dict(hair="black",   style="twintail",eye="teal",  ahoge=True),
 "seki":    dict(hair="blue",    style="wavy",    eye="teal",  orn="star"),
 "haruka":  dict(hair="white",   style="ponytail",eye="red"),
 "mahiru":  dict(hair="crimson", style="fluffy",  eye="red",   ears="wolf", ahoge=True),
 "nana7mi": dict(hair="silver",  style="wavy",    eye="blue",  orn="hairpin", ahoge=True),
 "liAn":    dict(hair="mint",    style="long",    eye="green", orn="flower", blush=True),
 "youyi":   dict(hair="black",   style="short",   eye="purple", male=True),
 "azi":     dict(hair="pink",    style="bun",     eye="pink",  orn="ribbon", ahoge=True, blush=True),
 "taodai":  dict(hair="rose",    style="hime",    eye="brown", orn="flower"),
 "miki":    dict(hair="blonde",  style="wavy",    eye="gold",  orn="hairpin"),
 "rei":     dict(hair="lavender",style="long",    eye="red",   orn="hairpin"),
 "rinco":   dict(hair="crimson", style="ponytail",eye="gold"),
}

# ---------------- 基础工具 ----------------
def px(d, x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)

def ell(d, cx, cy, rx, ry, c):
    d.ellipse([cx - rx, cy - ry, cx + rx - 1, cy + ry - 1], fill=c)

def poly(d, pts, c):
    d.polygon([(float(x), float(y)) for x, y in pts], fill=c)

def hx(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))

# ---------------- 发型（含背发与前发） ----------------
def back_hair(d, hb, style):
    base, shade, light = hb
    if style == "long" or style == "wavy" or style == "hime":
        ell(d, 32, 22, 17, 13, shade)
        px(d, 17, 26, 47, 50, shade)
        if style == "wavy":
            for cx in range(17, 47, 6):
                ell(d, cx + 3, 50, 4, 4, shade)
        px(d, 17, 44, 47, 50, base)
    elif style == "twintail":
        ell(d, 32, 22, 17, 13, shade)
        for sgn in (-1, 1):
            poly(d, [(32 + sgn * 13, 24), (32 + sgn * 26, 36), (32 + sgn * 24, 48), (32 + sgn * 12, 38)], shade)
            poly(d, [(32 + sgn * 15, 26), (32 + sgn * 22, 36), (32 + sgn * 20, 43), (32 + sgn * 14, 34)], base)
    elif style == "sidetail":
        ell(d, 32, 22, 17, 13, shade)
        poly(d, [(44, 22), (56, 34), (53, 48), (43, 38)], shade)
        poly(d, [(45, 25), (52, 35), (50, 43), (44, 35)], base)
    elif style == "ponytail":
        ell(d, 32, 22, 17, 13, shade)
        poly(d, [(34, 10), (48, 24), (50, 42), (40, 44), (42, 28)], shade)
        poly(d, [(35, 13), (45, 26), (46, 40), (42, 38)], base)
    elif style == "fluffy":
        ell(d, 32, 22, 18, 14, shade)
        for cx in range(16, 50, 7):
            ell(d, cx, 14, 4, 5, shade)
    else:  # short / bob / spiky / bun
        ell(d, 32, 22, 16, 12, shade)

def front_hair(d, hb, style):
    base, shade, light = hb
    ell(d, 32, 16, 15, 8, base)                        # 发帽 y8..23，不压眼睛
    poly(d, [(16, 24), (17, 12), (25, 7), (39, 7), (47, 12), (48, 24),   # M 形刘海
             (44, 24), (43, 17), (39, 22), (36, 16), (32, 22), (28, 16), (25, 22), (21, 17), (20, 24)], base)
    px(d, 20, 9, 27, 12, light)                        # 高光
    px(d, 35, 8, 44, 10, light)
    px(d, 16, 20, 20, 30, base); px(d, 17, 27, 20, 30, shade)   # 侧发
    px(d, 44, 20, 48, 30, base); px(d, 44, 27, 47, 30, shade)
    if style == "hime":
        px(d, 16, 20, 20, 40, base); px(d, 16, 36, 20, 40, shade)
        px(d, 44, 20, 48, 40, base); px(d, 44, 36, 48, 40, shade)
    elif style == "bob":
        px(d, 16, 20, 20, 34, base); px(d, 44, 20, 48, 34, base)
        px(d, 16, 31, 20, 34, shade); px(d, 44, 31, 48, 34, shade)
    elif style == "fluffy":
        for cx in (14, 44):
            ell(d, cx + 3, 24, 4, 6, base)
    elif style == "spiky":
        for cx in (18, 26, 34, 42):
            poly(d, [(cx, 11), (cx + 3, 3), (cx + 6, 11)], base)
    elif style == "bun":
        ell(d, 19, 8, 6, 5, base); ell(d, 45, 8, 6, 5, base)
        ell(d, 19, 7, 3, 2, light); ell(d, 45, 7, 3, 2, light)
    if style in ("short", "spiky"):
        px(d, 17, 18, 21, 24, shade); px(d, 43, 18, 47, 24, shade)

# ---------------- 头饰 / 兽耳 ----------------
def ornament(d, kind, acc):
    if kind == "ribbon":
        poly(d, [(40, 10), (46, 6), (46, 14)], acc); poly(d, [(48, 10), (54, 6), (54, 14)], acc)
        px(d, 45, 9, 49, 12, "#ffffff" if acc != "#ffffff" else LINE)
    elif kind == "flower":
        for dx, dy in ((0, -3), (3, 0), (0, 3), (-3, 0)):
            ell(d, 45 + dx, 11 + dy, 2, 2, acc)
        ell(d, 45, 11, 1, 1, "#fff8d0")
    elif kind == "star":
        poly(d, [(47, 5), (48, 9), (52, 9), (49, 12), (50, 16), (47, 13), (44, 16), (45, 12), (42, 9), (46, 9)], "#f8d858")
    elif kind == "hairpin":
        px(d, 40, 16, 47, 18, acc); px(d, 45, 13, 47, 21, acc)
    elif kind == "moon":
        ell(d, 18, 12, 4, 4, "#f4e8a0")
        ell(d, 20, 11, 4, 4, (0, 0, 0, 0))   # 挖出月牙

def animal_ears(d, kind, hb, acc):
    base, shade, light = hb
    if kind == "cat":
        poly(d, [(18, 10), (22, 0), (27, 9)], base); poly(d, [(37, 9), (42, 0), (46, 10)], base)
        poly(d, [(20, 8), (22, 3), (25, 8)], shade); poly(d, [(39, 8), (42, 3), (44, 8)], shade)
    elif kind == "dog":
        ell(d, 15, 10, 5, 7, base); ell(d, 49, 10, 5, 7, base)
        ell(d, 15, 11, 2, 4, shade); ell(d, 49, 11, 2, 4, shade)
    elif kind == "wolf":
        poly(d, [(16, 12), (18, -1), (26, 8)], base); poly(d, [(38, 8), (46, -1), (48, 12)], base)
        poly(d, [(18, 9), (19, 3), (24, 8)], shade); poly(d, [(40, 8), (45, 3), (46, 9)], shade)
    elif kind == "deer":
        for sgn in (-1, 1):
            x = 32 + sgn * 12
            px(d, x - 1, 0, x + 1, 8, "#a87a4f")
            px(d, x - 4 if sgn < 0 else x - 1, 2, (x - 1 if sgn < 0 else x + 3), 4, "#a87a4f")
    elif kind == "bird":
        for sgn in (-1, 1):
            poly(d, [(32 + sgn * 16, 18), (32 + sgn * 28, 10), (32 + sgn * 27, 22), (32 + sgn * 17, 26)], acc)
    elif kind == "fox":
        poly(d, [(17, 10), (20, 0), (26, 8)], base); poly(d, [(38, 8), (44, 0), (47, 10)], base)

# ---------------- 职业道具 ----------------
def prop(d, kind, acc, skin):
    s0, s1 = skin
    if kind == "shield":
        poly(d, [(50, 36), (58, 38), (58, 48), (54, 54), (50, 48)], "#8fa3b8")
        poly(d, [(51, 38), (57, 39), (57, 47), (54, 51), (51, 47)], acc)
        px(d, 53, 41, 55, 45, "#ffffff")
    elif kind == "katana":
        px(d, 50, 20, 52, 46, "#d8e0ec"); px(d, 52, 20, 53, 44, "#98a4b8")
        px(d, 49, 46, 54, 48, "#5a4a3a"); px(d, 50, 48, 52, 54, "#7a5a3f")
    elif kind == "axe":
        px(d, 52, 22, 54, 52, "#7a5a3f")
        poly(d, [(44, 24), (54, 20), (54, 32), (44, 30)], "#c3ccd8")
        poly(d, [(44, 24), (47, 22), (47, 31), (44, 30)], acc)
    elif kind == "dagger":
        px(d, 52, 30, 54, 44, "#d8e0ec"); px(d, 54, 30, 55, 42, "#98a4b8")
        px(d, 51, 44, 56, 46, "#5a4a3a")
    elif kind == "bow":
        d.arc([44, 24, 60, 48], start=-70, end=70, fill="#a8794f", width=3)
        px(d, 52, 25, 53, 47, "#e8e8e0")
    elif kind == "staff":
        px(d, 52, 26, 54, 52, "#8a6a4a")
        ell(d, 53, 22, 5, 5, acc); ell(d, 51, 20, 2, 2, "#ffffff")
    elif kind == "flask":
        px(d, 51, 26, 56, 30, "#cfd8e8")
        ell(d, 53, 37, 5, 7, acc)
        ell(d, 51, 34, 2, 2, "#ffffff")
    elif kind == "cross":
        px(d, 49, 30, 58, 48, "#f0f0f4")
        px(d, 52, 33, 55, 44, "#e05555"); px(d, 49, 36, 58, 40, "#e05555")
    elif kind == "mic":
        px(d, 52, 30, 54, 50, "#5a5f70")
        ell(d, 53, 26, 5, 6, "#c3ccd8"); ell(d, 51, 24, 2, 2, "#ffffff")
    elif kind == "starwand":
        px(d, 52, 28, 54, 52, "#e8c05a")
        poly(d, [(53, 16), (55, 21), (60, 21), (56, 25), (58, 30), (53, 27), (48, 30), (50, 25), (46, 21), (51, 21)], "#f8d858")

# ---------------- 主体绘制 ----------------
def draw_unit(u, spec):
    img = Image.new("RGBA", (G, G), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hb = HAIR[spec["hair"]]
    eye = EYES[spec["eye"]]
    fac = u["fac"]
    body, acc = FAC_OUTFIT.get(fac, ("#5a6a8a", "#c9d8f8"))
    dark_body = tuple(max(0, c - 40) for c in hx(body))
    male = spec.get("male", False)

    back_hair(d, hb, spec["style"])
    if spec.get("ears"):
        animal_ears(d, spec["ears"], hb, acc)

    px(d, 30, 35, 34, 41, SKIN[1])                   # 脖子
    # 身体
    if male:
        px(d, 25, 40, 39, 55, body); px(d, 25, 50, 39, 55, dark_body)
        px(d, 27, 55, 31, 59, "#3a3f52"); px(d, 33, 55, 37, 59, "#3a3f52")
    else:
        poly(d, [(26, 40), (38, 40), (42, 56), (22, 56)], body)
        px(d, 22, 52, 42, 56, dark_body)
        px(d, 27, 56, 30, 59, SKIN[1]); px(d, 34, 56, 37, 59, SKIN[1])
    px(d, 29, 41, 35, 44, acc)                       # 领口/饰带
    px(d, 22, 50, 42, 52, acc)                       # 下摆饰线
    # 手臂
    px(d, 20, 41, 24, 50, body); px(d, 40, 41, 44, 50, body)
    px(d, 20, 49, 24, 52, SKIN[0]); px(d, 40, 49, 44, 52, SKIN[0])

    # 头
    ell(d, 32, 25, 14, 13, SKIN[0])
    ell(d, 32, 31, 11, 6, SKIN[0])
    # 眼：睫毛1px + 眼白1px + 虹膜3px + 底影1px + 高光
    ey = 25
    for ex in (23, 34):
        px(d, ex, ey - 2, ex + 5, ey - 2, LINE)
        px(d, ex, ey - 1, ex + 5, ey - 1, "#ffffff")
        px(d, ex, ey, ex + 5, ey + 2, eye)
        px(d, ex, ey + 3, ex + 5, ey + 3, tuple(max(0, c - 60) for c in hx(eye)))
        px(d, ex + 1, ey, ex + 2, ey + 1, "#ffffff")
        if not male:
            px(d, ex - 1 if ex < 30 else ex + 5, ey - 2, ex - 1 if ex < 30 else ex + 5, ey - 1, LINE)
    px(d, 31, 33, 33, 33, "#c46a5a")                              # 嘴
    if spec.get("blush"):
        px(d, 20, 31, 23, 32, "#ff9f96"); px(d, 41, 31, 44, 32, "#ff9f96")

    front_hair(d, hb, spec["style"])
    if spec.get("ahoge"):
        px(d, 31, 4, 33, 8, hb[0]); px(d, 33, 3, 35, 6, hb[0])
    if spec.get("orn"):
        ornament(d, spec["orn"], acc)

    prop(d, JOB_PROP[u["job"]], acc, SKIN)

    # 描边
    alpha = img.split()[3]
    dil = alpha.filter(ImageFilter.MaxFilter(3))
    outline = Image.new("RGBA", (G, G), (0, 0, 0, 0))
    op = outline.load()
    ap, dp_ = alpha.load(), dil.load()
    for yy in range(G):
        for xx in range(G):
            if dp_[xx, yy] > 0 and ap[xx, yy] == 0:
                op[xx, yy] = hx(LINE) + (255,)
    out = Image.alpha_composite(outline, img)
    return out.resize((128, 128), Image.NEAREST)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    units = json.load(open(os.path.join(TOOLS, "units.json"), encoding="utf-8"))
    missing = [u["id"] for u in units if u["id"] not in O]
    if missing:
        raise SystemExit("缺外观定义: %s" % missing)
    sheet_cols, cell = 10, 96
    rows = (len(units) + sheet_cols - 1) // sheet_cols
    sheet = Image.new("RGBA", (sheet_cols * cell, rows * (cell + 12)), (24, 28, 42, 255))
    for i, u in enumerate(units):
        im = draw_unit(u, O[u["id"]])
        im.save(os.path.join(OUT_DIR, u["id"] + ".png"))
        cx, cy = (i % sheet_cols) * cell, (i // sheet_cols) * (cell + 12)
        sheet.paste(im.resize((64, 64), Image.NEAREST), (cx + 16, cy + 8), im.resize((64, 64), Image.NEAREST))
    sheet.save(SHEET)
    print("生成 %d 个立绘 -> %s" % (len(units), OUT_DIR))

if __name__ == "__main__":
    main()
