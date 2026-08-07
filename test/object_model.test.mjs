/*
 * js_pdf tests — the phase 0.2 object model.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 *
 * These import the format and obj modules directly rather than through
 * src/index.ts: the object model is internal, and phase 0.2 deliberately adds
 * nothing to the public API.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { PdfArray } from '../src/pdf/format/array.ts';
import { PdfBool } from '../src/pdf/format/bool.ts';
import { PdfDict } from '../src/pdf/format/dict.ts';
import { PdfDictStream } from '../src/pdf/format/dict_stream.ts';
import { PdfIndirect } from '../src/pdf/format/indirect.ts';
import { PdfName } from '../src/pdf/format/name.ts';
import { PdfNull } from '../src/pdf/format/null_value.ts';
import { PdfNum, PdfNumList } from '../src/pdf/format/num.ts';
import { PdfObjectBase } from '../src/pdf/format/object_base.ts';
import { PdfStream, encodeLatin1 } from '../src/pdf/format/stream.ts';
import { PdfString } from '../src/pdf/format/string.ts';
import { PdfDocument } from '../src/pdf/document.ts';
import { PdfCanvas } from '../src/pdf/graphics.ts';
import { PdfType1Font } from '../src/pdf/font/type1_fonts.ts';
import { PdfGraphicStream } from '../src/pdf/obj/graphic_stream.ts';
import { PageFormat } from '../src/pdf/page_format.ts';
import { latin1 } from "./support/pdf-text.mjs";


function write(value) {
  const stream = new PdfStream();
  value.output(stream);
  return latin1(stream.output());
}

test('PdfStream grows past its initial capacity and reports a running offset', () => {
  const stream = new PdfStream();
  assert.equal(stream.offset, 0);

  const chunk = 'x'.repeat(70000);
  stream.putString(chunk);
  assert.equal(stream.offset, 70000);

  stream.putByte(0x0a);
  stream.putBytes(encodeLatin1('end'));
  assert.equal(stream.offset, 70004);

  const bytes = stream.output();
  assert.equal(bytes.length, 70004);
  assert.equal(latin1(bytes.subarray(70000)), '\nend');
});

test('PdfStream keeps high bytes intact', () => {
  // The file header's binary marker is not 7-bit, unlike upstream's assertion.
  assert.equal(write(new PdfName('/A')), '/A');
  const stream = new PdfStream();
  stream.putString('%\xE2\xE3\xCF\xD3');
  assert.deepEqual(Array.from(stream.output()), [0x25, 0xe2, 0xe3, 0xcf, 0xd3]);
});

test('PdfStream can finalize and release its growable allocation', () => {
  const stream = new PdfStream();
  stream.putString('page');
  assert.equal(latin1(stream.take(0x0a)), 'page\n');
  assert.equal(stream.offset, 0);

  stream.putString('next');
  assert.equal(latin1(stream.output()), 'next');
});

test('PdfName hex-escapes delimiters and keeps the leading slash literal', () => {
  assert.equal(write(new PdfName('/Type')), '/Type');
  assert.equal(write(new PdfName('/A B')), '/A#20B');
  assert.equal(write(new PdfName('/a/b')), '/a#2fb');
  assert.equal(write(new PdfName('/x#y')), '/x#23y');
  assert.equal(write(new PdfName('/[]()<>')), '/#5b#5d#28#29#3c#3e');
  assert.throws(() => new PdfName('Type'), TypeError);
});

test('PdfNum drops trailing zeros, negative zero and exponent notation', () => {
  assert.equal(write(new PdfNum(0)), '0');
  assert.equal(write(new PdfNum(-0)), '0');
  assert.equal(write(new PdfNum(1e-9)), '0');
  assert.equal(write(new PdfNum(12)), '12');
  assert.equal(write(new PdfNum(595.2755905511812)), '595.2756');
  assert.equal(write(new PdfNum(-3.5)), '-3.5');
  assert.equal(write(new PdfNumList([1, 0, 0, 1, 40, 789.89])), '1 0 0 1 40 789.89');
});

test('PdfString, PdfBool, PdfNull and PdfIndirect serialize to PDF syntax', () => {
  assert.equal(write(new PdfString('js_pdf')), '(js_pdf)');
  assert.equal(write(new PdfString('Relatório')), '(Relat\\363rio)');
  assert.equal(write(new PdfString('a(b)c\\d')), '(a\\(b\\)c\\\\d)');
  assert.equal(write(new PdfString('東京 🚀')), '<feff67714eac0020d83dde80>');
  assert.equal(
    write(PdfString.fromDate(new Date('2026-08-06T19:23:45.987-03:00'))),
    '(D:20260806222345Z)'
  );
  assert.throws(() => PdfString.fromDate(new Date(Number.NaN)), /must be valid/);
  assert.equal(write(new PdfBool(true)), 'true');
  assert.equal(write(new PdfBool(false)), 'false');
  assert.equal(write(new PdfNull()), 'null');
  assert.equal(write(new PdfIndirect(12, 0)), '12 0 R');
  assert.ok(new PdfIndirect(3, 0).equals(new PdfIndirect(3, 0)));
  assert.ok(!new PdfIndirect(3, 0).equals(new PdfIndirect(3, 1)));
});

test('PdfArray separates every element with a single space', () => {
  assert.equal(write(new PdfArray()), '[]');
  assert.equal(write(PdfArray.fromNum([0, 0, 595.2756, 841.8898])), '[0 0 595.2756 841.8898]');
  assert.equal(write(new PdfArray([new PdfName('/A'), new PdfName('/B')])), '[/A /B]');

  const objects = [
    new PdfObjectBase(5, new PdfDict()),
    new PdfObjectBase(9, new PdfDict())
  ];
  assert.equal(write(PdfArray.fromObjects(objects)), '[5 0 R 9 0 R]');
});

test('PdfDict emits insertion order and nests', () => {
  const dict = new PdfDict([
    ['/Type', new PdfName('/Page')],
    ['/Parent', new PdfIndirect(2, 0)]
  ]);
  assert.equal(write(dict), '<< /Type /Page /Parent 2 0 R >>');

  // Re-setting a key keeps its original position.
  dict.set('/Type', new PdfName('/Pages'));
  assert.equal(write(dict), '<< /Type /Pages /Parent 2 0 R >>');

  dict.set('/Resources', new PdfDict([['/Font', new PdfDict([['/F1', new PdfIndirect(3, 0)]])]]));
  assert.match(write(dict), /\/Resources << \/Font << \/F1 3 0 R >> >>/);

  assert.equal(write(new PdfDict()), '<<  >>');
  assert.ok(new PdfDict().isEmpty);
  assert.ok(dict.has('/Type'));
  assert.equal(dict.get('/missing'), undefined);
});

test('PdfDict.fromObjectMap turns objects into references', () => {
  const font = new PdfObjectBase(3, new PdfDict());
  assert.equal(write(PdfDict.fromObjectMap([['/F1', font]])), '<< /F1 3 0 R >>');
});

test('PdfDictStream derives /Length and terminates the data with one newline', () => {
  // Data already ending in a newline is not given a second one, which is what
  // keeps page content streams byte-identical to the pre-0.2 serializer.
  const ending = new PdfDictStream(encodeLatin1('BT ET\n'));
  assert.equal(write(ending), '<< /Length 6 >>\nstream\nBT ET\nendstream');

  // Binary data that does not end in a newline gets one, as the spec wants.
  const binary = new PdfDictStream(new Uint8Array([0x00, 0xff]));
  assert.equal(write(binary), '<< /Length 2 >>\nstream\n\x00\xff\nendstream');

  const empty = new PdfDictStream();
  assert.equal(write(empty), '<< /Length 0 >>\nstream\n\nendstream');
});

test('PdfDictStream compression is repeatable without mutating its dictionary', () => {
  const value = new PdfDictStream(new Uint8Array(4096).fill(0x41), undefined, true);
  const output = () => {
    const stream = new PdfStream();
    value.output(stream);
    return stream.output();
  };

  const first = output();
  assert.deepEqual(output(), first);
  assert.match(Buffer.from(first).toString('latin1'), /\/Filter \/FlateDecode \/Length \d+/);
  assert.equal(value.has('/Filter'), false);
  assert.equal(value.has('/Length'), false);
});

test('PdfObjectBase wraps its value and reports the offset it started at', () => {
  const stream = new PdfStream();
  stream.putString('%PDF\n');

  const object = new PdfObjectBase(7, new PdfDict([['/Type', new PdfName('/Font')]]), 0);
  const offset = object.output(stream);

  assert.equal(offset, 5);
  assert.equal(latin1(stream.output()).slice(offset), '7 0 obj\n<< /Type /Font >>\nendobj\n');
  assert.equal(write(object.ref()), '7 0 R');
});

test('PdfDocument numbers the catalog first and content before its page', () => {
  const document = new PdfDocument({ creator: 'js_pdf' });

  assert.equal(document.catalog.objser, 1);
  assert.equal(document.pageList.objser, 2);
  assert.equal(document.info.objser, 3);

  // No font object is preallocated as of phase 0.3 — a page that draws no text
  // needs none, and one that does gets its fonts numbered at addPage time.
  const first = document.addPage(PageFormat.A4, 'BT ET\n');
  assert.equal(first.contents[0].objser, 4, 'content stream precedes its page');
  assert.equal(first.objser, 5);

  const second = document.addPage(PageFormat.A4, 'BT ET\n');
  assert.equal(second.contents[0].objser, 6);
  assert.equal(second.objser, 7);
});

test('prepare resolves forward references and the xref table stays contiguous', () => {
  const document = new PdfDocument({ creator: 'js_pdf' });
  document.addPage(PageFormat.A4, 'BT ET\n');
  const source = latin1(document.save());

  // The catalog points at a page list created after it.
  assert.match(source, /1 0 obj\n<< \/Type \/Catalog \/Pages 2 0 R >>\nendobj/);
  assert.match(source, /2 0 obj\n<< \/Type \/Pages \/Count 1 \/Kids \[5 0 R\] >>\nendobj/);
  assert.match(source, /\/Type \/Page \/Parent 2 0 R \/MediaBox \[0 0 595\.28 841\.89\]/);

  // One block covering object 0 through 5, then the trailer.
  assert.match(source, /xref\n0 6\n0000000000 65535 f \n/);
  assert.equal((source.match(/ 00000 n \n/g) ?? []).length, 5);
  assert.match(source, /trailer\n<< \/Size 6 \/Root 1 0 R \/Info 3 0 R >>\n/);
});

test('startxref points at the byte offset of the xref keyword', () => {
  const document = new PdfDocument({ creator: 'js_pdf' });
  document.addPage(PageFormat.A4, 'BT ET\n');
  const source = latin1(document.save());

  const declared = Number(/startxref\n(\d+)\n/.exec(source)[1]);
  assert.equal(source.slice(declared, declared + 5), 'xref\n');
  assert.equal(declared, source.lastIndexOf('xref\n0 '));
});

test('every xref offset lands on its own object header', () => {
  const document = new PdfDocument({ title: 'Título', creator: 'js_pdf' });
  document.addPage(PageFormat.A4, 'BT ET\n');
  document.addPage(PageFormat.LETTER, 'BT ET\n');
  const source = latin1(document.save());

  const offsets = Array.from(source.matchAll(/^(\d{10}) 00000 n $/gm), m => Number(m[1]));
  assert.equal(offsets.length, 7);

  offsets.forEach((offset, index) => {
    assert.equal(
      source.slice(offset, offset + `${index + 1} 0 obj`.length),
      `${index + 1} 0 obj`,
      `xref row ${index + 1} must point at object ${index + 1}`
    );
  });
});

test('a page with several content streams references them as an array', () => {
  const document = new PdfDocument({ creator: 'js_pdf' });
  const page = document.addPage(PageFormat.A4, 'BT ET\n');
  const extra = document.addPage(PageFormat.A4, 'q Q\n');

  // Re-home the second page's stream onto the first, then drop the page so the
  // document holds one page with two content streams.
  page.contents.push(extra.contents[0]);
  document.pageList.pages.splice(1, 1);

  const source = latin1(document.save());
  assert.match(source, /\/Contents \[4 0 R 6 0 R\]/);
});

// ---------------------------------------------------------------------------
// Phase 0.3 — the per-page resource dictionary.
// ---------------------------------------------------------------------------

test('PdfCanvas names fonts /F1, /F2, … in first-use order', () => {
  const canvas = new PdfCanvas(841.89);
  const helvetica = PdfType1Font.helvetica();
  const times = PdfType1Font.times();

  assert.equal(canvas.addFont(helvetica), '/F1');
  assert.equal(canvas.addFont(times), '/F2');
  assert.equal(canvas.addFont(helvetica), '/F1', 'the same font keeps its name');

  assert.deepEqual([...canvas.fonts], [[helvetica, '/F1'], [times, '/F2']]);
});

test('PdfCanvas.text registers the font it drew with', () => {
  const canvas = new PdfCanvas(841.89);
  const times = PdfType1Font.times();

  canvas.text('a', 10, 20, { fontSize: 12, color: '#000000', font: times });
  canvas.text('b', 10, 40, { fontSize: 12, color: '#000000' });

  assert.match(canvas.output(), /BT \/F1 12 Tf/);
  assert.match(canvas.output(), /BT \/F2 12 Tf/);
  assert.equal(canvas.fonts.get(times), '/F1');
  assert.equal(canvas.fonts.size, 2);
});

test('a page using two fonts emits two /Font entries pointing at both objects', () => {
  const document = new PdfDocument({ creator: 'js_pdf' });
  const helvetica = PdfType1Font.helvetica();
  const times = PdfType1Font.times();

  document.addPage(
    PageFormat.A4,
    'BT /F1 12 Tf (a) Tj ET\nBT /F2 12 Tf (b) Tj ET\n',
    new Map([[helvetica, '/F1'], [times, '/F2']])
  );

  const source = latin1(document.save());
  const helveticaSerial = document.fontObject(helvetica).objser;
  const timesSerial = document.fontObject(times).objser;

  assert.notEqual(helveticaSerial, timesSerial);
  assert.match(source, /\/Type \/Font \/Subtype \/Type1 \/BaseFont \/Helvetica\b/);
  assert.match(source, /\/Type \/Font \/Subtype \/Type1 \/BaseFont \/Times-Roman\b/);
  assert.match(
    source,
    new RegExp(
      `/Resources << /Font << /F1 ${helveticaSerial} 0 R /F2 ${timesSerial} 0 R >> >>`
    )
  );
});

test('one font object is shared by every page that uses it', () => {
  const document = new PdfDocument({ creator: 'js_pdf' });
  const helvetica = PdfType1Font.helvetica();
  const fonts = new Map([[helvetica, '/F1']]);

  document.addPage(PageFormat.A4, 'BT /F1 12 Tf (a) Tj ET\n', fonts);
  document.addPage(PageFormat.A4, 'BT /F1 12 Tf (b) Tj ET\n', fonts);

  const source = latin1(document.save());
  assert.equal((source.match(/\/BaseFont \/Helvetica\b/g) ?? []).length, 1);
  assert.equal((source.match(/\/Font << \/F1 4 0 R >>/g) ?? []).length, 2);
});

test('a page that drew nothing gets no /Resources at all', () => {
  const document = new PdfDocument({ creator: 'js_pdf' });
  document.addPage(PageFormat.A4, 'q Q\n');

  const source = latin1(document.save());
  assert.ok(!source.includes('/Resources'), 'an empty resource dict is omitted');
});

test('PdfGraphicStream collects /Font, /XObject and /ExtGState', () => {
  const document = new PdfDocument({ creator: 'js_pdf' });
  const stream = new PdfGraphicStream(document, new PdfDict());

  assert.equal(write(stream.params), '<<  >>', 'nothing registered yet');

  const font = new PdfObjectBase(11, new PdfDict());
  const image = new PdfObjectBase(12, new PdfDict());

  // /Font and /XObject name indirect objects; /ExtGState holds the state
  // dictionary inline, since phase 2.1 registers states per page rather than in
  // one document-wide object as upstream does.
  const state = new PdfDict([['/ca', new PdfNum(0.5)]]);

  stream.addFont('/F1', font);
  stream.addFont('/F1', new PdfObjectBase(99, new PdfDict()));
  stream.addXObject('/X1', image);
  stream.addGraphicState('/g1', state);
  stream.prepare();

  assert.equal(
    write(stream.params),
    '<< /Resources << /Font << /F1 11 0 R >> /XObject << /X1 12 0 R >>'
      + ' /ExtGState << /g1 << /ca 0.5 >> >> >> >>'
  );
});
