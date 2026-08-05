/*
 * js_pdf image widget/provider phase 4.3 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Pdf from '../src/index.ts';

const PROFILE = new Uint8Array(readFileSync(new URL('../examples/assets/profile.jpg', import.meta.url)));

function rgba(width, height, orientation = 'topLeft') {
  const bytes = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    bytes[index * 4] = index * 31;
    bytes[index * 4 + 1] = 120;
    bytes[index * 4 + 2] = 240 - index * 17;
    bytes[index * 4 + 3] = 255;
  }
  return new Pdf.RawImage({ bytes, width, height, orientation });
}

test('phase 4.3 image APIs are named, namespaced and callback-visible', () => {
  for (const name of ['ImageProvider', 'ImageProxy', 'MemoryImage', 'RawImage', 'Image']) {
    assert.equal(typeof Pdf[name], 'function', name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }
  const bytes = Pdf.createPdf({}, api => new api.Page({
    build: () => new api.Image(new api.MemoryImage(PROFILE), { width: 40, height: 40 })
  }));
  assert.match(String.fromCharCode(...bytes), /\/DCTDecode/);
});

test('MemoryImage detects JPEG dimensions and rejects unknown bytes', () => {
  const provider = new Pdf.MemoryImage(PROFILE);
  assert.equal(provider.width, 200);
  assert.equal(provider.height, 200);
  assert.equal(provider.resolve().jpegInfo.colorSpace, 'rgb');
  assert.throws(() => new Pdf.MemoryImage(Uint8Array.from([1, 2, 3])), /image type/i);
});

test('RawImage and ImageProxy preserve orientation-aware dimensions', () => {
  const raw = rgba(3, 2, 'rightTop');
  assert.deepEqual([raw.width, raw.height], [2, 3]);
  const proxy = new Pdf.ImageProxy(raw.resolve());
  assert.deepEqual([proxy.width, proxy.height], [2, 3]);
});

test('Image layout exposes immutable BoxFit crop and destination geometry', () => {
  const document = new Pdf.Document();
  const context = {
    document,
    canvas: null,
    pageFormat: { width: 300, height: 300 },
    pageNumber: 1,
    theme: document.theme
  };
  const widget = new Pdf.Image(rgba(2, 1), {
    width: 50,
    height: 50,
    fit: 'cover',
    alignment: 'centerRight'
  });
  const first = widget.layout(context, { maxWidth: 100, maxHeight: 100 });
  const second = widget.layout(context, { maxWidth: 100, maxHeight: 100 });
  assert.deepEqual([first.width, first.height], [50, 50]);
  assert.deepEqual(first.data, {
    image: rawImage(first.data.image),
    source: { width: 1, height: 1 },
    destination: { width: 50, height: 50 },
    sourceX: 1,
    sourceY: 0,
    destinationX: 0,
    destinationY: 0
  });
  assert.deepEqual(second.data, first.data);
});

function rawImage(image) {
  return image;
}

test('Image paint clips a cover crop and draws the full resource behind it', () => {
  const provider = rgba(2, 1);
  const document = new Pdf.Document();
  document.addPage(new Pdf.Page({
    margin: 0,
    build: () => new Pdf.Image(provider, {
      width: 50,
      height: 50,
      fit: 'cover',
      alignment: 'centerRight'
    })
  }));
  const source = String.fromCharCode(...document.save());
  assert.match(source, /0 [\d.]+ 50 50 re\nW n/);
  assert.match(source, /100 0 0 50 -50 [\d.]+ cm\n\/I1 Do/);
  assert.match(source, /\/SMask \d+ 0 R/);
  assert.equal((source.match(/\/Subtype \/Image/g) ?? []).length, 2);
});

test('the same provider reused on one page registers one image resource', () => {
  const provider = rgba(1, 1);
  const source = String.fromCharCode(...Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.Row({
      children: [
        new Pdf.Image(provider, { width: 20, height: 20 }),
        new Pdf.Image(provider, { width: 20, height: 20 })
      ]
    })
  })));
  assert.match(source, /\/XObject << \/I1 \d+ 0 R >>/);
  assert.equal((source.match(/\/Subtype \/Image/g) ?? []).length, 2);
  assert.equal((source.match(/\/I1 Do/g) ?? []).length, 2);
});
