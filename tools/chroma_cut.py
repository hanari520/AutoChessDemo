# -*- coding: utf-8 -*-
"""AI 立绘后处理：角点取色 -> 色键抠图 -> 裁边 -> 方形 pad -> 缩放
用法: python chroma_cut.py in.png out.png [--size 128] [--preview preview.png]
"""
import argparse
from pathlib import Path
from PIL import Image


def corner_key(im):
    """四角 8x8 区域取中位数作为背景键色"""
    w, h = im.size
    px = []
    for cx, cy in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)):
        for dx in range(-4, 5, 2):
            for dy in range(-4, 5, 2):
                px.append(im.getpixel((min(max(cx + dx, 0), w - 1), min(max(cy + dy, 0), h - 1))))
    px.sort(key=lambda p: p[0] + p[1] + p[2])
    return px[len(px) // 2][:3]


def chroma_cut(im, lo=42.0, hi=95.0):
    im = im.convert("RGB")
    key = corner_key(im)
    w, h = im.size
    src = im.load()
    out = Image.new("RGBA", (w, h))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            d = ((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2) ** 0.5
            if d <= lo:
                a = 0
            elif d >= hi:
                a = 255
            else:
                a = int((d - lo) / (hi - lo) * 255)
                # 半透明边缘去洋红染色：把像素往远离键色方向推
                k = 1.0 - a / 255.0
                r = min(255, max(0, int(r + (r - key[0]) * k * 0.6)))
                b = min(255, max(0, int(b + (b - key[2]) * k * 0.6)))
            dst[x, y] = (r, g, b, a)
    return out


def trim_square(im, pad_ratio=0.04):
    bbox = im.getbbox()
    if not bbox:
        return im
    im = im.crop(bbox)
    w, h = im.size
    side = int(max(w, h) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--size", type=int, default=128)
    ap.add_argument("--preview", help="输出小尺寸实测预览图（深色底）")
    ap.add_argument("--old", help="旧立绘对比图（可选）")
    a = ap.parse_args()

    im = Image.open(a.src)
    cut = trim_square(chroma_cut(im)).resize((a.size, a.size), Image.LANCZOS)
    Path(a.dst).parent.mkdir(parents=True, exist_ok=True)
    cut.save(a.dst)
    print(f"saved {a.dst} ({a.size}x{a.size})")

    if a.preview:
        tiles = []
        if a.old and Path(a.old).exists():
            tiles.append(("old", Image.open(a.old).convert("RGBA").resize((a.size, a.size), Image.NEAREST)))
        for label, s in (("128px", a.size), ("64px", 64), ("48px", 48), ("32px", 32)):
            img = cut.resize((s, s), Image.LANCZOS)
            tiles.append((label, img))
        pad, label_h = 14, 16
        W = sum(t[1].width + pad * 2 for t in tiles) + pad
        H = max(t[1].height for t in tiles) + label_h + pad * 2
        sheet = Image.new("RGB", (W, H), (26, 28, 40))
        from PIL import ImageDraw
        d = ImageDraw.Draw(sheet)
        x = pad
        for label, img in tiles:
            sheet.paste(img, (x + (a.size - img.width) // 2, pad + (a.size - img.height) // 2), img)
            d.text((x + a.size // 2 - len(label) * 3, H - label_h - 4), label, fill=(170, 175, 200))
            x += img.width + pad * 2
        sheet.save(a.preview)
        print(f"preview {a.preview}")


if __name__ == "__main__":
    main()
