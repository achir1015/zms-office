# -*- mode: python ; coding: utf-8 -*-
# 資料助秘文件office彙整：主程式（視窗）＋ MCP 伺服器（主控台），共用同一份 _internal。
# 建置：python tools/build_windows.py（會從專案根目錄呼叫 PyInstaller packaging/ZMSOffice.spec）
import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = os.path.abspath(os.path.join(SPECPATH, '..'))
datas = [(os.path.join(ROOT, 'web'), 'web')]
binaries = []
hidden = ['pymysql', 'certifi', 'docx', 'openpyxl', 'pptx', 'lxml', 'anthropic'] + collect_submodules('zo')
for pkg in ('webview', 'clr_loader', 'pythonnet', 'docx', 'pptx', 'anthropic'):
    d, b, h = collect_all(pkg)
    datas += d; binaries += b; hidden += h
EXCLUDES = ['tkinter', 'test', 'opencc', 'edge_tts', 'playwright', 'PIL.ImageQt']

a = Analysis([os.path.join(ROOT, 'main.py')], pathex=[ROOT], binaries=binaries, datas=datas, hiddenimports=hidden,
             excludes=EXCLUDES, noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='ZMSOffice', console=False, upx=False,
          version=os.path.join(ROOT, 'build', 'version.txt'), icon=[os.path.join(ROOT, 'packaging', 'icon.ico')])

m = Analysis([os.path.join(ROOT, 'packaging', 'mcp_main.py')], pathex=[ROOT], binaries=binaries, datas=[],
             hiddenimports=hidden, excludes=EXCLUDES + ['webview', 'clr_loader', 'pythonnet'], noarchive=False)
mpyz = PYZ(m.pure)
mexe = EXE(mpyz, m.scripts, [], exclude_binaries=True, name='ZMSOfficeMCP', console=True, upx=False,
           version=os.path.join(ROOT, 'build', 'version.txt'), icon=[os.path.join(ROOT, 'packaging', 'icon.ico')])

coll = COLLECT(exe, a.binaries, a.datas, mexe, m.binaries, m.datas, strip=False, upx=False, name='ZMSOffice')
