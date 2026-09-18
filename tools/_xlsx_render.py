# 把总览 xlsx 经 Excel COM 导出 PDF，再用 PyMuPDF 渲染成 PNG（供视觉验收）
import os, sys, glob
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '虚拟棋战_棋子与羁绊_20260919.xlsx'))
OUTDIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'out'))
os.makedirs(OUTDIR, exist_ok=True)
pdf = os.path.join(OUTDIR, 'overview_20260919.pdf')
if os.path.exists(pdf):
    os.remove(pdf)
import win32com.client
xl = win32com.client.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
try:
    wb = xl.Workbooks.Open(SRC, ReadOnly=True)
    wb.ExportAsFixedFormat(0, pdf)  # xlTypePDF
    wb.Close(False)
finally:
    xl.Quit()
import fitz
doc = fitz.open(pdf)
paths = []
for i, page in enumerate(doc, 1):
    pix = page.get_pixmap(dpi=110)
    p = os.path.join(OUTDIR, f'overview_p{i}.png')
    pix.save(p)
    paths.append(p)
print('\n'.join(paths))
