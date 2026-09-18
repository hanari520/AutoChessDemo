# -*- coding: utf-8 -*-
"""样张批量生成 v2：外观规格取自萌娘百科抓取结果 + 官方立绘参考
进程内 runpy 调用 ark_gen.py（无 shell 拼接），跳过已存在输出，可安全重跑
"""
import runpy, sys
from pathlib import Path

STYLE1 = r"C:/Users/twj/.zcode/cli/image-cache/sess_cbe24241-e5bf-4eb2-a71b-b5d0cced1893/image-e77e5f7225ea3133a3651bbca2617106.png"
STYLE2 = r"C:/Users/twj/.zcode/cli/image-cache/sess_cbe24241-e5bf-4eb2-a71b-b5d0cced1893/image-0e2b8d0e6ee176fbd2984725423ec965.png"

STYLE = ("Q版二头身全身立绘：头大身小，圆润简笔的身体，短手短腿，柔和赛璐璐平涂上色，"
         "深色细描边，游戏贴纸般干净简洁；全身站姿，纯洋红色纯色背景(#FF00FF)，"
         "画面中只有这一个角色，无文字无边框无水印")

# 外观简述依据萌娘百科官方立绘 + 基本信息栏；职业道具对应 demo 的阵营/职业
UNITS = {
    "kouichi": ("光一", "浅棕色短发男生（银灰色眼睛），白色长风衣配深色围巾；"
                        "他是工造阵营的狂战：脚边停着一块滑板，手持一把大扳手"),
    "yua":     ("悠亚", "灰白色长发女生（蓝色眼睛），黑白配色连衣裙；"
                        "她是星际阵营的法师：手持一支顶端有金色星星的法杖"),
    "goutan":  ("勾檀", "金色长发兽耳女生（绿色眼睛），黑色黄条纹短外套与短裤；"
                        "她是毛茸乐园阵营的守护：手持一面圆润的木盾"),
    "pako":    ("帕可", "紫色短发女生（绿色眼睛），头顶有天使光环，白色短上衣配灰色工装裤紫色手套；"
                        "她是学园阵营的医者：手臂挎着一个白色医药箱"),
    "aza":     ("阿萨", "亚麻色头发带绿色挑染的男生（红蓝异瞳），穿绿色猫耳造型的连帽外套；"
                        "他是音律阵营的狂战：手持一把电吉他当作武器"),
    "shengge": ("笙歌", "金色卷发女生（琥珀色眼睛），蓝色公主裙配白色花饰；"
                        "她是P-SP阵营的歌势：手持一支立式复古麦克风"),
    "nox":     ("诺莺", "金色长发女生（红色眼睛），戴华丽的大礼帽与哥特风裙装；"
                        "她是毛茸乐园阵营的刺客：手持一对小巧的匕首"),
}


def main():
    fails = []
    for uid, (name, look) in UNITS.items():
        out = Path(f"out/sprites_raw/{uid}.png")
        if out.exists():
            print(f"skip {uid} (exists)", flush=True)
            continue
        prompt = (f"第1张参考图是虚拟主播{name}的官方立绘，请严格保持其发型发色、瞳色、服装、"
                  f"配饰等外观特征不变；第2、3张参考图是目标画风示例，只参考画风、头身比例和干净程度，"
                  f"不要参考其中的角色形象。请绘制第1张角色的{look}。{STYLE}")
        art = f"out/refs/{uid}.png"
        sys.argv = ["ark_gen.py", "--out", str(out), "--seed", "20260918",
                    "--prompt", prompt, "--ref", art, "--ref", STYLE1, "--ref", STYLE2]
        print(f"=== {uid} ===", flush=True)
        try:
            runpy.run_path("tools/ark_gen.py", run_name="__main__")
        except SystemExit as e:
            if e.code:
                print(f"{uid} FAILED rc={e.code}", flush=True)
                fails.append(uid)
    print("DONE. failed:", fails or "none", flush=True)


if __name__ == "__main__":
    main()
