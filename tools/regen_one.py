# -*- coding: utf-8 -*-
"""单张重生成工具：python tools/regen_one.py <uid>"""
import runpy, sys
from pathlib import Path

STYLE = ("Q版二头身全身立绘：头大身小，圆润简笔的身体，短手短腿，柔和赛璐璐平涂上色，"
         "深色细描边，游戏贴纸般干净简洁；全身站姿，纯洋红色纯色背景(#FF00FF)，"
         "画面中只有这一个角色，无文字无边框无水印")

# uid -> (人设简述, seed)
LOOKS = {
    "zhouyi": ("黑到红渐变长发女生（金色眼睛），红色系服装；手持一把日本刀", 20260919),
}


def main():
    uid = sys.argv[1]
    look, seed = LOOKS[uid]
    name = {"zhouyi": "轴伊"}.get(uid, uid)
    out = f"out/sprites_raw/{uid}.png"
    if Path(out).exists():
        Path(out).unlink()
    sys.argv = ["ark_gen.py", "--out", out, "--seed", str(seed),
                "--prompt",
                f"第1张参考图是虚拟主播{name}的官方立绘，请严格保持其发型发色、瞳色、服装、"
                f"配饰等外观特征不变；第2、3张参考图是目标画风示例，只参考画风、头身比例和干净程度，"
                f"不要参考其中的角色形象。请绘制第1张角色的{look}。{STYLE}",
                "--ref", f"out/refs/{uid}.png",
                "--ref", "tools/style_ref1.png", "--ref", "tools/style_ref2.png"]
    runpy.run_path("tools/ark_gen.py", run_name="__main__")


if __name__ == "__main__":
    main()
