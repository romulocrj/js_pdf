/*
 * js_pdf synchronous output and lazy JPEG regression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pw from '../src/index.ts';
import { PdfStream } from '../src/pdf/format/stream.ts';
import { PdfDocument } from '../src/pdf/document.ts';
import { latin1 } from './support/pdf-text.mjs';

class Destination extends PdfStream {
  constructor(consume = () => {}) { super(); this.lengthWritten = 0; this.calls = 0; this.consume = consume; }
  get offset() { return this.lengthWritten; }
  putByte(byte) { this.putBytes(Uint8Array.of(byte)); }
  putBytes(bytes) { this.consume(bytes); this.lengthWritten += bytes.length; this.calls++; }
  output() { assert.fail('output() must not be used on an external destination'); }
}
const jpeg = () => new Uint8Array(readFileSync(new URL('../examples/assets/dpi-pattern.jpg', import.meta.url)));

function documentWith(image = null, compress = false) {
  const doc = new pw.Document({ title: 'Synchronous output', compress, pageMode: 'outlines' });
  doc.addPage(new pw.Page({ build: () => new pw.Column({ children: [
    new pw.Header({ text: 'First', level: 0 }), new pw.Text('Hello output'),
    ...(image === null ? [] : [new pw.Image(new pw.ImageProxy(image), { width: 120, height: 60 })])
  ] }) }));
  doc.addPage(new pw.MultiPage({ pageFormat: { width: 220, height: 180 }, margin: 20,
    header: context => new pw.Text(`${context.pageNumber}/${context.pagesCount}`),
    build: () => Array.from({ length: 25 }, (_, i) => new pw.Text(`row ${i}`))
  }));
  return doc;
}

function assertXref(bytes) {
  const source = Buffer.from(bytes).toString('latin1');
  const start = Number(/startxref\n(\d+)/.exec(source)[1]);
  assert.equal(source.slice(start, start + 5), 'xref\n');
  const table = /^xref\n0 (\d+)\n([^]*?)trailer/.exec(source.slice(start));
  const rows = table[2].trimEnd().split('\n');
  for (let i = 1; i < Number(table[1]); i++) {
    const offset = Number(rows[i].slice(0, 10));
    assert.ok(source.slice(offset).startsWith(`${i} 0 obj\n`), `xref entry ${i}`);
  }
}

test('PdfStream is public on the named, namespace and callback APIs', () => {
  assert.equal(pw.PdfStream, PdfStream);
  assert.equal(pw.js_pdf.PdfImage, pw.PdfImage);
  assert.equal(pw.js_pdf.PdfStream, PdfStream);
  pw.createPdf({}, api => {
    assert.equal(api.PdfStream, PdfStream);
    assert.equal(api.PdfImage, pw.PdfImage);
    return new api.Page({ build: () => new api.Text('stream') });
  });
});

test('base string writes dispatch to a destination override, tracking Latin-1 byte offsets', () => {
  const collected = new PdfStream();
  const output = new Destination(bytes => collected.putBytes(bytes));
  output.putByte(255);
  output.putBytes(Uint8Array.of(1, 2));
  output.putString('Aé\u0101');
  assert.equal(output.offset, 6);
  assert.deepEqual(collected.output(), Uint8Array.of(255, 1, 2, 65, 233, 1));
});

test('PdfStream copies only used bytes and patches without changing the offset', () => {
  const stream = new PdfStream();
  stream.putString('abcdef');
  stream.setBytes(1, Uint8Array.of(88, 89));
  assert.equal(stream.offset, 6);
  const dest = new PdfStream();
  dest.putStream(stream);
  assert.equal(latin1(dest.output()), 'aXYdef');
  assert.equal(dest.offset, 6);
  for (const offset of [-1, 6, 1.5, Infinity]) assert.throws(() => stream.setBytes(offset, Uint8Array.of(1)), /offset|bounds/i);
});

for (const compress of [false, true]) {
  test(`Document.write streams byte-identically to save, with valid xref (compress=${compress})`, () => {
    const doc = documentWith(pw.PdfImage.fromJpeg(jpeg()), compress);
    const recorded = new PdfStream();
    const destination = new Destination(bytes => recorded.putBytes(bytes));
    assert.equal(doc.write(destination), undefined);
    const saved = doc.save();
    assert.deepEqual(recorded.output(), saved);
    assert.equal(destination.offset, saved.length);
    assert.ok(destination.calls > 20);
    assertXref(recorded.output());
    const next = new PdfStream();
    doc.write(next);
    assert.deepEqual(next.output(), saved);
  });
}

test('low-level PdfDocument.write and save share the same serializer', () => {
  const doc = new PdfDocument({ title: 'Low-level' });
  const out = new PdfStream();
  doc.write(out);
  assert.deepEqual(out.output(), doc.save());
  assertXref(out.output());
});

test('destination errors propagate unchanged and a fresh destination can retry', () => {
  const failure = new Error('destination failure');
  const doc = documentWith();
  assert.throws(() => doc.write(new Destination(() => { throw failure; })), error => error === failure);
  const output = new PdfStream();
  doc.write(output);
  assert.deepEqual(output.output(), doc.save());
});

test('high-level empty documents keep their existing validation', () => {
  const output = new Destination();
  assert.throws(() => new pw.Document().write(output), /at least one page/);
  assert.equal(output.offset, 0);
});

test('lazy RGB JPEG writes chunks only at serialization and is deduplicated per save', () => {
  const bytes = jpeg();
  let calls = 0;
  const image = pw.PdfImage.jpegStream({ width: 320, height: 160, length: bytes.length,
    write: output => { calls++; output.putBytes(bytes.subarray(0, 111)); output.putBytes(bytes.subarray(111)); }
  });
  assert.equal(calls, 0);
  assert.equal(image.jpeg, null);
  assert.equal(image.pixels, null);
  const provider = new pw.ImageProxy(image);
  assert.equal(provider.resolve(), image);
  const doc = new pw.Document({ compress: false });
  for (let i = 0; i < 2; i++) doc.addPage(new pw.Page({ build: () => new pw.Image(provider, { width: 100 }) }));
  assert.equal(calls, 0);
  const output = new PdfStream();
  doc.write(output);
  assert.equal(calls, 1);
  const source = latin1(output.output());
  assert.equal((source.match(/\/Subtype \/Image/g) ?? []).length, 1);
  assert.match(source, /\/Filter \/DCTDecode/);
  assert.ok(source.includes(`/Length ${bytes.length}`));
  assert.ok(source.includes(latin1(bytes)));
  assertXref(output.output());
  assert.deepEqual(doc.save(), output.output());
  assert.equal(calls, 2);
});

test('lazy JPEG serialization matches the existing buffered image path', () => {
  const bytes = jpeg();
  const lazy = pw.PdfImage.jpegStream({ width: 320, height: 160, length: bytes.length, write: out => out.putBytes(bytes) });
  for (const compress of [false, true]) assert.deepEqual(documentWith(lazy, compress).save(), documentWith(pw.PdfImage.fromJpeg(bytes), compress).save());
});

test('lazy JPEG retains supplied orientation without invoking the writer during layout', () => {
  const image = pw.PdfImage.jpegStream({ width: 320, height: 160, length: 2,
    orientation: 'rightTop', write: () => assert.fail('not during layout') });
  assert.equal(image.width, 160);
  assert.equal(image.height, 320);
  const doc = new pw.Document();
  const widget = new pw.Image(new pw.ImageProxy(image), { width: 80 });
  const box = widget.layout({ document: doc, theme: doc.theme }, new pw.BoxConstraints({ maxWidth: 80, maxHeight: 200 }));
  assert.equal(box.width, 80);
  assert.equal(box.height, 160);
});

test('lazy JPEG validates metadata and emitted length and propagates source errors', () => {
  const options = { width: 1, height: 1, length: 2, write: out => out.putBytes(Uint8Array.of(255, 217)) };
  for (const length of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => pw.PdfImage.jpegStream({ ...options, length }), /length/i);
  }
  for (const width of [0, -1, 1.5, Infinity]) assert.throws(() => pw.PdfImage.jpegStream({ ...options, width }), /dimensions/i);
  for (const length of [1, 3]) {
    assert.throws(() => documentWith(pw.PdfImage.jpegStream({ ...options, length })).save(), /wrote 2 bytes; expected/);
  }
  const failure = new Error('source unavailable');
  assert.throws(() => documentWith(pw.PdfImage.jpegStream({ ...options, write: () => { throw failure; } })).save(), error => error === failure);
});

test('large lazy payloads reach a non-materializing destination in bounded chunks', () => {
  // Opaque stress payload: this exercises serialization, not JPEG decoding.
  const chunk = new Uint8Array(1024 * 1024);
  const length = chunk.length * 64;
  let largestWrite = 0;
  let calls = 0;
  const image = pw.PdfImage.jpegStream({ width: 1, height: 1, length,
    write: out => { calls++; for (let i = 0; i < 64; i++) out.putBytes(chunk); }
  });
  const output = new Destination(bytes => { largestWrite = Math.max(largestWrite, bytes.length); });
  documentWith(image).write(output);
  assert.equal(calls, 1);
  assert.equal(largestWrite, chunk.length);
  assert.ok(output.offset > length);
  assert.equal(image.jpeg, null);
});
