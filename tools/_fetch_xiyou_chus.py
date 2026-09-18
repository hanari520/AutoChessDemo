# -*- coding: utf-8 -*-
"""临时：为希侑(hoshimi)/初濑(chiharu)抓取萌娘百科立绘参考（复用 moegirl_refs 的安全通道）"""
import json, re, sys, time
sys.path.insert(0, '.')
import moegirl_refs as M

M.ALLOWED_HOSTS = M.ALLOWED_HOSTS | {"storage.moegirl.org.cn"}

WANT = [("希侑", "hoshimi"), ("初濑", "chiharu"), ("星弥", "hoshimi_old"), ("千春", "chiharu_old")]

for name, uid in WANT:
    print(f"=== {name} -> {uid} ===", flush=True)
    try:
        title = M.find_title(name)
        print("  title:", title, flush=True)
        if not title:
            continue
        time.sleep(0.4)
        meta = M.extract(M.fetch_raw(title))
        imgs = M.page_images(title)
        print("  imgs:", [t for t, _ in imgs][:10], flush=True)
        def ok_art(t):
            return re.search(r"立绘|初始|形象|立繪|主条目|卡面", t, re.I) and not re.search(r"logo|图标|icon|头像|表情", t, re.I)
        picks = [(t, u) for t, u in imgs if ok_art(t)][:3] or imgs[:3]
        meta["_files"] = [t for t, _ in picks]
        if picks:
            time.sleep(0.4)
            (M.Path("out/refs") / f"{uid}.png").write_bytes(
                M.safe_get(picks[0][1], headers={"Referer": f"https://{M.WIKI_HOST}/"},
                           allow_hosts=M.ALLOWED_HOSTS | {"storage.moegirl.org.cn"}))
            meta["_main"] = picks[0][1]
            print("  art:", picks[0][0], flush=True)
        (M.Path("out/refs") / f"{uid}.meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        print("  meta:", {k: meta.get(k) for k in ("发色", "瞳色")}, flush=True)
    except Exception as e:
        print("  !! failed:", e, flush=True)
