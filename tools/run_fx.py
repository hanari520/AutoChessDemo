# -*- coding: utf-8 -*-
"""技能特效贴图批量生成：文生图（洋红底）→ 抠图 → 缩 256 → assets/fx/<name>.png"""
import runpy, subprocess, sys
from pathlib import Path

FX = {
    # name: (prompt 主体, 生成 seed)
    "fireball": ("一颗炽热的火焰飞行球体，橙红色火舌向后拖曳，游戏特效贴图", 11),
    "chain":    ("一团蓝白色电弧能量球，锯齿状闪电向四周迸出，游戏特效贴图", 22),
    "frost":    ("一朵冰蓝色六芒冰晶雪花，中心发光，边缘霜气扩散，游戏特效贴图", 33),
    "sonic":    ("粉色音符与三层圆弧声波纹，中心一颗亮音符，游戏特效贴图", 44),
    "holy":     ("金色圣光光粒上升与柔和十字光辉，中心亮核，浅绿点缀，游戏特效贴图", 55),
    "petrify":  ("灰色岩石裂纹图案，从中心放射的裂缝，深灰描边，游戏特效贴图", 66),
    "poison":   ("一团紫绿色毒雾气泡翻涌，中心深色毒核，游戏特效贴图", 77),
    "starfall": ("金紫色流星与星芒闪光坠落，拖曳星光轨迹，游戏特效贴图", 88),
    # 第二批：S 级专属 + A 级共享
    "gate":     ("一扇幽冥地府的紫黑色拱门，门内涌出幽蓝色鬼火与雾气，神秘恐怖，游戏特效贴图", 101),
    "time":     ("一个蓝金色的魔法时钟被时间漩涡环绕，表盘发光，指针扭曲，游戏特效贴图", 112),
    "slash":    ("银白色的剑气旋风弧光，月牙形刀光交叉，速度感线条，游戏特效贴图", 123),
    "quake":    ("棕金色大地裂痕爆炸，碎石与尘土向两侧飞溅，地面裂缝发光，游戏特效贴图", 134),
    "memexp":   ("紫粉色记忆漩涡，中心一只发光的瞳孔，碎片状记忆环绕旋转，梦幻诡异，游戏特效贴图", 145),
    "jelly":    ("一颗Q弹的绿色果冻球半透明，里面封着一个微小剪影，高光饱满，可爱，游戏特效贴图", 156),
    "barrier":  ("一个蓝色六边形魔法结界护罩，半透明能量罩，边缘发光纹路，游戏特效贴图", 167),
    "hush":     ("一张灰蓝色的封印符咒，符文发光，缠绕锁链图案，静默庄重，游戏特效贴图", 178),
}

BASE = ("居中构图，纯洋红色纯色背景(#FF00FF)，无文字无边框无水印，"
        "贴纸风格干净描边，边缘利落适合抠图")


def main():
    out_dir = Path("assets/fx")
    out_dir.mkdir(parents=True, exist_ok=True)
    fails = []
    for name, (body, seed) in FX.items():
        raw = Path(f"out/fx_raw/{name}.png")
        dst = out_dir / f"{name}.png"
        if dst.exists():
            print(f"skip {name}", flush=True)
            continue
        if not raw.exists():
            sys.argv = ["ark_gen.py", "--out", str(raw), "--seed", str(seed),
                        "--prompt", f"{body}。{BASE}"]
            print(f"=== {name} ===", flush=True)
            try:
                runpy.run_path("tools/ark_gen.py", run_name="__main__")
            except SystemExit as e:
                if e.code:
                    fails.append(name)
                    continue
        r = subprocess.run([sys.executable, "tools/chroma_cut.py", str(raw), str(dst),
                            "--size", "256"], capture_output=True, text=True)
        if r.returncode != 0:
            fails.append(name)
            print(name, "CUT FAIL", (r.stdout + r.stderr)[-120:], flush=True)
    print("DONE. failed:", fails or "none", flush=True)


if __name__ == "__main__":
    main()
