# -*- coding: utf-8 -*-
"""羁绊图标批量 AI 重生成：文生图（圆形徽章+洋红底）→ 抠图 → 缩 96 → assets/syn/<slug>.png
旧图标备份 out/pixel_backup/syn_0919/（可重跑：已存在的跳过，删掉即重生成）"""
import runpy, subprocess, sys
from pathlib import Path

SYN = {
    # slug: (羁绊名, 徽章主体描述, seed)
    "shenhai":   ("深海",    "深蓝色圆形徽章，中央一道翻卷的白色海浪", 202609101),
    "xingji":    ("星际",    "深紫色圆形徽章，中央一颗带长拖尾的金色流星", 202609102),
    "maorong":   ("毛茸乐园", "暖橙色圆形徽章，中央一个白色兽爪印", 202609103),
    "yinlv":     ("音律",    "粉紫色圆形徽章，中央一个白色八分音符", 202609104),
    "sixi":      ("四禧丸子", "红金色圆形徽章，中央三个叠在一起的白色糯米团子", 202609105),
    "xueyuan":   ("学园",    "藏青色圆形徽章，中央一本摊开的白色书页书本", 202609106),
    "yemu":      ("夜幕",    "黑紫色圆形徽章，中央一弯银白色新月", 202609107),
    "huayu":     ("花语",    "粉白色圆形徽章，中央一朵五瓣粉色小花带两片绿叶", 202609108),
    "modao":     ("魔道",    "暗紫色圆形徽章，中央一只发光的竖瞳魔眼", 202609109),
    "senzhiguo": ("森之国",  "草绿色圆形徽章，中央一片嫩绿的叶子", 202609110),
    "gongzao":   ("工造",    "钢蓝色圆形徽章，中央一个银灰色金属齿轮", 202609111),
    "psp":       ("P-SP",   "亮蓝色圆形徽章，中央一道金黄色闪电", 202609112),
    "daoke":     ("刀客",    "深灰色圆形徽章，中央一把竖直向上的武士刀", 202609113),
    "shouhu":    ("守护",    "蓝银色圆形徽章，中央一面塔形盾牌", 202609114),
    "geshi":     ("歌势",    "品红色圆形徽章，中央一支银色复古麦克风", 202609115),
    "youxia":    ("游侠",    "墨绿色圆形徽章，中央一张弓与搭在弦上的箭", 202609116),
    "fashi":     ("法师",    "蓝紫色圆形徽章，中央一颗拖着星轨的蓝白色魔法彗星", 202609117),
    "zhoushu":   ("咒术",    "暗紫黑色圆形徽章，中央一个冒着气泡的绿色毒药瓶", 202609118),
    "cike":      ("刺客",    "黑灰色圆形徽章，中央一把斜置的银色匕首", 202609119),
    "kuangzhan": ("狂战",    "暗红色圆形徽章，中央一柄双刃战斧", 202609120),
    "yizhe":     ("医者",    "白绿色圆形徽章，中央一个绿底红十字的急救徽记", 202609121),
    "ouxiang":   ("偶像",    "金粉色圆形徽章，中央一颗四角闪光的金色星星", 202609122),
}

STYLE = ("手游技能图标风格，图腾居中占徽章面积一半以上，扁平上色带轻微高光，深色粗描边，"
         "轮廓清晰锐利，高对比度，圆形徽章占满画面，四角为纯洋红色纯色背景(#FF00FF)，"
         "无文字无字母无水印，边缘利落适合抠图")


def main():
    out_dir = Path("assets/syn")
    out_dir.mkdir(parents=True, exist_ok=True)
    fails = []
    for slug, (name, body, seed) in SYN.items():
        raw = Path(f"out/syn_raw/{slug}.png")
        dst = out_dir / f"{slug}.png"
        if dst.exists():
            print(f"skip {slug} (exists)", flush=True)
            continue
        if not raw.exists():
            sys.argv = ["ark_gen.py", "--out", str(raw), "--seed", str(seed),
                        "--prompt", f"{body}。{STYLE}"]
            print(f"=== {slug} {name} ===", flush=True)
            try:
                runpy.run_path("tools/ark_gen.py", run_name="__main__")
            except SystemExit as e:
                if e.code:
                    fails.append(slug)
                    continue
        r = subprocess.run([sys.executable, "tools/chroma_cut.py", str(raw), str(dst),
                            "--size", "96"], capture_output=True, text=True)
        if r.returncode != 0:
            fails.append(slug)
            print(slug, "CUT FAIL", (r.stdout + r.stderr)[-120:], flush=True)
        else:
            print(f"saved {dst}", flush=True)
    print("DONE. failed:", fails or "none", flush=True)


if __name__ == "__main__":
    main()
