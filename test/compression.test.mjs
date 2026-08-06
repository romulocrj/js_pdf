/*
 * js_pdf stream compression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import * as Pdf from '../src/index.ts';
import { latin1 } from './support/pdf-text.mjs';

/** A page with enough operators that compressing it is worth doing. */
function wordyPage(options = {}) {
  return Pdf.createPdf(options, () => new Pdf.Page({
    build: () => new Pdf.Column({
      children: Array.from({ length: 60 }, (_, index) =>
        new Pdf.Text(`Linha ${index} do relatorio de tarefas regulatorias`, { fontSize: 9 }))
    })
  }));
}

test('content streams are deflated by default', () => {
  const bytes = wordyPage();
  const raw = Buffer.from(bytes).toString('latin1');
  assert.match(raw, /\/FlateDecode/, 'expected a compressed stream');
  // The operators are not readable without expanding the stream…
  assert.doesNotMatch(raw, /Linha 42 do relatorio/);
  // …and are exactly what was drawn once it is expanded.
  assert.match(latin1(bytes), /\(Linha 42 do relatorio de tarefas regulatorias\) Tj/);
});

test('compress: false leaves streams readable and declares no filter', () => {
  const bytes = wordyPage({ compress: false });
  const raw = Buffer.from(bytes).toString('latin1');
  assert.doesNotMatch(raw, /\/FlateDecode/);
  assert.match(raw, /\(Linha 42 do relatorio de tarefas regulatorias\) Tj/);
});

test('compression makes a wordy document substantially smaller', () => {
  const compressed = wordyPage().length;
  const plain = wordyPage({ compress: false }).length;
  assert.ok(compressed < plain * 0.7, `${compressed} should be well under ${plain}`);
});

test('every deflated stream in a document decodes back', () => {
  const bytes = wordyPage();
  const raw = Buffer.from(bytes).toString('latin1');

  let cursor = 0;
  let checked = 0;
  for (;;) {
    const marker = raw.indexOf('\nstream\n', cursor);
    if (marker === -1) break;

    const header = raw.slice(raw.lastIndexOf(' obj\n', marker), marker);
    const start = marker + '\nstream\n'.length;
    const length = Number(/\/Length (\d+)/.exec(header)[1]);

    if (header.includes('/FlateDecode')) {
      // Throws on a malformed stream or a bad checksum, which is the assertion.
      inflateSync(Buffer.from(bytes).subarray(start, start + length));
      checked++;
    }
    cursor = start + length;
  }

  assert.ok(checked > 0, 'expected at least one deflated stream to verify');
});

test('a stream that already declares a filter is left alone', () => {
  // A JPEG carries /DCTDecode, so re-deflating it would cost time for nothing.
  const jpeg = readFileSync(new URL('../examples/assets/profile.jpg', import.meta.url));
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.Image(new Pdf.MemoryImage(new Uint8Array(jpeg)), { width: 50 })
  }));
  const raw = Buffer.from(bytes).toString('latin1');
  assert.match(raw, /\/DCTDecode/);
  assert.doesNotMatch(raw, /\/DCTDecode[^>]*\/FlateDecode/);
  // The original JPEG bytes are still in the file verbatim.
  assert.ok(Buffer.from(bytes).includes(jpeg.subarray(0, 64)));
});

test('the XMP metadata packet is never compressed', () => {
  // A conforming reader has to find this by scanning, and PDF/A forbids a
  // filter on it, so it stays plain even with compression on.
  const bytes = Pdf.createPdf(
    { xmpMetadata: '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta/>' },
    () => new Pdf.Page({ build: () => new Pdf.Text('x') })
  );
  const raw = Buffer.from(bytes).toString('latin1');
  assert.match(raw, /\/Type \/Metadata \/Subtype \/XML \/Length \d+ >>\nstream\n<\?xpacket/);
});

test('an image embedded without a dpi is compressed hard', () => {
  const png = readFileSync(new URL('../examples/assets/profile.jpg', import.meta.url));
  assert.ok(png.length > 0);

  const pixels = new Uint8Array(400 * 400 * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 0x2f;
    pixels[index + 1] = 0x7d;
    pixels[index + 2] = 0xa3;
    pixels[index + 3] = 0xff;
  }
  const provider = new Pdf.RawImage({ bytes: pixels, width: 400, height: 400 });

  const compressed = Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.Image(provider, { width: 30, height: 30 })
  }));
  const plain = Pdf.createPdf({ compress: false }, () => new Pdf.Page({
    build: () => new Pdf.Image(provider, { width: 30, height: 30 })
  }));

  assert.ok(plain.length > 400 * 400 * 3, 'uncompressed samples dominate the file');
  assert.ok(
    compressed.length < plain.length / 50,
    `flat colour should collapse: ${compressed.length} vs ${plain.length}`
  );
});

test('an oversized image reports a diagnostic naming the dpi option', () => {
  const messages = [];
  Pdf.setPdfDiagnosticHandler(message => messages.push(message));

  try {
    const width = 2100;
    const height = 2100;
    new Pdf.RawImage({ bytes: new Uint8Array(width * height * 4), width, height });
    assert.equal(messages.length, 0, 'RawImage is caller-supplied pixels, not a decode');

    // A decoded source is where the warning belongs.
    const png = buildFlatPng(2100, 2100);
    new Pdf.MemoryImage(png);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /2100x2100/);
    assert.match(messages[0], /dpi/);
  } finally {
    Pdf.setPdfDiagnosticHandler(null);
  }
});

test('an image given a dpi reports nothing', () => {
  const messages = [];
  Pdf.setPdfDiagnosticHandler(message => messages.push(message));
  try {
    new Pdf.MemoryImage(buildFlatPng(2100, 2100), { dpi: 150 });
    assert.deepEqual(messages, []);
  } finally {
    Pdf.setPdfDiagnosticHandler(null);
  }
});

test('a small image reports nothing', () => {
  const messages = [];
  Pdf.setPdfDiagnosticHandler(message => messages.push(message));
  try {
    new Pdf.MemoryImage(buildFlatPng(64, 64));
    assert.deepEqual(messages, []);
  } finally {
    Pdf.setPdfDiagnosticHandler(null);
  }
});

test('with no handler installed, the warning falls back to the host console', () => {
  Pdf.setPdfDiagnosticHandler(null);
  assert.equal(Pdf.pdfDiagnosticHandler(), null);

  const original = globalThis.console;
  const warned = [];
  globalThis.console = { warn: message => warned.push(message) };
  try {
    new Pdf.MemoryImage(buildFlatPng(2100, 2100));
  } finally {
    globalThis.console = original;
  }

  assert.equal(warned.length, 1);
  assert.match(warned[0], /2100x2100/);
});

test('a host with no console at all is not a host this breaks on', () => {
  // The bare-V8 contract: the reference is optional at every step, so removing
  // the console entirely must not turn a warning into a thrown error.
  Pdf.setPdfDiagnosticHandler(null);

  const original = globalThis.console;
  try {
    delete globalThis.console;
    assert.doesNotThrow(() => new Pdf.MemoryImage(buildFlatPng(2100, 2100)));

    // A console that exists but has no warn is the same story.
    globalThis.console = {};
    assert.doesNotThrow(() => new Pdf.MemoryImage(buildFlatPng(2100, 2100)));
  } finally {
    globalThis.console = original;
  }
});

/** A minimal 8-bit RGB PNG of one flat colour, built with the port's deflate. */
function buildFlatPng(width, height) {
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = 0x40;
      raw[row + 2 + x * 3] = 0x80;
      raw[row + 3 + x * 3] = 0xc0;
    }
  }

  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const chunks = [
    chunk('IHDR', ihdr),
    chunk('IDAT', Pdf.deflateZlib(raw)),
    chunk('IEND', new Uint8Array(0))
  ];

  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const total = chunks.reduce((sum, part) => sum + part.length, signature.length);
  const png = new Uint8Array(total);
  png.set(signature, 0);
  let offset = signature.length;
  for (const part of chunks) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index++) out[4 + index] = type.charCodeAt(index);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
