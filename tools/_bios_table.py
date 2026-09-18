# -*- coding: utf-8 -*-
"""主播资料 × 游戏设定 对照表（体检用，只读）"""
import json, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf8', errors='replace')

units = json.load(open('F:/demo/autochess/tools/units.json', encoding='utf8'))

def clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()

sel_fields = ['昵称', 'Emoji', 'Tag', '萌点', '发色', '瞳色', '生日', '代表色', '身高', '粉丝勋章', '年龄', '本名']
start, end = int(sys.argv[1]), int(sys.argv[2])
for u in units[start:end]:
    bio = {}
    try:
        d = json.load(open('F:/demo/autochess/out/refs/%s.meta.json' % u['id'], encoding='utf8'))
        fld = d.get('fields', {})
        for k in sel_fields:
            v = clean(str(fld.get(k, '')))
            if v and v not in ('/', '--'):
                bio[k] = v[:46]
        bio['形象'] = clean(d.get('section', ''))[:240]
    except Exception as e:
        bio['ERR'] = str(e)[:60]
    tag2 = ('/' + u['fac2']) if u.get('fac2') else ''
    tagj2 = ('/' + u['job2']) if u.get('job2') else ''
    print("【%s】%s费 %s%s·%s%s | 「%s」%s" % (u['name'], u['cost'], u['fac'], tag2, u['job'], tagj2, u['skName'], u['desc'][:78]))
    print('    ' + ' | '.join('%s:%s' % (k, v) for k, v in bio.items()))
