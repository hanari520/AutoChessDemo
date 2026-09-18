# -*- coding: utf-8 -*-
"""从萌娘百科抓取虚拟主播外观描述与立绘参考图
输出: out/refs/<id>.png (主立绘) + out/refs/<id>.meta.json (外观摘要)
安全: https + 域名白名单 + 解析校验 + IP 钉扎(防 rebinding) + 不自动跟随重定向
"""
import http.client, ipaddress, json, re, socket, ssl, time
from pathlib import Path
from urllib.parse import urlparse, urlencode, quote

WIKI_HOST = "zh.moegirl.org.cn"
ALLOWED_HOSTS = {"zh.moegirl.org.cn", "patchwiki.moegirl.org.cn", "img.moegirl.org.cn"}
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context()

MEMBERS = ["光一", "悠亚", "勾檀", "帕可", "阿萨Aza", "笙歌", "诺莺Nox"]


def _public_ips(host):
    infos = socket.getaddrinfo(host, 443)
    ips = []
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        bad = (ip.is_private or ip.is_loopback or ip.is_reserved or
               ip.is_link_local or ip.is_multicast or ip.is_unspecified)
        if bad:
            raise ValueError(f"blocked address {ip} for {host}")
        if ip not in ips:
            ips.append(ip)
    if not ips:
        raise ValueError(f"no addresses for {host}")
    return ips


class PinnedHTTPS(http.client.HTTPSConnection):
    """连接到预先校验过的 IP，SNI/Host 仍用真实域名"""
    def __init__(self, host, ip, timeout=60):
        super().__init__(host, 443, timeout=timeout, context=CTX)
        self._pinned_ip = ip

    def connect(self):
        sock = socket.create_connection((self._pinned_ip, 443), timeout=self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def safe_get(url, headers=None, allow_hosts=ALLOWED_HOSTS):
    """受限 GET：仅 https + 域名白名单 + 全地址校验 + IP 钉扎；不跟随重定向"""
    p = urlparse(url)
    if p.scheme != "https" or p.hostname not in allow_hosts:
        raise ValueError(f"blocked url: {url[:120]}")
    ip = str(_public_ips(p.hostname)[0])
    conn = PinnedHTTPS(p.hostname, ip)
    path = p.path or "/"
    if p.query:
        path += "?" + p.query
    h = {"User-Agent": UA, "Host": p.hostname, "Accept": "*/*"}
    if headers:
        h.update(headers)
    conn.request("GET", path, headers=h)
    resp = conn.getresponse()
    body = resp.read()
    conn.close()
    if 300 <= resp.status < 400:
        loc = resp.getheader("Location") or ""
        raise ValueError(f"redirect {resp.status} to {loc[:120]} (not followed)")
    if resp.status != 200:
        raise ValueError(f"HTTP {resp.status} for {url[:120]}")
    return body


def api_json(params):
    return json.loads(safe_get(f"https://{WIKI_HOST}/api.php?" + urlencode(params)))


def fetch_raw(title):
    data = api_json({"action": "parse", "page": title, "prop": "wikitext", "format": "json"})
    return (data.get("parse", {}).get("wikitext", {}) or {}).get("*", "")


def page_images(title):
    """页面内全部图片：[(File标题, url)]"""
    data = api_json({"action": "query", "generator": "images", "gimlimit": "30",
                     "titles": title, "prop": "imageinfo", "iiprop": "url", "format": "json"})
    out = []
    for p in data.get("query", {}).get("pages", {}).values():
        ii = p.get("imageinfo")
        if ii:
            out.append((p.get("title", ""), ii[0].get("url", "")))
    return out


def resolve_file(file_title):
    data = api_json({"action": "query", "titles": f"File:{file_title}",
                     "prop": "imageinfo", "iiprop": "url", "format": "json"})
    for p in data.get("query", {}).get("pages", {}).values():
        ii = p.get("imageinfo")
        if ii:
            return ii[0]["url"]
    return None


def find_title(name):
    data = json.loads(safe_get(
        f"https://{WIKI_HOST}/api.php?action=opensearch&limit=3&format=json&search={quote(name)}"))
    return data[1][0] if isinstance(data, list) and len(data) > 1 and data[1] else None


def extract(wikitext):
    meta = {}
    for field in ("发色", "瞳色", "身高", "萌点", "种族"):
        m = re.search(rf"\|\s*{field}\s*=\s*([^\n|]{{0,60}})", wikitext)
        if m:
            meta[field] = m.group(1).strip()
    sec = re.search(r"==+\s*(?:形象|外观|外貌|角色形象|设定)\s*==+\n(.*?)(?=\n==)", wikitext, re.S)
    body = sec.group(1) if sec else ""
    body = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", body)
    body = re.sub(r"<[^>]+>", "", body)
    body = re.sub(r"\s+", " ", body).strip()
    meta["形象描述"] = body[:700]
    return meta


def main():
    out_dir = Path("out/refs")
    out_dir.mkdir(parents=True, exist_ok=True)
    name2id = {"光一": "kouichi", "悠亚": "yua", "勾檀": "goutan", "帕可": "pako",
               "阿萨Aza": "aza", "笙歌": "shengge", "诺莺Nox": "nox"}
    for name in MEMBERS:
        uid = name2id[name]
        print(f"=== {name} -> {uid} ===", flush=True)
        try:
            title = find_title(name)
            if not title:
                print("  !! 条目未找到", flush=True)
                continue
            print(f"  title: {title}", flush=True)
            time.sleep(0.4)
            meta = extract(fetch_raw(title))
            # 页面图片：优先 立绘/初始/形象，排除 logo/图标/表情
            imgs = page_images(title)
            def ok_art(t):
                return re.search(r"立绘|初始|形象|立繪", t, re.I) and not re.search(r"logo|图标|icon|头像|表情", t, re.I)
            picks = [(t, u) for t, u in imgs if ok_art(t)][:3]
            meta["_files"] = [t for t, _ in picks]
            if picks:
                time.sleep(0.4)
                (out_dir / f"{uid}.png").write_bytes(
                    safe_get(picks[0][1], headers={"Referer": f"https://{WIKI_HOST}/"}))
                meta["_main"] = picks[0][1]
                print(f"  art: {picks[0][0]}", flush=True)
            (out_dir / f"{uid}.meta.json").write_text(
                json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"  meta: 发色={meta.get('发色')} 瞳色={meta.get('瞳色')} 描述{len(meta['形象描述'])}字", flush=True)
            time.sleep(0.6)
        except Exception as e:
            print(f"  !! failed: {e}", flush=True)


if __name__ == "__main__":
    main()
