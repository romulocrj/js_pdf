/*
 * js_pdf JPEG phase 4.2 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Pdf from '../src/index.ts';
import { replaceFrameMarker } from '../examples/jpeg-phase-4.2.mjs';

const PROFILE = new Uint8Array(readFileSync(new URL('../examples/assets/profile.jpg', import.meta.url)));
const PROGRESSIVE = new Uint8Array(Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAVAQEBAAAAAAAAAAAAAAAAAAAFBv/aAAwDAQACEAMQAAABrBDlf//EABcQAAMBAAAAAAAAAAAAAAAAAAECBAP/2gAIAQEAAQUCgzQw/wD/xAAXEQADAQAAAAAAAAAAAAAAAAAAAQMy/9oACAEDAQE/Aa7Z/8QAGBEAAgMAAAAAAAAAAAAAAAAAAAIDM3H/2gAIAQIBAT8BntbT/8QAGhAAAgIDAAAAAAAAAAAAAAAAAQIABBNBYf/aAAgBAQAGPwKsSik411yf/8QAFhABAQEAAAAAAAAAAAAAAAAAASEA/9oACAEBAAE/IWZBlRY3/9oADAMBAAIAAwAAABAL/8QAFxEAAwEAAAAAAAAAAAAAAAAAAAGhsf/aAAgBAwEBPxCl6f/EABcRAAMBAAAAAAAAAAAAAAAAAAABobH/2gAIAQIBAT8Qtaz/xAAXEAEBAQEAAAAAAAAAAAAAAAABEQAh/9oACAEBAAE/EHqSlKbKzrv/2Q==',
  'base64'
));

function segment(marker, payload) {
  const length = payload.length + 2;
  return [0xff, marker, length >>> 8, length & 255, ...payload];
}

function sof(marker, width, height, components) {
  const componentData = [];
  for (let index = 0; index < components; index++) componentData.push(index + 1, 0x11, 0);
  return segment(marker, [
    8, height >>> 8, height & 255, width >>> 8, width & 255,
    components, ...componentData
  ]);
}

function jpeg(...segments) {
  return Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xd9]);
}

test('parseJpeg reads the real profile dimensions and baseline colour model', () => {
  const info = Pdf.parseJpeg(PROFILE);
  assert.deepEqual(info, {
    width: 200,
    height: 200,
    bitsPerComponent: 8,
    components: 3,
    colorSpace: 'rgb',
    inverted: false,
    orientation: 'topLeft'
  });
});

test('parseJpeg recognizes grayscale and CMYK Adobe transforms', () => {
  const gray = Pdf.parseJpeg(jpeg(sof(0xc0, 17, 9, 1)));
  assert.equal(gray.colorSpace, 'gray');
  assert.equal(gray.inverted, false);

  const adobeDirect = segment(0xee, [65, 100, 111, 98, 101, 0, 100, 0, 0, 0, 0, 0]);
  const cmyk = Pdf.parseJpeg(jpeg(
    sof(0xc0, 31, 23, 4),
    // APP14 is deliberately after SOF: legal marker order that upstream stops
    // scanning too early to observe.
    adobeDirect
  ));
  assert.equal(cmyk.colorSpace, 'cmyk');
  assert.equal(cmyk.inverted, false);

  const ycck = Pdf.parseJpeg(jpeg(
    segment(0xee, [65, 100, 111, 98, 101, 0, 100, 0, 0, 0, 0, 2]),
    sof(0xc0, 31, 23, 4)
  ));
  assert.equal(ycck.inverted, true);
});

test('parseJpeg accepts progressive JPEG metadata', () => {
  assert.equal(PROGRESSIVE[158], 0xff, 'fixture must carry a marker at the expected offset');
  assert.equal(PROGRESSIVE[159], 0xc2, 'fixture must carry an SOF2 frame');
  assert.deepEqual(Pdf.parseJpeg(PROGRESSIVE), {
    width: 2,
    height: 2,
    bitsPerComponent: 8,
    components: 3,
    colorSpace: 'rgb',
    inverted: false,
    orientation: 'topLeft'
  });
});

test('parseJpeg accepts extended sequential JPEG metadata', () => {
  assert.deepEqual(Pdf.parseJpeg(jpeg(sof(0xc1, 19, 11, 3))), {
    width: 19,
    height: 11,
    bitsPerComponent: 8,
    components: 3,
    colorSpace: 'rgb',
    inverted: false,
    orientation: 'topLeft'
  });
});

test('EXIF orientation is parsed and swaps the public dimensions', () => {
  const exif = segment(0xe1, [
    0x45, 0x78, 0x69, 0x66, 0, 0,
    0x49, 0x49, 42, 0, 8, 0, 0, 0,
    1, 0,
    0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0,
    0, 0, 0, 0
  ]);
  const bytes = jpeg(exif, sof(0xc0, 17, 9, 3));
  assert.equal(Pdf.parseJpeg(bytes).orientation, 'rightTop');
  const image = Pdf.PdfImage.fromJpeg(bytes);
  assert.deepEqual([image.width, image.height], [9, 17]);
});

test('JPEG dpi decodes and resamples instead of embedding the full source', () => {
  const provider = new Pdf.MemoryImage(PROFILE, { dpi: 72 });
  const image = provider.resolve({ x: 10, y: 10 });
  assert.deepEqual([image.sourceWidth, image.sourceHeight], [10, 10]);
  assert.equal(image.jpeg, null);
  assert.equal(image.channel('rgb').length, 300);
});

test('the phase example replaces only a real JPEG frame marker', () => {
  const source = jpeg(
    segment(0xe1, [0xff, 0xc0]),
    sof(0xc0, 19, 11, 3)
  );
  const extended = replaceFrameMarker(source, 0xc0, 0xc1);

  assert.equal(extended[7], 0xc0, 'marker-shaped APP payload must stay untouched');
  assert.equal(extended[9], 0xc1, 'the actual SOF marker must change');
  assert.equal(Pdf.parseJpeg(extended).width, 19);
});

test('parseJpeg rejects unsupported frames, truncated data and unsupported components', () => {
  assert.throws(() => Pdf.parseJpeg(jpeg(sof(0xc3, 10, 10, 3))), /frame marker/);
  assert.throws(() => Pdf.parseJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 20])), /truncated/i);
  assert.throws(() => Pdf.parseJpeg(jpeg(sof(0xc0, 10, 10, 2))), /component/);
});

test('PdfImage.fromJpeg passes the original bytes through a DCT image XObject', () => {
  const image = Pdf.PdfImage.fromJpeg(PROFILE);
  assert.equal(image.width, 200);
  assert.equal(image.height, 200);
  assert.equal(image.hasAlpha, false);
  const document = new Pdf.Document();
  document.addPage(new Pdf.Page({
    build: () => new Pdf.CustomPaint({
      size: { x: 100, y: 100 },
      painter: canvas => canvas.drawImage(image, 0, 0, 100, 100)
    })
  }));
  const bytes = document.save();
  const source = String.fromCharCode(...bytes);
  assert.match(source, /\/Subtype \/Image \/Width 200 \/Height 200 \/BitsPerComponent 8 \/Intent \/RelativeColorimetric \/Filter \/DCTDecode \/ColorSpace \/DeviceRGB/);
  assert.equal(source.includes('/SMask'), false);

  const start = bytes.findIndex((byte, index) =>
    byte === PROFILE[0] && bytes[index + 1] === PROFILE[1] && bytes[index + 2] === PROFILE[2]
  );
  assert.notEqual(start, -1);
  assert.deepEqual(bytes.slice(start, start + PROFILE.length), PROFILE);
});
