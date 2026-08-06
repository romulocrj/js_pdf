/*
 * js_pdf phase 5.1 chart tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as Pdf from '../src/index.ts';

const latin1 = bytes => Buffer.from(bytes).toString('latin1');

const values = [
  new Pdf.PointChartValue(0, 0),
  new Pdf.PointChartValue(1, 50),
  new Pdf.PointChartValue(2, 100)
];

function render(chart, options = {}) {
  return latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    pageFormat: { width: 400, height: 300 },
    build: () => chart,
    ...options
  })));
}

function barChart(extra = {}) {
  return new Pdf.Chart({
    grid: new Pdf.CartesianGrid({
      xAxis: new Pdf.FixedAxis([0, 1, 2]),
      yAxis: new Pdf.FixedAxis([0, 50, 100], { divisions: true })
    }),
    datasets: [
      new Pdf.BarDataSet({ legend: 'Series', color: '#ff0000', width: 10, data: values })
    ],
    ...extra
  });
}

test('a cartesian grid paints its data sets before its axes', () => {
  const source = render(barChart());
  // The axis stroke is black at width 1; the bars are filled red. Upstream
  // paints the axes last so a bar never covers the line it stands on.
  const bar = source.indexOf('1 0 0 rg');
  const axis = source.lastIndexOf('0 0 0 RG\n1 w');
  assert.ok(bar > 0, 'expected a filled bar');
  assert.ok(axis > bar, 'expected the axis stroke after the bars');
});

test('axis labels take the ambient text size, not a hard-coded one', () => {
  const source = render(barChart());
  const sizes = new Set([...source.matchAll(/\/F\d+ ([\d.]+) Tf/g)].map(match => match[1]));
  assert.deepEqual([...sizes], ['12']);
});

test('the grid box leaves room for the labels of both axes', () => {
  const source = render(barChart());
  // The grid clips its data sets to the plotting area, so the clip rectangle is
  // the grid box: it starts past the y labels and above the x labels.
  const [, x, y, width] = source.match(/\n([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re\nW n/) ?? [];

  assert.ok(Number(x) > 0, 'the y axis labels reserve a left gutter');
  assert.ok(Number(y) > 0, 'the x axis labels reserve a bottom gutter');
  assert.equal(Math.round(Number(x) + Number(width)), 400);
});

test('a chart legend paints the decoration it was given', () => {
  const source = render(barChart({
    overlay: new Pdf.ChartLegend({
      position: [-1, 1],
      decoration: { color: '#ffffff', border: { color: '#00ff00', width: 2 } }
    })
  }));

  // `{ color, width }` describes one side, as upstream's Border.all does; a
  // uniform border is emitted as a single stroked rectangle.
  assert.match(source, /0 1 0 RG\n2 w\n[\s\S]*?re\nS/);
  // ...over the legend's own white background.
  assert.match(source, /1 1 1 rg [\d.]+ [\d.]+ [\d.]+ [\d.]+ re f/);
});

test('a legend entry takes its swatch colour from the data set', () => {
  const source = render(barChart({ right: new Pdf.ChartLegend() }));
  assert.match(source, /\(Series\) Tj/);
  assert.match(source, /1 0 0 rg/);
});

test('a pie slice keeps its label inside and picks a readable colour', () => {
  const source = render(new Pdf.Chart({
    grid: new Pdf.PieGrid(),
    datasets: [
      new Pdf.PieDataSet({ legend: 'dark', value: 1, color: '#101010' }),
      new Pdf.PieDataSet({ legend: 'light', value: 1, color: '#f0f0f0' })
    ]
  }));

  // White on the dark slice, black on the light one.
  assert.match(source, /1 1 1 rg[^\n]*\n?[^\n]*\(dark\) Tj/);
  assert.match(source, /0 0 0 rg[^\n]*\n?[^\n]*\(light\) Tj/);
});

test('a pie shrinks until its outside labels fit the grid', () => {
  const wide = new Pdf.Chart({
    grid: new Pdf.PieGrid(),
    datasets: [
      new Pdf.PieDataSet({ legend: 'a very long slice label indeed', value: 1, color: '#ff0000' }),
      new Pdf.PieDataSet({ legend: 'b', value: 40, color: '#00ff00' })
    ]
  });

  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    pageFormat: { width: 200, height: 200 },
    build: () => wide
  })));

  // A slice starts at the centre and runs out to the radius along the vertical.
  const [, cx, cy, , top] = source.match(/\n([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l\n/) ?? [];
  const radius = Number(top) - Number(cy);
  assert.equal(Math.round(Number(cx)), 100);
  assert.ok(radius < 100, `expected the radius to shrink below 100, got ${radius}`);
  assert.ok(radius >= 20, 'the reduction stops at 20');
});

test('FixedAxis.fromStrings labels by index and rejects unsorted values', () => {
  const axis = Pdf.FixedAxis.fromStrings(['a', 'b', 'c']);
  assert.deepEqual([...axis.values], [0, 1, 2]);
  assert.equal(axis.format(1), 'b');
  assert.throws(() => new Pdf.FixedAxis([3, 1]), RangeError);
});

test('a chart outside a Chart parent fails loudly', () => {
  assert.throws(
    () => Pdf.createPdf({}, () => new Pdf.Page({ build: () => new Pdf.ChartLegend() })),
    /inside a Chart/
  );
});
