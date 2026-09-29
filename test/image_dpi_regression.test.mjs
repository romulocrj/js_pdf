/*
 * js_pdf image DPI upstream regression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Pdf from '../src/index.ts';
import { decodeJpeg } from '../src/pdf/image/jpeg_decoder.ts';
import { latin1 } from './support/pdf-text.mjs';

const PROFILE = new Uint8Array(readFileSync(new URL('../examples/assets/profile.jpg', import.meta.url)));
const orientations = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft', 'leftTop', 'rightTop', 'rightBottom', 'leftBottom'];

function raw(orientation = 'topLeft') {
  return new Pdf.RawImage({ bytes: new Uint8Array(40 * 80 * 4).fill(255), width: 40, height: 80, orientation });
}

test('DPI at or above source resolution keeps original JPEG bytes and resource', () => {
  const provider = new Pdf.MemoryImage(PROFILE);
  const original = provider.resolve();
  for (const width of [200, 400, Number.MAX_VALUE]) {
    const image = provider.resolve({ x: width, y: width }, 72);
    assert.ok(image === original, 'must reuse original resource');
    assert.deepEqual(image.jpeg, PROFILE);
  }
});

test('zero or subpixel DPI target keeps the original without poisoning later reductions', () => {
  const provider = new Pdf.MemoryImage(PROFILE);
  for (const width of [0, 0.1]) assert.ok(provider.resolve({ x: width, y: width }, 72) === provider.resolve());
  const small = provider.resolve({ x: 50, y: 50 }, 72);
  assert.equal(small.sourceWidth, 50);
  assert.equal(provider.resolve({ x: 50, y: 50 }, 72), small);
  assert.equal(provider.resolve().sourceWidth, 200);
});

test('downsampling still works after resolving the original or an above-source size', () => {
  const provider = new Pdf.MemoryImage(PROFILE, { dpi: 72 });
  provider.resolve({ x: 400, y: 400 });
  provider.resolve();
  const small = provider.resolve({ x: 37, y: 37 });
  assert.deepEqual([small.sourceWidth, small.sourceHeight], [37, 37]);
  assert.ok(small.jpeg instanceof Uint8Array);
  assert.equal(small.pixels, null);
  assert.deepEqual([decodeJpeg(small.jpeg).width, decodeJpeg(small.jpeg).height], [37, 37]);
});

test('DPI uses display width for all orientations without enlarging stored pixels', () => {
  for (const orientation of orientations) {
    const provider = raw(orientation);
    const original = provider.resolve();
    assert.ok(provider.resolve({ x: provider.width * 2, y: provider.height * 2 }, 72) === original, orientation);
    const half = provider.resolve({ x: provider.width / 2, y: provider.height / 2 }, 72);
    assert.deepEqual([half.sourceWidth, half.sourceHeight], [20, 40], orientation);
    assert.equal(half.orientation, orientation);
    assert.equal(half.width, provider.width / 2);
  }
});

test('unknown source resolution conservatively requests the original', () => {
  class UnknownImage extends Pdf.ImageProvider {
    constructor() { super(0, 80, 'topLeft', null); }
    buildImage(width) { assert.equal(width, undefined); return raw().resolve(); }
  }
  assert.equal(new UnknownImage().resolve({ x: 10, y: 10 }, 72).sourceWidth, 40);
});

test('a reduced JPEG emits DCT, strips source EXIF and retains display orientation', () => {
  // TIFF little-endian orientation 6 plus an identifiable camera metadata payload.
  const exif = new Uint8Array([0xff, 0xe1, 0, 40, 69, 120, 105, 102, 0, 0,
    73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0,
    0, 0, 0, 0, 71, 80, 83, 49, 50, 51]);
  const bytes = new Uint8Array(PROFILE.length + exif.length);
  bytes.set(PROFILE.subarray(0, 2)); bytes.set(exif, 2); bytes.set(PROFILE.subarray(2), 2 + exif.length);
  const provider = new Pdf.MemoryImage(bytes);
  assert.equal(provider.orientation, 'rightTop');
  assert.deepEqual(provider.resolve().jpeg, bytes);
  const reduced = provider.resolve({ x: 50, y: 50 }, 72);
  assert.ok(reduced.jpeg instanceof Uint8Array);
  assert.equal(reduced.orientation, 'rightTop');
  assert.equal(Pdf.parseJpeg(reduced.jpeg).orientation, 'topLeft');
  assert.equal(latin1(reduced.jpeg).includes('Exif'), false);
  assert.equal(latin1(reduced.jpeg).includes('GPS123'), false);
  const document = new Pdf.Document();
  document.addPage(new Pdf.Page({ build: () => new Pdf.Image(provider, { width: 50, height: 50, dpi: 72 }) }));
  const output = latin1(document.save());
  assert.match(output, /\/Width 50 \/Height 50/);
  assert.match(output, /\/Filter \/DCTDecode/);
  assert.equal(output.includes('GPS123'), false);
});

test('invalid placement sizes fail before cache lookup', () => {
  const provider = raw();
  for (const x of [-1, NaN, Infinity]) assert.throws(() => provider.resolve({ x, y: 1 }, 72), /finite and non-negative/);
});

test('integer DPI widths do not lose a pixel to conversion rounding', () => {
  const provider = new Pdf.MemoryImage(PROFILE);
  for (const width of [29, 57, 58, 113]) {
    assert.equal(provider.resolve({ x: width, y: width }, 72).sourceWidth, width);
  }
});

test('baseline, progressive, gray and CMYK JPEGs downsample into valid RGB JPEGs', async () => {
  const { BASELINE, PROGRESSIVE, GRAY, CMYK } = await import('./support/image-dpi-fixtures.mjs');
  for (const bytes of [BASELINE, PROGRESSIVE, GRAY, CMYK]) {
    const provider = new Pdf.MemoryImage(bytes);
    assert.deepEqual(provider.resolve({ x: 80, y: 160 }, 72).jpeg, bytes);
    const reduced = provider.resolve({ x: 20, y: 40 }, 72);
    assert.deepEqual([reduced.sourceWidth, reduced.sourceHeight], [20, 40]);
    assert.equal(reduced.jpegInfo.colorSpace, 'rgb');
    const expected = decodeJpeg(bytes, 20).rgb;
    const actual = decodeJpeg(reduced.jpeg).rgb;
    let error = 0;
    for (let i = 0; i < actual.length; i++) error += Math.abs(actual[i] - expected[i]);
    assert.ok(error / actual.length < 5);
  }
});

test('PNG DPI preserves alpha, avoids upscaling and caches each reduced size', async () => {
  const { PNG } = await import('./support/image-dpi-fixtures.mjs');
  const provider = new Pdf.MemoryImage(PNG);
  assert.ok(provider.resolve({ x: 80, y: 160 }, 72) === provider.resolve());
  const small = provider.resolve({ x: 20, y: 40 }, 72);
  assert.deepEqual([small.sourceWidth, small.sourceHeight], [20, 40]);
  assert.equal(small.jpeg, null);
  assert.equal(small.hasAlpha, true);
  assert.equal(small.channel('alpha').length, 800);
  assert.ok(small.channel('alpha').every(value => value === 128));
  assert.ok(provider.resolve({ x: 20, y: 40 }, 72) === small);
});

test('non-square JPEGs keep each of the eight orientations after DPI reduction', async () => {
  const { BASELINE } = await import('./support/image-dpi-fixtures.mjs');
  for (const orientation of orientations) {
    const provider = new Pdf.MemoryImage(BASELINE, { orientation });
    const image = provider.resolve({ x: provider.width / 2, y: provider.height / 2 }, 72);
    assert.deepEqual([image.sourceWidth, image.sourceHeight], [20, 40], orientation);
    assert.equal(image.orientation, orientation);
    assert.equal(image.width, provider.width / 2);
    assert.deepEqual(provider.resolve({ x: provider.width * 2, y: provider.height * 2 }, 72).jpeg, BASELINE);
  }
});
