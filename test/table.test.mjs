/*
 * js_pdf tests — phase 3.1 tables and text-array helper.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as Pdf from '../src/index.ts';

const latin1 = bytes => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return value;
};

function layoutOnly(widget, constraints = { maxWidth: 200, maxHeight: 500 }) {
  const document = new Pdf.Document();
  const context = {
    document,
    canvas: null,
    pageFormat: { width: constraints.maxWidth, height: constraints.maxHeight },
    pageNumber: 1,
    theme: document.theme
  };
  return widget.layout(context, constraints);
}

test('table constructors are available through every public API surface', () => {
  for (const name of [
    'Table', 'TableRow', 'TableBorder', 'TableHelper', 'IntrinsicColumnWidth',
    'FixedColumnWidth', 'FlexColumnWidth', 'FractionColumnWidth'
  ]) {
    assert.equal(typeof Pdf[name], 'function', `${name} named export`);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `${name} namespace export`);
  }
});

test('fixed and flex columns divide the remaining bounded width', () => {
  const table = new Pdf.Table({
    children: [new Pdf.TableRow({
      children: [
        new Pdf.SizedBox({ width: 10, height: 12 }),
        new Pdf.SizedBox({ width: 20, height: 20 }),
        new Pdf.SizedBox({ width: 30, height: 16 })
      ]
    })],
    columnWidths: {
      0: new Pdf.FixedColumnWidth(40),
      1: new Pdf.FlexColumnWidth(2),
      2: new Pdf.FlexColumnWidth(1)
    }
  });

  const box = layoutOnly(table, { maxWidth: 160, maxHeight: 200 });
  assert.deepEqual(box.data.columnWidths, [40, 80, 40]);
  assert.deepEqual(box.data.rowHeights, [20]);
  assert.equal(box.width, 160);
  assert.equal(box.height, 20);
});

test('intrinsic min-width tables shrink-wrap, and fractional columns use the constraint', () => {
  const intrinsic = new Pdf.Table({
    tableWidth: 'min',
    children: [new Pdf.TableRow({ children: [
      new Pdf.SizedBox({ width: 25, height: 10 }),
      new Pdf.SizedBox({ width: 35, height: 10 })
    ] })]
  });
  assert.deepEqual(layoutOnly(intrinsic).data.columnWidths, [25, 35]);
  assert.equal(layoutOnly(intrinsic).width, 60);

  const fraction = new Pdf.Table({
    tableWidth: 'min',
    columnWidths: { 0: new Pdf.FractionColumnWidth(0.25) },
    children: [new Pdf.TableRow({ children: [new Pdf.SizedBox({ height: 10 })] })]
  });
  assert.equal(layoutOnly(fraction).data.columnWidths[0], 50);
});

test('row vertical alignment positions short cells without mutating their layout boxes', () => {
  const middle = layoutOnly(new Pdf.Table({
    tableWidth: 'min',
    children: [new Pdf.TableRow({
      verticalAlignment: 'middle',
      children: [
        new Pdf.SizedBox({ width: 20, height: 10 }),
        new Pdf.SizedBox({ width: 20, height: 30 })
      ]
    })]
  }));

  assert.equal(middle.data.rows[0].cells[0].y, 10);
  assert.equal(middle.data.rows[0].cells[0].box.height, 10);
  assert.equal(middle.data.rows[0].cells[1].y, 0);

  const full = layoutOnly(new Pdf.Table({
    tableWidth: 'min',
    defaultVerticalAlignment: 'full',
    children: [new Pdf.TableRow({ children: [
      new Pdf.SizedBox({ width: 20, height: 10 }),
      new Pdf.SizedBox({ width: 20, height: 30 })
    ] })]
  }));
  assert.equal(full.data.rows[0].cells[0].height, 30);
});

test('TableHelper marks headers repeatable and applies minimum row heights', () => {
  const table = Pdf.TableHelper.fromTextArray({
    headers: ['Name', 'Value'],
    data: [['Alpha', 10], ['Beta', 20]],
    headerHeight: 30,
    cellHeight: 40,
    cellPadding: 2
  });
  const box = layoutOnly(table, { maxWidth: 240, maxHeight: 500 });

  assert.equal(table.children[0].repeat, true);
  assert.equal(table.children[1].repeat, false);
  assert.deepEqual(box.data.rowHeights, [30, 40, 40]);
  assert.equal(box.height, 110);
});

test('TableHelper uses header/cell themes, formats values and honours alignments', () => {
  const calls = [];
  const table = Pdf.TableHelper.fromTextArray({
    headers: ['Item', 'Amount'],
    data: [['Tea', 3.5]],
    headerFormat: (column, value) => `${column}:${value}`,
    cellFormat: (column, value) => {
      calls.push([column, value]);
      return column === 1 ? `$${value.toFixed(2)}` : String(value);
    },
    cellAlignment: 'centerRight',
    cellAlignments: { 0: 'centerLeft' },
    border: null
  });

  const bytes = Pdf.createPdf({}, () => new Pdf.Page({ margin: 20, build: () => table }));
  const source = latin1(bytes);
  assert.deepEqual(calls, [[0, 'Tea'], [1, 3.5]]);
  assert.match(source, /\(0:Item\) Tj/);
  assert.match(source, /\(1:Amount\) Tj/);
  assert.match(source, /\(Tea\) Tj/);
  assert.match(source, /\(\$3\.50\) Tj/);
  assert.match(source, /\/BaseFont \/Helvetica-Bold/);
  assert.match(source, /\/BaseFont \/Helvetica\b/);
  assert.doesNotMatch(source, /\bre S\b/);
});

test('table decorations and borders paint in widget-space coordinates', () => {
  const table = Pdf.TableHelper.fromTextArray({
    headers: ['A', 'B'],
    data: [['C', 'D']],
    headerDecoration: { color: '#336699' },
    rowDecoration: { color: '#eeeeee' },
    border: Pdf.TableBorder.all({ color: '#ff0000', width: 2 })
  });
  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 10,
    build: () => table
  })));

  assert.match(source, /0\.2 0\.4 0\.6 rg 10 /);
  assert.match(source, /0\.9333 0\.9333 0\.9333 rg 10 /);
  assert.equal((source.match(/1 0 0 RG 2 w [^\n]+ m [^\n]+ l S/g) ?? []).length, 6);
});

test('TableHelper accepts widgets and cell builders without stringifying them', () => {
  let built = 0;
  const table = Pdf.TableHelper.fromTextArray({
    headerCount: 0,
    data: [
      [new Pdf.Text('already a widget'), 'build me']
    ],
    cellBuilder: (_column, value) => {
      built++;
      return new Pdf.Text(String(value).toUpperCase());
    },
    border: null
  });

  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({ build: () => table })));
  assert.equal(built, 1);
  assert.match(source, /\(already a widget\) Tj/);
  assert.match(source, /\(BUILD ME\) Tj/);
});

test('empty and ragged tables have finite layout', () => {
  const empty = layoutOnly(new Pdf.Table());
  assert.deepEqual([empty.width, empty.height], [0, 0]);

  const ragged = layoutOnly(Pdf.TableHelper.fromTextArray({
    headerCount: 0,
    data: [['a'], ['b', 'c', 'd']]
  }));
  assert.equal(ragged.data.columnWidths.length, 3);
  assert.ok(Number.isFinite(ragged.width));
  assert.ok(Number.isFinite(ragged.height));
});

test('invalid numeric and enum inputs fail before reaching PDF operators', () => {
  assert.throws(() => new Pdf.FixedColumnWidth(Number.NaN), /finite number/);
  assert.throws(() => new Pdf.Table({ tableWidth: 'wide' }), /Unknown table width/);
  assert.throws(
    () => Pdf.TableHelper.fromTextArray({ data: [], headerCount: -1 }),
    /headerCount/
  );
  assert.throws(
    () => Pdf.TableHelper.fromTextArray({
      data: [['x']],
      headerCount: 0,
      cellAlignment: 'somewhere'
    }),
    /Unknown table alignment/
  );
});
