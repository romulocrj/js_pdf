# js_pdf Arabic example font subset recipe.
# Copyright (C) 2026, Romulo Campos
# Licensed under the Apache License, Version 2.0.
# The generated font retains its upstream SIL Open Font License.
"""Usage: python generate-arabic-subset.py /path/to/NotoSansArabic[wdth,wght].ttf

Requires fonttools 4.66.0. Source: google/fonts at
8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notosansarabic/NotoSansArabic[wdth,wght].ttf.
See THIRD-PARTY-NOTICES.md and licenses/NotoSansArabic-OFL.txt.

The port shapes Arabic into Presentation Forms-B code points and reads glyphs
through the cmap only, so the subset keeps those forms and drops the OpenType
layout tables it never reads. U+FEEF and U+FEF1 (isolated alef maksura and
yeh) are left out on purpose: the font parser aliases them to U+0649 and
U+064A, and the phase 7.3 tests check that alias.
"""
from pathlib import Path
import sys
import hashlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

source = Path(sys.argv[1])
expected = '63111b5b2e074dd48cc67692e0a2726d86ee94c1c37fe8598257b7b4e87e869e'
if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
    raise ValueError('Source font does not match the pinned upstream bytes')
font = TTFont(source, recalcTimestamp=False)
font = instantiateVariableFont(font, {'wght': 400, 'wdth': 100}, inplace=True)
unicodes = list(range(0x20, 0x7f)) + [0xa0, 0x2010, 0x202f]
unicodes += [0x060c, 0x061b, 0x061f] + list(range(0x0621, 0x063b))
unicodes += list(range(0x0640, 0x0653)) + list(range(0x0660, 0x066a))
unicodes += [0xfbe8, 0xfbe9] + [c for c in range(0xfe80, 0xfefd) if c not in (0xfeef, 0xfef1)]
options = subset.Options()
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
options.layout_features = []
options.drop_tables += ['GSUB', 'GPOS', 'GDEF']
options.recalc_timestamp = False
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=unicodes)
subsetter.subset(font)
# The modified subset has its own family name; copyright/license records stay.
for record in font['name'].names:
    if record.nameID in (1, 3, 4, 6, 16):
        record.string = 'JsPdfArabicExample'.encode(record.getEncoding())
font.save(Path(__file__).with_name('JsPdfArabicExample.ttf'))
