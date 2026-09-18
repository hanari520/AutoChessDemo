# 虚拟棋战 · 棋子与羁绊总览表：按《刀塔自走棋棋子与羁绊 (1).xlsx》三表结构整理当前 demo 数据
# 数据源：index.html（经 export_units.js 导出 units.json）+ FACTIONS/CLASSES 定义
import json, io, re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

BASE = io.open('../index.html', encoding='utf8').read()
units = json.load(io.open('units.json', encoding='utf8'))

def grab(name):
    body = re.search(r'const %s = \{(.*?)\n\};' % name, BASE, re.S).group(1)
    d = {}
    for km in re.finditer(r"'([^']+)':\s*\{need:(\[[^\]]*\]),\s*desc:\[(.*?)\]\}", body, re.S):
        d[km.group(1)] = (json.loads(km.group(2)), re.findall(r"'([^']*)'", km.group(3)))
    return d

FACTIONS = grab('FACTIONS')
CLASSES = grab('CLASSES')

# —— 参考表样式：深蓝标题 / 白字蓝底表头 / 数据行无填充、细换行 ——
TITLE_C, HDR_FILL = '1F3864', '2F4B7C'
title_font = Font(bold=True, size=13, color=TITLE_C)
hdr_font = Font(bold=True, color='FFFFFF')
hdr_fill = PatternFill('solid', fgColor=HDR_FILL)
center = Alignment(horizontal='center', vertical='center', wrap_text=True)
left_wrap = Alignment(horizontal='left', vertical='center', wrap_text=True)

def make_sheet(wb, first, title, headers, widths, rows, wrap_cols):
    ws = wb.create_sheet(first)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
    ws.cell(1, 1, title).font = title_font
    for c, (h, w) in enumerate(zip(headers, widths), 1):
        cell = ws.cell(2, c, h)
        cell.font, cell.fill, cell.alignment = hdr_font, hdr_fill, center
        ws.column_dimensions[get_column_letter(c)].width = w
    for i, row in enumerate(rows):
        r = 3 + i
        for c, v in enumerate(row, 1):
            cell = ws.cell(r, c, v)
            cell.alignment = left_wrap if c in wrap_cols else center
        # 行高不写死：留空让 Excel/WPS 按换行内容自适应，避免多行文本叠印裁切
    ws.freeze_panes = 'A3'
    ws.print_title_rows = '1:2'  # 跨页打印时每页重复标题+表头
    return ws

wb = Workbook()
wb.remove(wb.active)
wb.properties.creator = 'Z.ai'

# ===== Sheet1 棋子总览 =====
def clean_desc(name, desc):
    # 变体 txt 自带「技能名：」前缀时与 skillDesc 的主前缀重复，去掉第二次出现
    dup = f'{name}：'
    first = desc.find(dup)
    second = desc.find(dup, first + 1)
    return desc[:second] + desc[second + len(dup):] if second != -1 else desc

units_sorted = sorted(units, key=lambda u: u['cost'])
cost_cnt = {}
for u in units_sorted:
    cost_cnt[u['cost']] = cost_cnt.get(u['cost'], 0) + 1
dist = '、'.join(f'{k}费{cost_cnt[k]}' for k in sorted(cost_cnt))
rows1 = []
for u in units_sorted:
    fac = u['fac'] + ('/' + u['fac2'] if u.get('fac2') else '')
    job = u['job'] + ('/' + u['job2'] if u.get('job2') else '')
    note = f"{u['form']}·{u['dtype']}·射程{u['rng']}·攻速{u['spd']}·卡池{u['pool']}张"
    rows1.append([u['name'], u['cost'], fac, job, note, clean_desc(u['skName'], f"{u['skName']}：{u['desc']}")])
make_sheet(wb, '棋子总览', f'虚拟棋战 棋子总览（共{len(units_sorted)}个棋子：{dist}）',
           ['名称', '费用', '阵营', '职业', '备注', '技能'],
           [12, 6, 14, 14, 24, 46], rows1, wrap_cols={5, 6})

# ===== Sheet2 职业羁绊 / Sheet3 阵营羁绊 =====
def syn_rows(defs, counter):
    rows = []
    for name, (need, desc) in defs.items():
        trig = ' / '.join(str(n) for n in need)
        eff = '\n'.join(f'{need[i]}人：{desc[i]}' for i in range(len(need)))
        rows.append([name, trig, f'{eff}', counter.get(name, 0)])
    return rows

def syn_sheet(wb, name, title, rows, label):
    ws = make_sheet(wb, name, title, [label, '触发数量', '效果'], [12, 12, 62], rows, wrap_cols={3})
    # 效果列按行数撑高；末尾补一列「现有成员数」备注到 D 列之外 → 并入效果行尾注释
    return ws

classes_rows = [[n, t, e] for n, t, e, _ in syn_rows(CLASSES, {})]
jobs_cnt = {}
for u in units:
    jobs_cnt[u['job']] = jobs_cnt.get(u['job'], 0) + 1
    if u.get('job2'):
        jobs_cnt[u['job2']] = jobs_cnt.get(u['job2'], 0) + 1
facs_cnt = {}
for u in units:
    facs_cnt[u['fac']] = facs_cnt.get(u['fac'], 0) + 1
    if u.get('fac2'):
        facs_cnt[u['fac2']] = facs_cnt.get(u['fac2'], 0) + 1

classes_rows = []
for n, (need, desc) in CLASSES.items():
    eff = '\n'.join(f'{need[i]}人：{desc[i]}' for i in range(len(need)))
    classes_rows.append([n, ' / '.join(map(str, need)), f'{eff}（现有成员 {jobs_cnt.get(n, 0)} 人）'])
factions_rows = []
for n, (need, desc) in FACTIONS.items():
    eff = '\n'.join(f'{need[i]}人：{desc[i]}' for i in range(len(need)))
    factions_rows.append([n, ' / '.join(map(str, need)), f'{eff}（现有成员 {facs_cnt.get(n, 0)} 人）'])

make_sheet(wb, '职业羁绊', f'职业羁绊效果（共{len(CLASSES)}种职业）',
           ['职业', '触发数量', '效果'], [12, 12, 62], classes_rows, wrap_cols={3})
make_sheet(wb, '阵营羁绊', f'阵营羁绊效果（共{len(FACTIONS)}种阵营）',
           ['阵营', '触发数量', '效果'], [12, 12, 62], factions_rows, wrap_cols={3})

for ws in wb.worksheets:
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToHeight = 0 if ws.title == '棋子总览' else 1  # 两个羁绊表整体缩到一页，避免末行孤页

out = '../虚拟棋战_棋子与羁绊_20260919.xlsx'
wb.save(out)
print('saved', out, '| units', len(units_sorted), '| factions', len(FACTIONS), '| classes', len(CLASSES))
