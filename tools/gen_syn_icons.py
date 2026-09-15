# -*- coding: utf-8 -*-
"""羁绊图标生成器：12 阵营 + 10 职业 → 六边形像素徽章。
输出: <repo>/assets/syn/<slug>.png (44x44 = 22 网格 x2 NEAREST)
预览: <repo>/tools/syn_sheet.png
"""
import os
from PIL import Image, ImageDraw

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TOOLS)
OUT_DIR = os.path.join(REPO, "assets", "syn")
G = 22
LINE = "#171a28"
BASE = "#262b40"

# (slug, 名称, 主题色, 符号)
SYNS = [
    ("shenhai",  "深海",    "#5fd7dd", "wave"),
    ("xingji",   "星际",    "#c9a2ff", "sparkle"),
    ("maorong",  "毛茸乐园", "#f0a05a", "paw"),
    ("yinlv",    "音律",    "#f286bb", "note"),
    ("sixi",     "四禧丸子", "#e86a6a", "dango"),
    ("xueyuan",  "学园",    "#7db8e8", "book"),
    ("yemu",     "夜幕",    "#aeb6e8", "moon"),
    ("huayu",    "花语",    "#f2a0c0", "flower"),
    ("modao",    "魔道",    "#b58ae8", "eye"),
    ("senzhiguo","森之国",  "#7fce8f", "leaf"),
    ("gongzao",  "工造",    "#e8b45a", "gear"),
    ("psp",      "P-SP",    "#6a9fe8", "bolt"),
    ("daoke",    "刀客",    "#dfe6f2", "katana"),
    ("shouhu",   "守护",    "#b8d0e8", "shield"),
    ("youxia",   "游侠",    "#a0e07a", "arrow"),
    ("cike",     "刺客",    "#b09ae8", "dagger"),
    ("fashi",    "法师",    "#8f7ae0", "hat"),
    ("zhoushu",  "咒术",    "#6ad0a8", "bubbles"),
    ("yizhe",    "医者",    "#f0f0f4", "cross"),
    ("geshi",    "歌势",    "#e895b8", "mic"),
    ("ouxiang",  "偶像",    "#f8d858", "star"),
    ("kuangzhan","狂战",    "#e0905a", "axe"),
]

HEX_OUT = [(6, 2), (16, 2), (21, 11), (16, 20), (6, 20), (1, 11)]
HEX_RING = [(7, 4), (15, 4), (19, 11), (15, 18), (7, 18), (3, 11)]

def px(d, x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)

def ell(d, cx, cy, rx, ry, c):
    d.ellipse([cx - rx, cy - ry, cx + rx - 1, cy + ry - 1], fill=c)

def poly(d, pts, c):
    d.polygon([(float(x), float(y)) for x, y in pts], fill=c)

def hexp(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))

def dark(c, f=70):
    return tuple(max(0, v - f) for v in hexp(c))

def draw_wave(d, c):
    for dy in (0, 5):
        for i, (x, y) in enumerate([(4,10),(5,9),(6,9),(7,10),(8,10),(9,9),(10,9),(11,10),(12,10),(13,9),(14,9),(15,10),(16,10),(17,9)]):
            px(d, x, y + dy, x + 1, y + 1 + dy, c)

def draw_sparkle(d, c):
    px(d, 10, 4, 12, 14, c); px(d, 6, 8, 16, 10, c)
    for x, y in ((8,6),(14,6),(8,12),(14,12)):
        px(d, x, y, x + 1, y + 1, dark(c, 40))

def draw_paw(d, c):
    ell(d, 11, 14, 4, 3, c)
    for cx in (6, 11, 16):
        ell(d, cx, 8, 2, 2, c)

def draw_note(d, c):
    px(d, 13, 4, 14, 13, c)
    ell(d, 10, 13, 3, 2, c)
    poly(d, [(14, 4), (18, 6), (14, 9)], c)

def draw_dango(d, c):
    for i in range(6, 17):
        px(d, i, 19 - i, i + 1, 20 - i, "#d8c9a8")
    for cx, cy, cc in ((6, 15, c), (11, 11, "#f8e0c9"), (16, 7, c)):
        ell(d, cx, cy, 2, 2, cc)

def draw_book(d, c):
    px(d, 4, 7, 18, 16, dark(c))
    px(d, 5, 8, 10, 15, c); px(d, 12, 8, 17, 15, c)
    px(d, 11, 7, 11, 16, LINE)
    px(d, 6, 10, 9, 10, dark(c, 50)); px(d, 13, 10, 16, 10, dark(c, 50))

def draw_moon(d, c):
    ell(d, 11, 11, 6, 6, c)
    ell(d, 14, 9, 6, 6, BASE)
    ell(d, 14, 9, 6, 6, BASE)

def draw_flower(d, c):
    for cx, cy, rx, ry in ((11, 6, 2, 3), (11, 16, 2, 3), (6, 11, 3, 2), (16, 11, 3, 2)):
        ell(d, cx, cy, rx, ry, c)
    ell(d, 11, 11, 2, 2, "#f8d858")

def draw_eye(d, c):
    poly(d, [(11, 5), (18, 11), (11, 17), (4, 11)], c)
    poly(d, [(11, 8), (14, 11), (11, 14), (8, 11)], dark(c, 90))
    px(d, 10, 10, 12, 12, "#f4e8a0")

def draw_leaf(d, c):
    poly(d, [(5, 17), (7, 8), (17, 5), (15, 14)], c)
    for i in range(4):
        px(d, 7 + i, 15 - i, 8 + i, 16 - i, dark(c, 60))

def draw_gear(d, c):
    px(d, 10, 4, 12, 6, c); px(d, 10, 16, 12, 18, c)
    px(d, 4, 10, 6, 12, c); px(d, 16, 10, 18, 12, c)
    ell(d, 11, 11, 5, 5, c)
    ell(d, 11, 11, 2, 2, BASE)

def draw_bolt(d, c):
    poly(d, [(12, 3), (6, 12), (10, 12), (9, 19), (16, 9), (12, 9), (15, 3)], c)

def draw_katana(d, c):
    for i in range(9):
        px(d, 4 + i, 17 - i, 6 + i, 19 - i, c)
    px(d, 12, 5, 14, 7, "#ffffff")
    px(d, 3, 14, 6, 17, "#8a6a4a")
    px(d, 6, 12, 9, 15, dark(c, 60))

def draw_shield(d, c):
    poly(d, [(11, 4), (17, 7), (16, 14), (11, 18), (6, 14), (5, 7)], c)
    poly(d, [(11, 7), (14, 8), (13, 12), (11, 14), (9, 12), (8, 8)], dark(c, 60))

def draw_arrow(d, c):
    for i in range(9):
        px(d, 4 + i, 17 - i, 5 + i, 18 - i, c)
    poly(d, [(17, 4), (17, 10), (11, 4)], c)
    px(d, 4, 14, 6, 16, dark(c, 40)); px(d, 6, 16, 8, 18, dark(c, 40))

def draw_dagger(d, c):
    for i in range(7):
        px(d, 6 + i, 15 - i, 8 + i, 17 - i, c)
    px(d, 12, 5, 13, 7, "#ffffff")
    px(d, 5, 13, 9, 16, "#8a8fa8")
    px(d, 12, 3, 14, 5, "#8a6a4a")

def draw_hat(d, c):
    poly(d, [(11, 3), (17, 13), (5, 13)], c)
    px(d, 3, 13, 19, 15, c)
    px(d, 8, 10, 14, 12, dark(c, 50))

def draw_bubbles(d, c):
    ell(d, 9, 13, 4, 4, c)
    ell(d, 15, 7, 2, 2, c)
    ell(d, 16, 15, 1, 1, c)
    px(d, 7, 11, 8, 12, "#ffffff")

def draw_cross(d, c):
    px(d, 9, 4, 13, 18, c); px(d, 4, 9, 18, 13, c)

def draw_mic(d, c):
    ell(d, 11, 7, 3, 4, c)
    px(d, 8, 6, 9, 8, dark(c, 50)); px(d, 13, 6, 14, 8, dark(c, 50))
    px(d, 10, 11, 12, 16, "#c3ccd8")
    px(d, 8, 17, 14, 18, "#8a8fa8")

def draw_star(d, c):
    poly(d, [(11, 3), (13, 8), (18, 9), (14, 12), (16, 18), (11, 15), (6, 18), (8, 12), (4, 9), (9, 8)], c)

def draw_axe(d, c):
    px(d, 6, 4, 8, 18, "#8a6a4a")
    poly(d, [(9, 4), (17, 6), (17, 13), (9, 15)], c)
    poly(d, [(9, 6), (14, 8), (14, 12), (9, 13)], dark(c, 60))

SYM = {"wave": draw_wave, "sparkle": draw_sparkle, "paw": draw_paw, "note": draw_note,
       "dango": draw_dango, "book": draw_book, "moon": draw_moon, "flower": draw_flower,
       "eye": draw_eye, "leaf": draw_leaf, "gear": draw_gear, "bolt": draw_bolt,
       "katana": draw_katana, "shield": draw_shield, "arrow": draw_arrow, "dagger": draw_dagger,
       "hat": draw_hat, "bubbles": draw_bubbles, "cross": draw_cross, "mic": draw_mic,
       "star": draw_star, "axe": draw_axe}

def make(slug, name, color, sym):
    img = Image.new("RGBA", (G, G), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    poly(d, HEX_OUT, LINE)
    poly(d, [(7, 3), (15, 3), (20, 11), (15, 19), (7, 19), (2, 11)], BASE)
    d.line([(x, y) for x, y in HEX_RING] + [HEX_RING[0]], fill=hexp(color), width=1)
    SYM[sym](d, color)
    return img.resize((44, 44), Image.NEAREST)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    from PIL import ImageFont
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 12)
    cols, cell = 8, 64
    rows = (len(SYNS) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * (cell + 14)), (24, 28, 42, 255))
    sd = ImageDraw.Draw(sheet)
    for i, (slug, name, color, sym) in enumerate(SYNS):
        im = make(slug, name, color, sym)
        im.save(os.path.join(OUT_DIR, slug + ".png"))
        cx, cy = (i % cols) * cell, (i // cols) * (cell + 14)
        sheet.paste(im, (cx + 10, cy + 4), im)
        sd.text((cx + 10, cy + 50), name, fill=(220, 220, 235), font=font)
    sheet.save(os.path.join(TOOLS, "syn_sheet.png"))
    print("生成 %d 个羁绊图标 -> %s" % (len(SYNS), OUT_DIR))

if __name__ == "__main__":
    main()
