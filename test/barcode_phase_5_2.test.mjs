/*
 * js_pdf barcode phase 5.2 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as Pdf from '../src/index.ts';
import { Barcode2DMatrix } from '../src/barcode/barcode_2d.ts';
import { BarcodePDF417 } from '../src/barcode/pdf417.ts';
import { BarcodeQR } from '../src/barcode/qrcode.ts';

const latin1 = bytes => Buffer.from(bytes).toString('latin1');

function fnv1a(bits) {
  let hash = 2166136261;
  for (const bit of bits) hash = Math.imul(hash ^ (bit ? 49 : 48), 16777619) >>> 0;
  return hash.toString(16);
}

test('phase 5.2 barcode APIs are named, namespaced and callback-visible', () => {
  for (const name of ['Barcode', 'BarcodeWidget', 'BarcodeQRCorrectionLevel', 'Pdf417SecurityLevel']) {
    assert.notEqual(Pdf[name], undefined, name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }

  const bytes = Pdf.createPdf({}, api => new api.Page({
    margin: 0,
    pageFormat: { width: 80, height: 80 },
    build: () => new api.BarcodeWidget({
      barcode: api.Barcode.qrCode(),
      data: 'A',
      width: 80,
      height: 80,
      drawText: false
    })
  }));
  assert.match(latin1(bytes), / re f/);
});

test('the independent QR encoder matches a version-1 byte-mode reference symbol', () => {
  const matrix = new BarcodeQR(null, Pdf.BarcodeQRCorrectionLevel.low)
    .convert(Uint8Array.of(0x41));
  assert.deepEqual([matrix.width, matrix.height, matrix.ratio], [21, 21, 1]);
  assert.equal(fnv1a(matrix.pixels), 'b4ef43a1');
});

test('QR version selection and explicit-capacity errors use UTF-8 bytes', () => {
  const automatic = Pdf.Barcode.qrCode();
  assert.equal(automatic.isValid('Parnella Charlesbois'), true);
  assert.equal(automatic.isValid('Olá, 世界'), true);

  const forced = new BarcodeQR(1, Pdf.BarcodeQRCorrectionLevel.high);
  assert.throws(
    () => forced.convert(new Uint8Array(20)),
    /Unable to fit 20 bytes in QR version 1/
  );
});

test('PDF417 emits a rectangular module matrix for the invoice payload', () => {
  const matrix = new BarcodePDF417(Pdf.Pdf417SecurityLevel.level2, 2, 3)
    .convert(Uint8Array.from(Buffer.from('Invoice# 982347')));
  assert.ok(matrix.width > matrix.height);
  assert.equal(matrix.ratio, 2);
  assert.equal(matrix.pixels.length, matrix.width * matrix.height);
  assert.ok(matrix.pixels.some(Boolean));
  assert.ok(matrix.pixels.some(value => !value));
});

test('every exposed barcode factory produces drawing operations', () => {
  const cases = [
    [Pdf.Barcode.code39(), 'HELLO'],
    [Pdf.Barcode.code93(), 'HELLO'],
    [Pdf.Barcode.code128(), 'Hello123'],
    [Pdf.Barcode.gs128(), '(420)22345'],
    [Pdf.Barcode.itf(), '1234'],
    [Pdf.Barcode.itf14(), '1234567890123'],
    [Pdf.Barcode.itf16(), '123456789012345'],
    [Pdf.Barcode.ean13(), '123456789012'],
    [Pdf.Barcode.ean8(), '1234567'],
    [Pdf.Barcode.ean5(), '12345'],
    [Pdf.Barcode.ean2(), '12'],
    [Pdf.Barcode.isbn(), '978316148410'],
    [Pdf.Barcode.upcA(), '12345678901'],
    [Pdf.Barcode.upcE({ fallback: true }), '12345678901'],
    [Pdf.Barcode.telepen(), 'Hello'],
    [Pdf.Barcode.codabar(), '1234'],
    [Pdf.Barcode.rm4scc(), 'SN34RD1A'],
    [Pdf.Barcode.postnet(), '55555-1237']
  ];
  for (const [barcode, data] of cases) {
    assert.ok(
      barcode.make(data, { width: 200, height: 80, drawText: false }).length > 0,
      barcode.name
    );
  }
});

test('Barcode2DMatrix.fromXY indexes non-square matrices row-major', () => {
  const matrix = Barcode2DMatrix.fromXY(3, 2, 1, (x, y) => x === 2 || y === 1);
  assert.deepEqual(matrix.pixels, [false, false, true, true, true, true]);
});

test('BarcodeWidget keeps generated operations in immutable layout data', () => {
  const document = new Pdf.Document();
  const context = {
    document,
    canvas: null,
    pageFormat: { width: 100, height: 100 },
    pageNumber: 1,
    theme: document.theme
  };
  const widget = new Pdf.BarcodeWidget({
    barcode: Pdf.Barcode.pdf417(),
    data: 'Invoice# 982347',
    width: 100,
    height: 20,
    drawText: false
  });
  const first = widget.layout(context, { maxWidth: 200, maxHeight: 200 });
  const second = widget.layout(context, { maxWidth: 200, maxHeight: 200 });
  const firstElements = first.data.childBox.data.childBox.data.elements;
  const secondElements = second.data.childBox.data.childBox.data.elements;
  assert.deepEqual([first.width, first.height], [100, 20]);
  assert.equal(firstElements.length, secondElements.length);
  assert.notEqual(firstElements, secondElements);
});
