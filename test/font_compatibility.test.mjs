/*
 * js_pdf simple TrueType and OpenType CFF regression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pw from '../src/index.ts';
const asset = name => new Uint8Array(readFileSync(new URL('../examples/assets/' + name, import.meta.url)));
const pdf = font => {
  const doc = new pw.Document({ compress: false });
  doc.addPage(new pw.Page({ build: () => new pw.Text('Café € — Ω', { style: new pw.TextStyle({ font }) }) }));
  return Buffer.from(doc.save()).toString('latin1');
};
test('explicit simple TrueType emits WinAnsi bytes, matching widths and full program', () => {
  const bytes = asset('OpenSans-Regular.ttf');
  const font = new pw.PdfTtfFont(bytes, { unicode: false });
  assert.equal(font.isComposite, false);
  assert.equal(font.encodeText('A€é'), '(A\\200\\351)');
  assert.equal(font.isRuneSupported(0x3a9), false);
  const result = pdf(pw.Font.ttf(bytes, { unicode: false }));
  assert.match(result, /\/Subtype \/TrueType/);
  assert.match(result, /\/FirstChar 32 \/LastChar 255/);
  assert.match(result, /\/Encoding \/WinAnsiEncoding/);
  assert.doesNotMatch(result, /\/CIDFontType2/);
  assert.equal(font.glyphMetrics(0x20ac).advanceWidth, new pw.PdfTtfFont(bytes).glyphMetrics(0x20ac).advanceWidth);
});
for (const name of ['JsPdfCffExample.otf','JsPdfCffCidExample.otf']) {
  test(`${name} embeds a CFF OpenType program with glyph mapping and searchable text`, () => {
    const bytes = asset(name), font = new pw.PdfTtfFont(bytes);
    assert.equal(font.glyphMetrics(65).advanceWidth, 0.544);
    assert.ok(font.isRuneSupported(0x3a9));
    const result = pdf(pw.Font.ttf(bytes));
    if (name.includes('Cid')) assert.match(result, /\/Ordering \(JsPdfTest\)/);
    assert.match(result, /\/FontFile3/); assert.match(result, /\/Subtype \/OpenType/);
    assert.match(result, /\/Subtype \/CIDFontType0\b/); assert.doesNotMatch(result, /\/CIDToGIDMap/);
    assert.match(result, /begincidchar/); assert.match(result, /<03A9>/);
    assert.throws(() => new pw.PdfTtfFont(bytes, { unicode: false }), /CFF.*composite/);
  });
}
test('legacy true sfnt signature supports the explicit simple branch', () => {
  const bytes = asset('OpenSans-Regular.ttf'); bytes.set([0x74,0x72,0x75,0x65]);
  assert.equal(new pw.PdfTtfFont(bytes).isComposite, false);
});
test('CFF ROS accepts standard string identifiers as well as custom strings', async () => {
 const { cffFontMetadata } = await import('../src/pdf/font/cff.ts');
 // Minimal metadata fixture: one .notdef charstring, explicit empty charset.
 const index = data => Uint8Array.from([0,1,1,1,data.length+1,...data]);
 const header = Uint8Array.of(1,0,4,4), name = index([65]);
 // ROS uses standard SID 388 (Regular) for both registry and ordering.
 const dict = [248,24,248,24,139,12,30, 169,15, 170,17];
 const top = index(dict), strings = Uint8Array.of(0,0), globals = Uint8Array.of(0,0);
 const bytes = Uint8Array.from([...header,...name,...top,...strings,...globals,0,...index([14])]);
 const metadata = cffFontMetadata(bytes,1);
 assert.equal(metadata.registry,'Regular'); assert.equal(metadata.ordering,'Regular');
});
test('document simpleTrueTypeFonts selects encoding per document without leaking through shared declarations', () => {
 const font = pw.Font.ttf(asset('OpenSans-Regular.ttf'));
 const simple = new pw.Document({ compress: false, simpleTrueTypeFonts: true });
 const composite = new pw.Document({ compress: false });
 for (const doc of [simple, composite]) doc.addPage(new pw.Page({ build: () => new pw.Text('Café €', { style: new pw.TextStyle({ font }) }) }));
 assert.match(Buffer.from(simple.save()).toString('latin1'), /\/Subtype \/TrueType/);
 assert.match(Buffer.from(composite.save()).toString('latin1'), /\/Subtype \/CIDFontType2/);
 assert.equal(simple.resolveFont(font).isComposite, false);
 assert.equal(composite.resolveFont(font).isComposite, true);
});
