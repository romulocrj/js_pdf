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
import { latin1 } from "./support/pdf-text.mjs";


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

test('TableHelper formats values and, with no context, leaves cells unstyled', () => {
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
  // Upstream only reaches for theme.tableHeader/tableCell when handed a
  // context; without one the cells inherit the ambient 12pt regular style.
  assert.doesNotMatch(source, /\/BaseFont \/Helvetica-Bold/);
  assert.match(source, /\/BaseFont \/Helvetica\b/);
  assert.match(source, /\/F\d+ 12 Tf/);
  assert.doesNotMatch(source, /\bre S\b/);
});

test('TableHelper applies the table theme when it is given a context', () => {
  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 20,
    build: context => Pdf.TableHelper.fromTextArray({
      context,
      headers: ['Item'],
      data: [['Tea']],
      border: null
    })
  })));

  assert.match(source, /\/BaseFont \/Helvetica-Bold/);
  assert.match(source, /\/F\d+ 9\.6 Tf/);
});

test('a right-aligned cell places its text at the column edge', () => {
  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => Pdf.TableHelper.fromTextArray({
      headerCount: 0,
      data: [['x', 'y']],
      cellAlignment: 'centerRight',
      border: null
    })
  })));

  // The first column is half of an unmargined A4, so a right-aligned glyph
  // lands near 297.64 rather than on the cell's left padding.
  const [, first] = source.match(/1 0 0 1 ([\d.]+) [\d.]+ Tm \(x\) Tj/) ?? [];
  assert.ok(Number(first) > 250, `expected the cell text near the right edge, got ${first}`);
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

test('a spanning table returns immutable continuation state and repeats headers', () => {
  const table = Pdf.TableHelper.fromTextArray({
    headers: ['HEADER'],
    data: [['one'], ['two'], ['three']],
    headerHeight: 30,
    cellHeight: 30,
    border: null
  });
  assert.ok(table instanceof Pdf.SpanningWidget);

  const document = new Pdf.Document();
  const context = {
    document,
    canvas: null,
    pageFormat: { width: 200, height: 200 },
    pageNumber: 1,
    theme: document.theme
  };
  const initial = table.initialSpanState();
  const first = table.layoutSpan(context, { maxWidth: 200, maxHeight: 70 }, initial);
  const replay = table.layoutSpan(context, { maxWidth: 200, maxHeight: 70 }, initial);

  assert.deepEqual(initial, { nextRow: 0 });
  assert.deepEqual(first.nextState, replay.nextState);
  assert.deepEqual(first.box.data.rowHeights, [30, 30]);
  assert.equal(first.hasMore, true);

  const second = table.layoutSpan(
    context,
    { maxWidth: 200, maxHeight: 70 },
    first.nextState
  );
  assert.deepEqual(second.box.data.rowHeights, [30, 30]);
  assert.equal(second.box.data.rows[0].row.repeat, true);
  assert.equal(second.hasMore, true);
});

test('MultiPage splits a long table and paints its header on every fragment', () => {
  const data = Array.from({ length: 60 }, (_, index) => [`R${String(index + 1).padStart(2, '0')}`]);
  const bytes = Pdf.createPdf({}, () => new Pdf.MultiPage({
    margin: 40,
    gap: 0,
    header: () => new Pdf.Text('PAGE HEADER'),
    footer: () => new Pdf.Text('PAGE FOOTER'),
    build: () => [Pdf.TableHelper.fromTextArray({
      headers: ['REPEATED HEADER'],
      data,
      headerHeight: 30,
      cellHeight: 30,
      border: null
    })]
  }));
  const source = latin1(bytes);
  const pages = (source.match(/\/Type \/Page\b/g) ?? []).length;

  assert.ok(pages >= 3);
  assert.equal((source.match(/\(REPEATED HEADER\) Tj/g) ?? []).length, pages);
  assert.equal((source.match(/\(PAGE HEADER\) Tj/g) ?? []).length, pages);
  assert.equal((source.match(/\(PAGE FOOTER\) Tj/g) ?? []).length, pages);
  for (const [index] of data.entries()) {
    const label = `R${String(index + 1).padStart(2, '0')}`;
    assert.equal((source.match(new RegExp(`\\(${label}\\) Tj`, 'g')) ?? []).length, 1, label);
  }
});

test('MultiPage bounds a spanning widget that cannot finish within maxPages', () => {
  assert.throws(
    () => Pdf.createPdf({}, () => new Pdf.MultiPage({
      margin: 40,
      maxPages: 1,
      build: () => [Pdf.TableHelper.fromTextArray({
        headerCount: 0,
        data: Array.from({ length: 100 }, (_, index) => [String(index)]),
        cellHeight: 30
      })]
    })),
    /page limit/
  );
});

test('an indivisible table row taller than a full page still fails clearly', () => {
  assert.throws(
    () => Pdf.createPdf({}, () => new Pdf.MultiPage({
      margin: 40,
      build: () => [Pdf.TableHelper.fromTextArray({
        headerCount: 0,
        data: [['too tall']],
        cellHeight: 2000
      })]
    })),
    /full MultiPage content area/
  );
});
