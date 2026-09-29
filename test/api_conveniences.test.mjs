/*
 * js_pdf phase 6.12 API compatibility tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as pw from '../src/index.ts';
import { PdfDict } from '../src/pdf/format/dict.ts';
import { PdfArray } from '../src/pdf/format/array.ts';
import { PdfNum } from '../src/pdf/format/num.ts';
import { PdfName } from '../src/pdf/format/name.ts';
import { PdfIndirect } from '../src/pdf/format/indirect.ts';

test('DefaultTextStyle.merge resolves inherited values at layout and paint without leaking', () => {
  const seen = [];
  const child = new pw.Builder({ builder: ctx => { seen.push(ctx.theme); return new pw.Text('Merged'); } });
  const merged = pw.DefaultTextStyle.merge({ style: new pw.TextStyle({ fontSize: 18 }), child });
  const doc = new pw.Document();
  const parent = pw.ThemeData.create({ defaultTextStyle: new pw.TextStyle({ color: '#123456', fontSize: 10 }), textAlign: 'right', softWrap: false, maxLines: 3 });
  doc.addPage(new pw.Page({ build: () => new pw.Theme({ data: parent, child: merged }) }));
  doc.save();
  assert.ok(seen.length > 0);
  for (const theme of seen) {
    assert.equal(theme.defaultTextStyle.fontSize, 18); assert.deepEqual(theme.defaultTextStyle.color, parent.defaultTextStyle.color);
    assert.equal(theme.textAlign, 'right'); assert.equal(theme.softWrap, false); assert.equal(theme.maxLines, 3);
  }
  assert.equal(parent.defaultTextStyle.fontSize, 10);
});

test('PdfPageFormat is a compatible value with units, presets and transformations', () => {
  const f = new pw.PdfPageFormat(100, 200, { marginAll: 10, marginLeft: 20 });
  assert.equal(f.availableWidth, 80); assert.equal(f.availableHeight, 180);
  assert.equal(f.marginLeft, 10, 'upstream marginAll overrides individual margins');
  assert.throws(() => new pw.PdfPageFormat(0, 100), RangeError);
  assert.throws(() => new pw.PdfPageFormat(NaN, 100), RangeError);
  assert.equal(f.hashCode, f.copyWith({}).hashCode);
  assert.deepEqual(f.dimension, { x: 100, y: 200 });
  assert.equal(f.landscape.width, 200); assert.equal(f.portrait, f);
  assert.equal(f.applyMargin({ left: 1, top: 30, right: 4, bottom: 0 }).marginTop, 30);
  assert.equal(f.copyWith({ width: 300 }).width, 300); assert.ok(f.equals(f.copyWith({})));
  assert.equal(f.copyWith({ marginLeft: undefined }).marginLeft, f.marginLeft);
  assert.equal(pw.PdfPageFormat.a4.width, pw.PageFormat.A4.width);
  assert.equal(pw.PdfPageFormat.cm, pw.PageUnit.cm);
});

test('chart compatibility names work on every public surface', () => {
  const point = new pw.LineChartValue(1, 2);
  assert.ok(point instanceof pw.PointChartValue); assert.ok(point instanceof pw.ChartValue);
  assert.deepEqual(point.point, { x: 1, y: 2 });
  for (const name of ['PdfPageFormat', 'ChartValue', 'LineChartValue']) assert.equal(pw.js_pdf[name], pw[name]);
});

test('PdfDict.merge recursively merges dictionaries and deduplicates scalar/reference arrays', () => {
  const nested = new PdfDict([['/A', new PdfNum(1)]]);
  const left = new PdfDict([['/N', nested], ['/List', new PdfArray([new PdfName('/A'), new PdfIndirect(3,0)])]]);
  const right = new PdfDict([['/N', new PdfDict([['/B', new PdfNum(2)]])], ['/List', new PdfArray([new PdfName('/A'), new PdfIndirect(3,0), new PdfNum(4)])]]);
  left.merge(right); assert.equal(nested.get('/B').value, 2); assert.equal(left.get('/List').length, 3);
  assert.equal(right.get('/List').length, 3);
});
