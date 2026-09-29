# js_pdf CJK example font subset recipe.
# Copyright (C) 2026, Romulo Campos
# Licensed under the Apache License, Version 2.0.
# The generated font retains its upstream SIL Open Font License.
"""Usage: python generate-cjk-subset.py /path/to/NotoSansSC[wght].ttf

Requires fonttools 4.66.0. Source: google/fonts at
23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/notosanssc/NotoSansSC[wght].ttf.
See THIRD-PARTY-NOTICES.md and licenses/NotoSansSC-OFL.txt.
"""
from pathlib import Path
import sys
import hashlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

source = Path(sys.argv[1])
expected = 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da'
if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
    raise ValueError('Source font does not match the pinned upstream bytes')
font = TTFont(source, recalcTimestamp=False)
font = instantiateVariableFont(font, {"wght": 400}, inplace=True)
options = subset.Options()
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=''.join(chr(i) for i in range(32, 127)) + '字体排印学是研究字体与排版的学问涉及字形设计你好世界，。、（）中文测试')
subsetter.subset(font)
# The modified subset has its own family name; copyright/license records stay.
for record in font['name'].names:
    if record.nameID in (1, 3, 4, 6, 16):
        record.string = 'JsPdfCjkExample'.encode(record.getEncoding())
font.save(Path(__file__).with_name('JsPdfCjkExample.ttf'))
