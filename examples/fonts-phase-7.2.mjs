/*
 * js_pdf font fixes phase 7.2 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

/**
 * `fonts` holds the bytes of `OpenSans-Regular.ttf` (`openSans`),
 * `JsPdfCjkExample.ttf` (`cjk`) and `MaterialIcons.ttf` (`icons`).
 */
export function generateFontsPhase72(fonts, api = defaultApi, compress = true) {
  const { Document, Page, PageFormat, Text, TextStyle, Column, Row, Container, Font, PdfColors } = api;
  const document = new Document({ compress, title: 'Font fixes / phase 7.2', author: 'Romulo Campos' });
  const sans = Font.ttf(fonts.openSans);
  const cjk = Font.ttf(fonts.cjk);
  const icons = Font.ttf(fonts.icons);

  const label = text => new Text(text, { style: new TextStyle({ fontSize: 9, color: PdfColors.blueGrey700 }) });
  const heading = text => new Text(text, { style: new TextStyle({ fontSize: 14, color: PdfColors.indigo }) });
  const panel = (title, children) => new Container({ padding: 10, background: '#eef2ff', child: new Column({
    crossAxisAlignment: 'start', mainAxisSize: 'min', gap: 6, children: [heading(title), ...children]
  }) });
  const typographic = '“Quotes” ‘single’ – en dash — em dash • bullet … € 20 ™';
  const scripts = [
    'The quick brown fox jumps over the lazy dog 0123456789',
    'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝ',
    'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
    'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ'
  ].join('\n');
  const distinct = new Set(scripts.replace(/\s/g, '')).size;

  document.addPage(new Page({ pageFormat: PageFormat.A4, margin: 32,
    build: () => new Column({ crossAxisAlignment: 'start', mainAxisSize: 'min', gap: 14, children: [
      new Text('Font fixes / phase 7.2', { style: new TextStyle({ fontSize: 22, color: PdfColors.indigo }) }),
      panel('Copy and search: CJK and characters above U+FFFF', [
        new Text('中文排版测试、你好世界。字体设计与研究。',
          { style: new TextStyle({ font: cjk, fontSize: 18 }) }),
        new Row({ gap: 10, children: [
          new Text('\u{10FFFD}', { style: new TextStyle({ font: icons, fontSize: 28 }) }),
          label('U+10FFFD from MaterialIcons, a supplementary-plane character. Its ToUnicode entry is now the\n'
            + 'surrogate pair <DBFFDFFD>; before 7.2 it was <10FFFD>, which a reader decodes as U+10FF and a stray byte.')
        ] }),
        label('Copy-paste of the CJK line and of the icon above now returns the same characters. Emoji and CJK Ext-B\n'
          + 'take the same path; examples/assets ships no emoji font, so U+10FFFD stands in for them here.')
      ]),
      panel(`More than 100 distinct characters in one font (${distinct} here)`, [
        new Text(scripts, { style: new TextStyle({ font: sans, fontSize: 11 }) }),
        label('The ToUnicode CMap is written in sections of at most 100 entries, the limit of the CMap format.\n'
          + 'Before 7.2 it was a single section, so strict readers dropped the mapping for this whole paragraph.')
      ]),
      panel('Standard fonts: the WinAnsi repertoire, with OpenSans as the fallback font', [
        new Text(typographic, { style: new TextStyle({ fontSize: 12, fontFallback: [sans] }) }),
        label('After: Helvetica draws every one of these itself, so none of them reaches the fallback font.'),
        new Text(typographic, { style: new TextStyle({ font: sans, fontSize: 12 }) }),
        label('Before, for comparison: Helvetica reported them unsupported and each one switched to OpenSans,\n'
          + 'as in the line above. U+0080..U+009F, which have no WinAnsi glyph, now go to the fallback instead.')
      ]),
      panel('Embedded subsets', [
        label('The subsets on this page keep the hinting tables their source fonts have (cvt, fpgm, prep, gasp),\n'
          + 'which the glyph instructions call; before 7.2 they were dropped. The table directory is sorted by tag\n'
          + 'and its search fields follow the spec: 128 / 3 / 96 for the 14 OpenSans tables. The 10-table subsets\n'
          + 'before 7.2 said 256 / 2 / 96 where 128 / 3 / 32 was required.'),
        label('The cmap fixes (format 0, Mac Roman and symbol subtables, idDelta, glyph-0 holes, truncated subtables)\n'
          + 'need fonts that examples/assets does not have; test/fonts_phase_7_2.test.mjs builds them.')
      ])
    ] })
  }));
  return document.save();
}
