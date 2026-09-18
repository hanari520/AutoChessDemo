# -*- coding: utf-8 -*-
"""火山方舟 seedream 生图脚本：本地参考图 -> base64 -> images/generations API -> 下载 PNG
用法: python ark_gen.py --prompt "..." [--ref 参考图] --out 输出.png [--size 1024x1024] [--seed N]
"""
import argparse, base64, io, ipaddress, json, socket, sys, urllib.request
from pathlib import Path
from urllib.parse import urlparse

KEY_FILE = Path.home() / ".ark_key"
API = "https://ark.cn-beijing.volces.com/api/v3/images/generations"


def check_public_https(url):
    """Mimosa 约束：仅允许公网 http/https，拒绝环回/私有/保留地址"""
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        return False
    host = p.hostname or ""
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local or ip.is_multicast:
            return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--ref", action="append", default=[],
                    help="本地参考图路径，可重复传多张（第一张为主参考）")
    ap.add_argument("--out", required=True, help="输出 png 路径")
    ap.add_argument("--size", default="1024x1024")
    ap.add_argument("--seed", type=int, default=20260918)
    ap.add_argument("--model", default="doubao-seedream-5-0-pro-260628")
    ap.add_argument("--ref-max", type=int, default=1600, help="参考图最长边压缩目标")
    a = ap.parse_args()

    key = KEY_FILE.read_text(encoding="utf-8").strip()
    body = {
        "model": a.model,
        "prompt": a.prompt,
        "response_format": "url",
        "size": a.size,
        "stream": False,
        "watermark": False,
        "seed": a.seed,
    }
    if a.ref:
        imgs = []
        for p in a.ref:
            from PIL import Image
            im = Image.open(p).convert("RGB")
            im.thumbnail((a.ref_max, a.ref_max))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=90)
            imgs.append("data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode())
            print(f"ref: {p} -> {im.size[0]}x{im.size[1]}, b64 {len(imgs[-1]) // 1024}KB")
        body["image"] = imgs[0] if len(imgs) == 1 else imgs

    req = urllib.request.Request(
        API, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            resp = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("API error", e.code, e.read().decode(errors="replace")[:500])
        sys.exit(1)

    if "error" in resp:
        print("API error:", json.dumps(resp["error"], ensure_ascii=False)[:500])
        sys.exit(1)
    url = (resp.get("data") or [{}])[0].get("url")
    if not url:
        print("no url in response:", json.dumps(resp, ensure_ascii=False)[:500])
        sys.exit(1)
    if not check_public_https(url):
        print("blocked non-public url:", url[:100])
        sys.exit(2)

    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_bytes(data)
    print("saved:", a.out, f"{len(data) // 1024}KB", "usage:", json.dumps(resp.get("usage", {})))


if __name__ == "__main__":
    main()
