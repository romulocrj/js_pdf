/*
 * js_pdf color value and painting regression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as pw from '../src/index.ts';
import { normalizeColor, colorOperator } from '../src/pdf/color.ts';
import { PdfArray } from '../src/pdf/format/array.ts';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const rgb = (color, expected) => normalizeColor(color).forEach((v, i) => near(v, expected[i]));

test('color factories, unsigned ARGB, immutable copies, flatten and equality', () => {
  const c = pw.PdfColor.fromHex('#3698ab80');
  assert.equal(c.toInt(), 0x803698ab);
  assert.equal(c.toHex(), '#3698ab80');
  assert.equal(pw.PdfColor.fromInt(0xff123456).toInt(), 0xff123456);
  assert.equal(pw.PdfColor.fromHex('abc').toHex(), '#aabbccff');
  assert.equal(c.withValues(null, 1, null, 0).toHex(), '#ff980080');
  assert.equal(c.withAlpha(1).alpha, 1);
  assert.equal(c.withRed(0).red, 0);
  assert.equal(c.withGreen(0).green, 0);
  assert.equal(c.withBlue(0).blue, 0);
  assert.ok(c.equals(pw.PdfColor.fromInt(c.toInt())));
  assert.equal(c.equals(new pw.PdfColorGrey(c.red)), false);
  rgb(new pw.PdfColor(1, 0, 0, 0.5).flatten(), [1, 0.5, 0.5]);
  assert.equal(c.alpha, 128 / 255);
  assert.throws(() => new pw.PdfColor(NaN, 0, 0), RangeError);
  assert.throws(() => new pw.PdfColor(2, 0, 0), RangeError);
  for (const value of ['#abcd', '#12345g', '#123456789']) assert.throws(() => pw.PdfColor.fromHex(value));
});

test('CMYK conversion handles black and a blue maximum when red exceeds green', () => {
  for (const values of [[0,0,0], [1,1,1], [0.5,0.2,0.8], [0,1,1], [0.1,0.7,0.2]]) {
    const color = pw.PdfColorCmyk.fromRgb(...values, 0.4);
    near(color.black, 1 - Math.max(...values));
    for (const v of [color.cyan, color.magenta, color.yellow, color.black]) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
    rgb(color, values);
    assert.equal(color.alpha, 0.4);
    assert.equal(color.toCmyk(), color);
  }
  rgb(new pw.PdfColorCmyk(1, 0, 0, 0.2), [0, 0.8, 0.8]);
});

test('HSV and HSL convert all sectors, grayscale endpoints and fractional RGB', () => {
  for (const values of [[0,0,0], [1,1,1], [0.5,0.5,0.5], [1,0,0], [1,1,0], [0,1,0], [0,1,1], [0,0,1], [1,0,1], [0.1,0.2,0.7]]) {
    const c = new pw.PdfColor(...values, 0.3);
    for (const converted of [c.toHsv(), c.toHsl()]) {
      assert.ok(Number.isFinite(converted.hue) && Number.isFinite(converted.saturation));
      rgb(converted, values);
      const rebuilt = converted instanceof pw.PdfColorHsv
        ? new pw.PdfColorHsv(converted.hue, converted.saturation, converted.value, converted.alpha)
        : new pw.PdfColorHsl(converted.hue, converted.saturation, converted.lightness, converted.alpha);
      rgb(rebuilt, values);
      assert.equal(rebuilt.alpha, 0.3);
    }
  }
  assert.throws(() => new pw.PdfColorHsv(360, 1, 1), RangeError);
  assert.throws(() => new pw.PdfColorHsl(-1, 1, 0.5), RangeError);
  rgb(new pw.PdfColorHsv(0, 1, 1).withHue(120), [0,1,0]);
  rgb(new pw.PdfColorHsl(0, 1, 0.5).withLightness(0), [0,0,0]);
});

test('RYB corners, upstream luminance threshold and harmony offsets are retained', () => {
  rgb(pw.PdfColor.fromRYB(0,0,0), [1,1,1]);
  rgb(pw.PdfColor.fromRYB(1,1,0), [1,0.5,0]);
  rgb(pw.PdfColor.fromRYB(0,0,1), [0.163,0.373,0.6]);
  const c = new pw.PdfColorHsv(0,1,1,0.5);
  assert.equal(c.complementary.hue, 240);
  assert.deepEqual(c.triadic.map(v => v.hue), [80,240]);
  assert.deepEqual(c.splitcomplementary.map(v => v.hue), [210,180]);
  assert.deepEqual(c.tetradic.map(v => v.hue), [120,210,60]);
  assert.deepEqual(c.analagous.map(v => v.hue), [30,340]);
  assert.equal(c.monochromatic.length, 3);
  assert.equal(c.monochromatic[0].alpha, 1);
  near(new pw.PdfColor(1,1,1).luminance, 1);
  assert.equal(new pw.PdfColor(1,1,1).isDark, true);
  assert.equal(new pw.PdfColor(0,0,0).isLight, true);
  rgb(new pw.PdfColor(1,0,0).shade(0.5), [1,0,0]);
});

test('named Material palette, aliases and deterministic generated colors', () => {
  assert.equal(pw.PdfColors.red, pw.PdfColors.red500);
  assert.equal(pw.PdfColors.blue.toHex(), '#2196f3ff');
  assert.equal(pw.PdfColors.deepOrangeAccent, pw.PdfColors.deepOrangeAccent200);
  assert.equal(pw.PdfColors.primaries.length, 19);
  assert.equal(pw.PdfColors.accents.length, 16);
  assert.equal(pw.PdfColors.getColor(0).toHex(), '#ff0000ff');
  assert.equal(pw.PdfColors.getColor(7).toHex(), pw.PdfColors.getColor(7).toHex());
  assert.ok(Object.isFrozen(pw.PdfColors.primaries));
});

test('DeviceGray and CMYK fill/stroke operators and color arrays preserve components', () => {
  const grey = new pw.PdfColorGrey(0.25), cmyk = new pw.PdfColorCmyk(0.1,0.2,0.3,0.4);
  assert.equal(colorOperator(grey), '0.25 g');
  assert.equal(colorOperator(grey, true), '0.25 G');
  assert.equal(colorOperator(cmyk), '0.1 0.2 0.3 0.4 k');
  assert.equal(colorOperator(cmyk, true), '0.1 0.2 0.3 0.4 K');
  assert.equal(colorOperator('#123456'), '0.0706 0.2039 0.3373 rg');
  for (const [color, expected] of [[grey,'[0.25]'],[cmyk,'[0.1 0.2 0.3 0.4]']]) {
    const stream = new pw.PdfStream(); PdfArray.fromColor(color).output(stream);
    assert.equal(Buffer.from(stream.output()).toString(), expected);
  }
});

test('text, decoration, borders and legacy container paints retain CMYK and gray', () => {
  const c = new pw.PdfColorCmyk(1,0,0,0), g = new pw.PdfColorGrey(0.3);
  const doc = new pw.Document({ compress: false });
  doc.addPage(new pw.Page({ build: () => new pw.Container({ background: c, borderColor: g, borderWidth: 1,
    child: new pw.Container({ decoration: new pw.BoxDecoration({ color: c, border: pw.Border.all({ color: g }) }),
      child: new pw.Text('Color', { style: new pw.TextStyle({ color: c }) }) }) }) }));
  const pdf = Buffer.from(doc.save()).toString('latin1');
  assert.match(pdf, /1 0 0 0 k/); assert.match(pdf, /0\.3 G/);
  assert.ok((pdf.match(/1 0 0 0 k/g) ?? []).length >= 3);
  assert.equal(new pw.BorderSide({ color: c }).equals(new pw.BorderSide({ color: [0,1,1] })), false);
});

test('solid color storage across widget families preserves explicit color spaces', () => {
  const color = new pw.PdfColorCmyk(0.1,0.2,0.3,0.4);
  const cases = [
    [new pw.Divider({ color }), 'color'], [new pw.VerticalDivider({ color }), 'color'],
    [new pw.Placeholder({ color }), 'color'], [new pw.PdfLogo({ color }), 'color'],
    [new pw.IconThemeData({ color }), 'color'], [new pw.Bullet({ text: 'item', bulletColor: color }), 'bulletColor'],
    [new pw.BarDataSet({ color, data: [] }), 'surfaceColor'],
    [new pw.LineDataSet({ lineColor: color, data: [] }), 'lineColor'],
    [new pw.Checkbox({ value: true, activeColor: color }), 'activeColor'],
    [new pw.FlatButton({ text: 'button', color }), 'color']
  ];
  for (const [widget, field] of cases) assert.equal(widget[field], color, widget.constructor.name);
});

test('charts distinguish different device spaces with equal RGB previews', () => {
  const color = new pw.PdfColorCmyk(1,0,0,0);
  assert.equal(new pw.BarDataSet({ color, borderColor: [0,1,1], data: [] }).drawBorder, true);
  assert.equal(new pw.PieDataSet({ color, borderColor: [0,1,1], value: 1 }).drawBorder, true);
});

test('color constructors are exposed through the namespace and createPdf API', () => {
  for (const name of ['PdfColor','PdfColorGrey','PdfColorCmyk','PdfColorHsv','PdfColorHsl','PdfColors']) {
    assert.equal(pw.js_pdf[name], pw[name], name);
  }
  pw.createPdf({}, api => new api.Page({ build: () => new api.Text('Palette', { style: new api.TextStyle({ color: api.PdfColors.blue }) }) }));
});

test('form and geometric annotation arrays retain CMYK and gray component counts', () => {
  const c = new pw.PdfColorCmyk(1,0,0,0), g = new pw.PdfColorGrey(0.3);
  const doc = new pw.Document({ compress: false });
  doc.addPage(new pw.Page({ build: () => new pw.Column({ children: [
    new pw.TextField({ name: 'color', value: 'CMYK', color: g, backgroundColor: c, textStyle: new pw.TextStyle({ color: c }) }),
    new pw.SquareAnnotation({ color: c, interiorColor: g, child: new pw.SizedBox({ width: 20, height: 20 }) })
  ] }) }));
  const pdf = Buffer.from(doc.save()).toString('latin1');
  assert.match(pdf, /\/BC \[0\.3\]/); assert.match(pdf, /\/BG \[1 0 0 0\]/);
  assert.match(pdf, /\/C \[1 0 0 0\]/); assert.match(pdf, /\/IC \[0\.3\]/);
  assert.match(pdf, /\/DA \([^\n]*1 0 0 0 k\)/);
});

test('vector text retains its CMYK operator', () => {
  const doc = new pw.Document({ compress: false });
  doc.addPage(new pw.Page({ build: () => new pw.Vector({ width: 100, height: 40, draw: api => {
    api.text({ x: 0, y: 0, value: 'CMYK vector', color: new pw.PdfColorCmyk(1,0,0,0) });
  } }) }));
  assert.match(Buffer.from(doc.save()).toString('latin1'), /1 0 0 0 k/);
});

test('black progress shading stays finite through the public color conversion', () => {
  const doc = new pw.Document({ compress: false });
  doc.addPage(new pw.Page({ build: () => new pw.LinearProgressIndicator({ value: 0.5, valueColor: new pw.PdfColor(0,0,0) }) }));
  assert.doesNotMatch(Buffer.from(doc.save()).toString('latin1'), /NaN|Infinity/);
  assert.equal(new pw.PdfColor(0,0,0).toHsl().saturation, 0);
});
