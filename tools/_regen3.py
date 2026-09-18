# -*- coding: utf-8 -*-
"""临时批量：重生成 ein/hoshimi/chiharu 三张立绘（2026-09-19 名单修订）"""
import runpy, sys
from pathlib import Path

STYLE = ("Q版二头身全身立绘：头大身小，圆润简笔的身体，短手短腿，柔和赛璐璐平涂上色，"
         "深色细描边，游戏贴纸般干净简洁；全身站姿，纯洋红色纯色背景(#FF00FF)，"
         "画面中只有这一个角色，无文字无边框无水印")

# uid -> (人设简述, 是否加职业道具)
JOBS = {
    "hoshimi": "手持一对小巧的匕首",
    "chiharu": "手持一把日本刀",
}

LOOKS = {
    "ein":      "橙金色高侧马尾女生（金色眼睛），白色魔法少女风服装，肩披黑红金边斗篷，手持魔杖与粉色手提箱",
    "hoshimi":  "白色长发带粉色挑染的女生（粉色眼睛），戴猫耳耳机，白色外套与红色短裙，白色猫形玩偶挂饰",
    "chiharu":  "黑白双色双马尾女生（紫色眼睛），戴蝙蝠翅膀发饰与蝙蝠项圈，黑紫色哥特水手风长裙",
}

for uid, look in LOOKS.items():
    prop = JOBS.get(uid, "")
    out = f"out/sprites_raw/{uid}.png"
    if Path(out).exists():
        Path(out).unlink()
    sys.argv = ["ark_gen.py", "--out", out, "--seed", "20260919",
                "--prompt",
                f"第1张参考图是虚拟主播的官方立绘，请严格保持其发型发色、瞳色、服装、"
                f"配饰等外观特征不变；第2、3张参考图是目标画风示例，只参考画风、头身比例和干净程度，"
                f"不要参考其中的角色形象。请绘制第1张角色的{look}{'；' + prop if prop else ''}。{STYLE}",
                "--ref", f"out/refs/{uid}.png",
                "--ref", "tools/style_ref1.png", "--ref", "tools/style_ref2.png"]
    print(f"=== {uid} ===", flush=True)
    runpy.run_path("tools/ark_gen.py", run_name="__main__")
print("DONE")
