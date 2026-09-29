/*
 * js_pdf synchronous JPEG encoder tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeJpeg } from '../src/pdf/image/jpeg_decoder.ts';
import { parseJpeg } from '../src/pdf/image/jpeg.ts';

for (const [width, height] of [[1, 1], [7, 9], [32, 17]]) {
  test(`quality-90 JPEG round trips RGB blocks and padded edges at ${width}x${height}`, async () => {
    const { encodeJpeg } = await import('../src/pdf/image/jpeg_encoder.ts');
    const rgb = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      rgb[i] = 40 + x * 5; rgb[i + 1] = 50 + y * 7; rgb[i + 2] = 120;
    }
    const snapshot = rgb.slice();
    const encoded = encodeJpeg(rgb, width, height);
    assert.ok(encoded instanceof Uint8Array);
    assert.deepEqual(rgb, snapshot, 'encoder must not mutate input');
    assert.deepEqual(encoded, encodeJpeg(rgb, width, height), 'encoding is deterministic');
    const info = parseJpeg(encoded);
    assert.deepEqual([info.width, info.height, info.colorSpace], [width, height, 'rgb']);
    const decoded = decodeJpeg(encoded);
    let error = 0;
    for (let i = 0; i < rgb.length; i++) error += Math.abs(rgb[i] - decoded.rgb[i]);
    assert.ok(error / rgb.length < 4, `mean absolute error ${error / rgb.length}`);
    assert.deepEqual(encoded.slice(-2), new Uint8Array([255, 217]));
  });
}

test('JPEG rejects invalid dimensions and channel lengths before encoding', async () => {
  const { encodeJpeg } = await import('../src/pdf/image/jpeg_encoder.ts');
  for (const [w, h] of [[0, 1], [1, -1], [1.5, 1], [65536, 1], [1, Infinity]]) {
    assert.throws(() => encodeJpeg(new Uint8Array(3), w, h), /dimensions/);
  }
  assert.throws(() => encodeJpeg(new Uint8Array(2), 1, 1), /RGB/);
});

test('JPEG encodes high-contrast blocks and entropy byte stuffing without corrupting pixels', async () => {
  const { encodeJpeg } = await import('../src/pdf/image/jpeg_encoder.ts');
  const width = 128;
  const rgb = new Uint8Array(width * width * 3);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const value = ((x >> 3) + (y >> 3)) % 2 === 0 ? 0 : 255;
    rgb.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
  }
  const decoded = decodeJpeg(encodeJpeg(rgb, width, width));
  for (let i = 0; i < rgb.length; i++) assert.ok(Math.abs(rgb[i] - decoded.rgb[i]) <= 2);
});

test('JPEG encoding a 2048x2048 RGB raster fits a 64 MB JS heap', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = `
    import { encodeJpeg } from ${JSON.stringify(new URL('../src/pdf/image/jpeg_encoder.ts', import.meta.url).href)};
    import { parseJpeg } from ${JSON.stringify(new URL('../src/pdf/image/jpeg.ts', import.meta.url).href)};
    const pixels = new Uint8Array(2048 * 2048 * 3);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 31 + (i >>> 12)) & 255;
    const encoded = encodeJpeg(pixels, 2048, 2048);
    if (parseJpeg(encoded).width !== 2048 || encoded.length < 100000) throw Error('Invalid JPEG');
  `;
  assert.equal(execFileSync(process.execPath, ['--max-old-space-size=64', '--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 60000 }), '');
});
