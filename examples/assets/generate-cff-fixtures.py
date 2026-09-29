# js_pdf CFF fixture generator.
# Copyright (C) 2026, Romulo Campos
# Licensed under the Apache License, Version 2.0.
# Input: SourceSans3-Regular.otf from adobe-fonts/source-sans at
# 87b37a2daaed80fcb8e8ccb0085c4d72ddade12e. Requires fonttools (tool only).
import sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.cffLib import FDArrayIndex, FontDict, FDSelect
out = Path(__file__).parent
font = TTFont(sys.argv[1], recalcTimestamp=False)
opts = subset.Options()
opts.recalc_timestamp = False
sub = subset.Subsetter(options=opts)
sub.populate(unicodes=list(range(32, 256)) + [0x20ac, 0x3a9, 0x2014])
sub.subset(font)
for record in font['name'].names:
 if record.nameID in [1, 3, 4, 6]:
  record.string = 'JsPdfCffExample'.encode(record.getEncoding())
top = font['CFF '].cff.topDictIndex[0]
font['CFF '].cff.fontNames = ['JsPdfCffExample']
top.FullName = top.FamilyName = 'JsPdfCffExample'
font.save(out / 'JsPdfCffExample.otf')
for tag in ['GDEF', 'GPOS', 'GSUB']:
 if tag in font: del font[tag]
# A CID-keyed version with nonidentity CIDs exercises charset remapping.
old = font.getGlyphOrder()
mapping = {name: ('.notdef' if i == 0 else 'cid%05d' % (i * 3)) for i, name in enumerate(old)}
for table in font['cmap'].tables:
 if table.isUnicode(): table.cmap = {cp: mapping[name] for cp, name in table.cmap.items()}
font['hmtx'].metrics = {mapping[name]: value for name, value in font['hmtx'].metrics.items()}
top.CharStrings.charStrings = {mapping[name]: value for name, value in top.CharStrings.charStrings.items()}
font.setGlyphOrder([mapping[name] for name in old])
top.charset = font.getGlyphOrder()
top.ROS = ('Adobe', 'JsPdfTest', 0)
top.CIDCount = len(old) * 3
fd = FontDict(); fd.Private = top.Private
fds = FDArrayIndex(); fds.append(fd); top.FDArray = fds
select = FDSelect(); select.gidArray = [0] * len(old); top.FDSelect = select
top.CharStrings.fdArray = fds; top.CharStrings.fdSelect = select
for charstring in top.CharStrings.charStringsIndex.items:
 charstring.fdSelectIndex = 0
if hasattr(top, 'Encoding'): del top.Encoding
del top.Private
font.save(out / 'JsPdfCffCidExample.otf')
