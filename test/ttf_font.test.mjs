/*
 * js_pdf tests — phase 1.3 TTF embedding and phase 1.4 font selection.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Pdf from '../src/index.ts';
import { PdfTtfFont } from '../src/pdf/obj/ttf_font.ts';
import { latin1 } from "./support/pdf-text.mjs";

const asset = name => new Uint8Array(
  readFileSync(new URL(`../examples/assets/${name}`, import.meta.url))
);

const openSans = asset('OpenSans-Regular.ttf');
const openSansBold = asset('OpenSans-Bold.ttf');


/** The `/ToUnicode` CMap's CID → code point table, as the reader sees it. */
function toUnicodeMap(source) {
  const stream = source.slice(source.indexOf('beginbfchar'), source.indexOf('endbfchar'));
  const map = new Map();
  for (const [, cid, rune] of stream.matchAll(/<([0-9A-F]{4})> <([0-9A-F]{4})>/g)) {
    map.set(parseInt(cid, 16), parseInt(rune, 16));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Phase 1.3 — embedding.
// ---------------------------------------------------------------------------

test('an embedded font is written as a Type0 composite with Identity-H', () => {
  const bytes = Pdf.createPdf(
    { theme: Pdf.ThemeData.withFont({ base: Pdf.Font.ttf(openSans) }) },
    () => new Pdf.Page({ build: () => new Pdf.Text('Relatório') })
  );

  const source = latin1(bytes);
  assert.match(source, /\/Subtype \/Type0/);
  assert.match(source, /\/Encoding \/Identity-H/);
  assert.match(source, /\/Subtype \/CIDFontType2/);
  assert.match(source, /\/CIDToGIDMap \/Identity/);
  assert.match(source, /\/BaseFont \/OpenSans-Regular/);
  assert.match(source, /\/Type \/FontDescriptor/);
  assert.match(source, /\/FontFile2 \d+ 0 R/);
  assert.match(source, /\/ToUnicode \d+ 0 R/);
  assert.match(source, /\/Length1 \d+/);
});

test('text becomes hex CIDs, and /ToUnicode maps them back to the source string', () => {
  const text = 'Relatório de execução';
  const bytes = Pdf.createPdf(
    { theme: Pdf.ThemeData.withFont({ base: Pdf.Font.ttf(openSans) }) },
    () => new Pdf.Page({ build: () => new Pdf.Text(text) })
  );

  const source = latin1(bytes);
  const run = source.match(/<([0-9a-f]+)> Tj/);
  assert.ok(run, 'the content stream must carry a hex string, not a literal');

  const cids = run[1].match(/.{4}/g).map(digits => parseInt(digits, 16));
  const map = toUnicodeMap(source);
  const decoded = cids.map(cid => String.fromCodePoint(map.get(cid))).join('');

  assert.equal(decoded, text, 'the CMap must round-trip the text a reader copies');
});

test('the embedded program is a subset, not the whole file', () => {
  const bytes = Pdf.createPdf(
    { theme: Pdf.ThemeData.withFont({ base: Pdf.Font.ttf(openSans) }) },
    () => new Pdf.Page({ build: () => new Pdf.Text('abc') })
  );

  const length1 = Number(latin1(bytes).match(/\/Length1 (\d+)/)[1]);
  assert.ok(length1 > 0);
  assert.ok(length1 < openSans.length / 10, 'only the used glyphs may be embedded');
});

test('advance widths come from the font, so wrapping differs from Helvetica', () => {
  const font = new PdfTtfFont(openSans);
  const helvetica = Pdf.PdfType1Font.helvetica();

  const embedded = font.stringMetrics('Hello', 12).advanceWidth;
  assert.ok(embedded > 0);
  assert.notEqual(embedded.toFixed(4), helvetica.stringMetrics('Hello', 12).advanceWidth.toFixed(4));

  // A code point the font cannot draw contributes nothing, rather than throwing.
  assert.equal(font.isRuneSupported(0x65e5), false);
  assert.equal(font.stringMetrics('日', 12).advanceWidth, 0);
});

test('the same declaration is embedded once per document, twice across documents', () => {
  const declaration = Pdf.Font.ttf(openSans);
  const theme = Pdf.ThemeData.withFont({ base: declaration });

  const bytes = Pdf.createPdf({ theme }, () => new Pdf.MultiPage({
    build: () => Array.from({ length: 60 }, (_, index) => new Pdf.Text(`Linha ${index + 1}`))
  }));

  const source = latin1(bytes);
  assert.ok((source.match(/\/Type \/Page\b/g) ?? []).length >= 2, 'the fixture must overflow');
  assert.equal((source.match(/\/FontFile2 \d+ 0 R/g) ?? []).length, 2, 'one stream, referenced twice');
  assert.equal((source.match(/\/Subtype \/Type0/g) ?? []).length, 1);

  // A second document must not inherit the first one's accumulated CIDs.
  const other = latin1(Pdf.createPdf({ theme }, () => new Pdf.Page({
    build: () => new Pdf.Text('a')
  })));
  assert.equal(toUnicodeMap(other).size, 2, 'only .notdef and `a`');
});

test('a font the port cannot subset is rejected at construction', () => {
  // `OTTO` marks PostScript outlines. The port embeds only sfnt 0x00010000,
  // which is what has the `glyf`/`loca` pair the subsetter rebuilds.
  const notTrueType = new Uint8Array(asset('OpenSans-Regular.ttf'));
  new DataView(notTrueType.buffer).setUint32(0, 0x4f54544f);

  assert.throws(() => new PdfTtfFont(notTrueType), /TrueType/);
});

// ---------------------------------------------------------------------------
// Phase 1.4 — font selection and theming.
// ---------------------------------------------------------------------------

test('nested styles resolve to the expected font per text run', () => {
  const theme = Pdf.ThemeData.withFont({
    base: Pdf.Font.ttf(openSans),
    bold: Pdf.Font.ttf(openSansBold)
  });

  const bytes = Pdf.createPdf({ theme }, () => new Pdf.Page({
    build: () => new Pdf.Column({
      children: [
        new Pdf.Text('regular'),
        new Pdf.Text('bold', { style: new Pdf.TextStyle({ fontWeight: 'bold' }) }),
        new Pdf.DefaultTextStyle({
          style: new Pdf.TextStyle({ font: Pdf.Font.courier() }),
          child: new Pdf.Column({
            children: [
              new Pdf.Text('inherited courier'),
              new Pdf.Text('still bold', { style: new Pdf.TextStyle({ fontWeight: 'bold' }) })
            ]
          })
        })
      ]
    })
  }));

  const source = latin1(bytes);
  const resources = source.match(/\/Resources << \/Font << (.+?) >> >>/)[1];
  const names = [...resources.matchAll(/(\/F\d+) (\d+) 0 R/g)];
  assert.equal(names.length, 3, 'regular, bold and Courier are three fonts');

  // Map each resource name to the base font of the object it points at.
  const baseFontOf = objser => {
    const object = source.slice(source.indexOf(`\n${objser} 0 obj`));
    return object.match(/\/BaseFont (\/[\w-]+)/)[1];
  };
  const byName = new Map(names.map(([, name, objser]) => [name, baseFontOf(objser)]));

  const runs = [...source.matchAll(/BT (\/F\d+) /g)].map(([, name]) => byName.get(name));
  assert.deepEqual(runs, [
    '/OpenSans-Regular',
    '/OpenSans-Bold',
    '/Courier',
    // `DefaultTextStyle` named only a regular face, and merging leaves the
    // theme's other slots alone — so bold below it is still the theme's bold.
    '/OpenSans-Bold'
  ]);
});

test('Theme scopes its data to its subtree only', () => {
  const outer = Pdf.ThemeData.withFont({ base: Pdf.Font.ttf(openSans) });
  const inner = Pdf.ThemeData.withFont({ base: Pdf.Font.times() });

  const bytes = Pdf.createPdf({ theme: outer }, () => new Pdf.Page({
    build: () => new Pdf.Column({
      children: [
        new Pdf.Theme({ data: inner, child: new Pdf.Text('inside') }),
        new Pdf.Text('outside')
      ]
    })
  }));

  const source = latin1(bytes);
  assert.match(source, /\/BaseFont \/Times-Roman/);
  assert.match(source, /\/BaseFont \/OpenSans-Regular/);
  assert.equal((source.match(/BT \/F\d+ /g) ?? []).length, 2);
});

test('a TextStyle merges onto the theme rather than replacing it', () => {
  const base = new Pdf.TextStyle({ fontSize: 20, color: '#ff0000' });
  const merged = Pdf.ThemeData.base().defaultTextStyle.merge(base);

  assert.equal(merged.fontSize, 20);
  assert.deepEqual(merged.color, [1, 0, 0]);
  assert.ok(merged.font, 'the theme still supplies the font');

  // Only the stated fields win; the rest are inherited.
  const overlaid = merged.merge(new Pdf.TextStyle({ fontSize: 8 }));
  assert.equal(overlaid.fontSize, 8);
  assert.deepEqual(overlaid.color, [1, 0, 0]);
});

test('TextStyle picks the face its weight and slant name', () => {
  const style = new Pdf.TextStyle({
    fontNormal: Pdf.Font.helvetica(),
    fontBold: Pdf.Font.helveticaBold(),
    fontItalic: Pdf.Font.helveticaOblique()
  });

  assert.equal(style.font, style.fontNormal);
  assert.equal(style.copyWith({ fontWeight: 'bold' }).font, style.fontBold);
  assert.equal(style.copyWith({ fontStyle: 'italic' }).font, style.fontItalic);
  // No bold-italic face was named. `copyWith` carries the source style's
  // resolved face across as `font`, and the constructor drops it into whichever
  // slot the new weight and slant select — so the empty slot is filled with the
  // regular face rather than falling through to bold. This is upstream's
  // behaviour, and it is why `ThemeData.withFont` states every slot explicitly.
  assert.equal(
    style.copyWith({ fontWeight: 'bold', fontStyle: 'italic' }).font,
    style.fontNormal
  );
});

test('letterSpacing reaches both the metrics and the Tc operator', () => {
  const spaced = new Pdf.TextStyle({ letterSpacing: 3 });
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.Text('AV', { style: spaced })
  }));

  assert.match(latin1(bytes), /BT \/F1 12 Tf 0 0 0 rg 3 Tc /);

  const font = Pdf.PdfType1Font.helvetica();
  assert.equal(
    font.stringMetrics('AV', 12, 3).advanceWidth.toFixed(4),
    (font.stringMetrics('AV', 12).advanceWidth + 3).toFixed(4)
  );
});

test('PageTheme carries the paper, margins and theme of a page', () => {
  const pageTheme = new Pdf.PageTheme({
    pageFormat: Pdf.PageFormat.A4,
    orientation: 'landscape',
    margin: 10,
    theme: Pdf.ThemeData.withFont({ base: Pdf.Font.courier() })
  });

  assert.equal(pageTheme.mustRotate, true);
  assert.equal(pageTheme.resolvedFormat.width.toFixed(2), Pdf.PageFormat.A4.height.toFixed(2));
  assert.equal(pageTheme.resolvedFormat.height.toFixed(2), Pdf.PageFormat.A4.width.toFixed(2));

  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    pageTheme,
    build: () => new Pdf.Text('landscape')
  }));

  const source = latin1(bytes);
  assert.match(source, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  assert.match(source, /\/BaseFont \/Courier\b/);
});

test('a page background and foreground are painted around the body', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    pageTheme: new Pdf.PageTheme({
      buildBackground: () => new Pdf.Container({ width: 100, height: 100, background: '#00ff00' }),
      buildForeground: () => new Pdf.Container({ width: 50, height: 50, background: '#0000ff' })
    }),
    build: () => new Pdf.Text('body')
  }));

  const source = latin1(bytes);
  const background = source.indexOf('0 1 0 rg');
  const body = source.indexOf('BT ');
  const foreground = source.indexOf('0 0 1 rg');

  assert.ok(background >= 0 && body >= 0 && foreground >= 0);
  assert.ok(background < body, 'the background is drawn first');
  assert.ok(body < foreground, 'the foreground is drawn last');
});

test('DocumentOptions.font still selects the default face', () => {
  const bytes = Pdf.createPdf(
    { font: Pdf.PdfType1Font.timesBoldItalic() },
    () => new Pdf.Page({ build: () => new Pdf.Text('legacy option') })
  );

  const source = latin1(bytes);
  assert.match(source, /\/BaseFont \/Times-BoldItalic\b/);
  assert.equal((source.match(/\/BaseFont /g) ?? []).length, 1, 'and only that face');
});
