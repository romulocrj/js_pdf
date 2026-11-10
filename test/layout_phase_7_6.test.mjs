/*
 * js_pdf tests — phase 7.6 widget layout and table fixes.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import * as Pdf from '../src/index.ts';
import { latin1 } from './support/pdf-text.mjs';

function context(width = 200, height = 500) {
  const document = new Pdf.Document();
  return {
    document,
    canvas: null,
    pageFormat: { width, height },
    pageNumber: 1,
    theme: document.theme
  };
}

function normalize(bytes) {
  return Buffer.from(bytes).toString('latin1')
    .replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20260929000000Z)');
}

function render(build, { page = {} } = {}) {
  const document = new Pdf.Document({ compress: false });
  document.addPage(new Pdf.Page({ ...page, build }));
  return latin1(document.save());
}

function counting() {
  let count = 0;
  class CountingText extends Pdf.Text {
    layout(ctx, constraints) {
      count++;
      return super.layout(ctx, constraints);
    }
  }
  return { CountingText, count: () => count };
}

/*
 * A document of multi-page tables whose columns all fit: fixed, flex and
 * intrinsic tracks, a repeated header, wrapped cells, row decorations, and a
 * first fragment that starts part-way down the page. Its SHA-256 was recorded
 * from the implementation before the L102 change, so any layout difference the
 * width cache or the early row cut-off introduced shows up as a new digest.
 */
function multiPageTables() {
  const document = new Pdf.Document({ compress: false });
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
  const sentence = index => Array.from(
    { length: 3 + (index % 7) },
    (_, word) => words[(index + word) % words.length]
  ).join(' ');
  document.addPage(new Pdf.MultiPage({
    margin: 36,
    header: () => new Pdf.Text('L102 golden'),
    footer: ctx => new Pdf.Text(`page ${ctx.pageNumber}`),
    maxPages: 40,
    build: () => [
      new Pdf.Text('A paragraph before the first table so its first fragment starts below the top.'),
      new Pdf.Table({
        border: Pdf.TableBorder.all({ width: 0.5 }),
        columnWidths: {
          0: new Pdf.FixedColumnWidth(36),
          1: new Pdf.FlexColumnWidth(2),
          2: new Pdf.IntrinsicColumnWidth(),
          3: new Pdf.FlexColumnWidth(1)
        },
        children: [
          new Pdf.TableRow({
            repeat: true,
            decoration: { color: '#dddddd' },
            children: ['#', 'Description', 'Code', 'Notes'].map(value => new Pdf.Text(value))
          }),
          ...Array.from({ length: 140 }, (_, index) => new Pdf.TableRow({
            decoration: index % 2 === 0 ? null : { color: '#f4f4f4' },
            verticalAlignment: index % 3 === 0 ? 'middle' : null,
            children: [
              new Pdf.Text(String(index + 1)),
              new Pdf.Text(sentence(index)),
              new Pdf.Text(`C-${index % 13}`),
              new Pdf.Text(index % 5 === 0 ? sentence(index + 3) : '-')
            ]
          }))
        ]
      }),
      new Pdf.Table({
        border: Pdf.TableBorder.symmetric({ outside: { width: 1 }, inside: { width: 0.25 } }),
        children: Array.from({ length: 90 }, (_, index) => new Pdf.TableRow({
          repeat: index < 2,
          children: [
            new Pdf.Text(`r${index}`),
            new Pdf.Text(words[index % words.length]),
            new Pdf.Text(String(index * 17))
          ]
        }))
      })
    ]
  }));
  return document.save();
}

const MULTI_PAGE_TABLES_SHA256 = 'a38ae92be7fcbdd8b268bc0027115f0db99250d47de5654e90810199723d4963';

test('L102: multi-page tables are byte-identical to the pre-cache output', () => {
  const digest = createHash('sha256').update(normalize(multiPageTables()), 'latin1').digest('hex');
  assert.equal(digest, MULTI_PAGE_TABLES_SHA256);
});

test('L102: a MultiPage table lays each cell out a bounded number of times', { timeout: 30000 }, () => {
  const { CountingText, count } = counting();
  const rows = 400;
  const columns = 4;
  const document = new Pdf.Document();
  document.addPage(new Pdf.MultiPage({
    maxPages: 40,
    build: () => [new Pdf.Table({
      border: Pdf.TableBorder.all(),
      children: Array.from({ length: rows }, (_, row) => new Pdf.TableRow({
        children: Array.from({ length: columns }, (_, column) => new CountingText(`r${row}c${column}`))
      }))
    })]
  }));
  const pages = (latin1(document.save()).match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pages >= 8, `expected a long table, got ${pages} pages`);
  // Natural layout, one width pass per distinct constraint, one row pass, and
  // the one row per page that is measured and found not to fit.
  const perCell = count() / (rows * columns);
  assert.ok(perCell <= 6, `each cell was laid out ${perCell.toFixed(1)} times`);
});

test('L102: a table span stops at the first row that does not fit and reuses its widths', () => {
  const { CountingText, count } = counting();
  const table = new Pdf.Table({
    children: Array.from({ length: 50 }, (_, row) => new Pdf.TableRow({
      children: [new CountingText(`row ${row}`), new CountingText(String(row))]
    }))
  });
  const ctx = context();
  const constraints = { maxWidth: 200, maxHeight: 40 };

  const first = table.layoutSpan(ctx, constraints, table.initialSpanState());
  const fitted = first.box.data.rows.length;
  assert.ok(fitted >= 1 && fitted < 5);
  // One width pass over all 50 rows, then only the rows that fit plus one.
  assert.ok(count() <= 50 * 2 + (fitted + 1) * 2, `first span laid out ${count()} cells`);
  assert.ok(Object.isFrozen(first.nextState));
  assert.equal(first.nextState.nextRow, fitted);

  const before = count();
  const second = table.layoutSpan(ctx, constraints, first.nextState);
  assert.ok(count() - before <= (second.box.data.rows.length + 1) * 2, 'widths are not measured again');
  assert.deepEqual(second.box.data.columnWidths, first.box.data.columnWidths);

  // Replaying a state against another width measures again rather than reusing it.
  const narrow = table.layoutSpan(ctx, { maxWidth: 100, maxHeight: 40 }, first.nextState);
  assert.equal(narrow.box.width, 100);
  assert.notDeepEqual(narrow.box.data.columnWidths, first.box.data.columnWidths);
});

const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';

function textWidth(value, options) {
  return new Pdf.Text(value, options).layout(context(), new Pdf.BoxConstraints()).width;
}

function widestWord(value) {
  return Math.max(...value.split(' ').map(word => textWidth(word)));
}

test('L100: an overflowing table keeps a column at least one word wide', () => {
  const table = new Pdf.Table({
    border: Pdf.TableBorder.all(),
    children: [new Pdf.TableRow({ children: [new Pdf.Text('ATLANTICA'), new Pdf.Text(LOREM)] })]
  });
  const box = table.layout(context(), { maxWidth: 200, maxHeight: 500 });
  const [first, second] = box.data.columnWidths;
  assert.ok(first >= textWidth('ATLANTICA') - 1e-9, `${first} is narrower than ATLANTICA`);
  assert.ok(Math.abs(first + second - 200) < 1e-9);
  assert.equal(box.data.rows[0].cells[0].box.data.lines.length, 1);

  const pdf = render(() => table, { page: { pageFormat: { width: 260, height: 400 }, margin: 30 } });
  assert.match(pdf, /\(ATLANTICA\) Tj/);
  assert.doesNotMatch(pdf, /\(ATLANTI\)/);
});

test('L100: the shrink is shared by what each column wanted beyond its longest word', () => {
  const ctx = context();
  const words = ['Wide', 'Narrow'];
  const table = new Pdf.Table({
    children: [new Pdf.TableRow({
      children: [new Pdf.Text(`${words[0]} ${LOREM}`), new Pdf.Text(`${words[1]} ${LOREM.slice(0, 60)}`)]
    })]
  });
  const constraints = { maxWidth: 200, maxHeight: 500 };
  const box = table.layout(ctx, constraints);
  const max = table.children[0].children.map(cell => cell.layout(ctx, constraints).width);
  const min = [`${words[0]} ${LOREM}`, `${words[1]} ${LOREM.slice(0, 60)}`].map(widestWord);
  const share = (200 - min[0] - min[1]) / (max[0] + max[1] - min[0] - min[1]);
  const expected = [min[0] + (max[0] - min[0]) * share, min[1] + (max[1] - min[1]) * share];
  for (let index = 0; index < 2; index++) {
    assert.ok(Math.abs(box.data.columnWidths[index] - expected[index]) < 1e-9);
  }
});

test('L100: when even the longest words overflow, they are scaled down together', () => {
  const cells = ['Supercalifragilistic', 'Extraordinarily', LOREM];
  const table = new Pdf.Table({
    children: [new Pdf.TableRow({ children: cells.map(value => new Pdf.Text(value)) })]
  });
  const widths = table.layout(context(), { maxWidth: 150, maxHeight: 500 }).data.columnWidths;
  const min = cells.map(widestWord);
  const total = min.reduce((sum, value) => sum + value, 0);
  assert.ok(total > 150);
  for (let index = 0; index < cells.length; index++) {
    assert.ok(Math.abs(widths[index] - min[index] * (150 / total)) < 1e-9);
  }
});

test('L100: TableHelper cells keep whole words, padding included, and fitting tables are unchanged', () => {
  const table = Pdf.TableHelper.fromTextArray({
    headers: ['Name', 'Description'],
    data: [['ATLANTICA', LOREM], ['PACIFICO', 'short']]
  });
  const pdf = render(() => table, { page: { pageFormat: { width: 260, height: 400 }, margin: 30 } });
  assert.match(pdf, /\(ATLANTICA\) Tj/);
  assert.match(pdf, /\(PACIFICO\) Tj/);

  const fitting = new Pdf.Table({
    children: [new Pdf.TableRow({ children: [new Pdf.Text('one'), new Pdf.Text('two words')] })]
  });
  const widths = fitting.layout(context(), { maxWidth: 200, maxHeight: 500 }).data.columnWidths;
  const natural = [textWidth('one'), textWidth('two words')];
  const scale = 200 / (natural[0] + natural[1]);
  assert.deepEqual(widths, natural.map(value => value * scale));
});

function rawImage(width, height) {
  return new Pdf.RawImage({ bytes: new Uint8Array(width * height * 4).fill(200), width, height });
}

test('L78: a quarter-turned box lays its child out against the flipped constraints', () => {
  const constraints = { maxWidth: 481.89, maxHeight: 700 };
  const portrait = new Pdf.Transform({ rotateBox: Math.PI / 2, child: new Pdf.Image(rawImage(300, 400)) })
    .layout(context(600, 800), constraints);
  assert.ok(Math.abs(portrait.width - 481.89) < 1e-6);
  assert.ok(Math.abs(portrait.height - 361.4175) < 1e-6);
  assert.ok(Math.abs(portrait.data.childBox.width - 361.4175) < 1e-6);

  const landscape = new Pdf.Transform({ rotateBox: -Math.PI / 2, child: new Pdf.Image(rawImage(400, 300)) })
    .layout(context(600, 800), constraints);
  assert.ok(Math.abs(landscape.width - 481.89) < 1e-6);
  assert.ok(Math.abs(landscape.height - 642.52) < 1e-6);
});

test('L78: any other angle that overflows is measured again in a smaller frame', () => {
  for (const angle of [Math.PI / 4, 0.3, 2, -1]) {
    const box = new Pdf.Transform({ rotateBox: angle, child: new Pdf.Container({ background: '#ff0000' }) })
      .layout(context(), { maxWidth: 200, maxHeight: 300 });
    const { width, height } = box.data.childBox;
    const c = Math.abs(Math.cos(angle));
    const s = Math.abs(Math.sin(angle));
    assert.ok(width * c + height * s <= 200 + 1e-6, `angle ${angle} overflows the width`);
    assert.ok(width * s + height * c <= 300 + 1e-6, `angle ${angle} overflows the height`);
  }
  for (const angle of [0, Math.PI]) {
    const box = new Pdf.Transform({ rotateBox: angle, child: new Pdf.SizedBox({ width: 50, height: 30 }) })
      .layout(context(), { maxWidth: 200, maxHeight: 300 });
    assert.ok(Math.abs(box.width - 50) < 1e-9 && Math.abs(box.height - 30) < 1e-9);
  }
});

test('L80: a vertical axis reserves its labels\' height along the axis', () => {
  const ctx = context();
  const incoming = { axisPosition: 0, crossAxisPosition: 0, marginEnd: 0 };
  const size = { width: 300, height: 200 };
  const top = 'A LONG TOP LABEL';
  const straight = new Pdf.FixedAxis([0, 10], { format: value => value === 10 ? top : '0' })
    .layout(ctx, 'vertical', size, incoming);
  const label = new Pdf.Text(top).layout(ctx, new Pdf.BoxConstraints());
  assert.equal(straight.marginEnd, label.height / 2);

  const first = 'FIRST LABEL';
  const rotated = new Pdf.FixedAxis([0, 10], { angle: Math.PI / 2, format: value => value === 0 ? first : '1' })
    .layout(ctx, 'vertical', size, incoming);
  const turned = new Pdf.Transform({ rotateBox: Math.PI / 2, child: new Pdf.Text(first) })
    .layout(ctx, new Pdf.BoxConstraints());
  assert.equal(rotated.crossAxisPosition, turned.height);
  assert.ok(turned.height > turned.width);
});

test('L96: Stack(fit: expand) tightens only its bounded axes', () => {
  const stack = new Pdf.Stack({ fit: 'expand', children: [new Pdf.SizedBox({ width: 40, height: 20 })] });
  const box = stack.layout(context(), { maxWidth: Infinity, maxHeight: 100 });
  assert.equal(box.width, 40);
  assert.equal(box.height, 100);
  const bounded = stack.layout(context(), { maxWidth: 150, maxHeight: 100 });
  assert.equal(bounded.width, 150);
  assert.equal(bounded.height, 100);

  const pdf = render(() => new Pdf.Row({
    children: [new Pdf.Stack({ fit: 'expand', children: [new Pdf.Container({ background: '#ff0000', width: 40, height: 20 })] })]
  }));
  assert.doesNotMatch(pdf, /NaN|Infinity/);
  assert.match(pdf, /1 0 0 rg/);
});

test('L97: progress indicators use a finite fallback on an unbounded axis', () => {
  const unbounded = { maxWidth: Infinity, maxHeight: 50 };
  assert.throws(() => new Pdf.LinearProgressIndicator({ value: 0.5 }).layout(context(), unbounded),
    { name: 'RangeError', message: /LinearProgressIndicator.*fallbackWidth/ });
  assert.throws(() => new Pdf.CircularProgressIndicator({ value: 0.5 }).layout(context(), unbounded),
    { name: 'RangeError', message: /CircularProgressIndicator.*fallbackWidth/ });
  assert.throws(() => new Pdf.CircularProgressIndicator({ value: 0.5, fallbackWidth: 30 })
    .layout(context(), { maxWidth: 100, maxHeight: Infinity }), /fallbackHeight/);
  assert.throws(() => new Pdf.LinearProgressIndicator({ value: 0.5, fallbackWidth: -1 }), RangeError);

  const linear = new Pdf.LinearProgressIndicator({ value: 0.5, fallbackWidth: 120 }).layout(context(), unbounded);
  assert.deepEqual([linear.width, linear.height], [120, 4]);
  const circular = new Pdf.CircularProgressIndicator({ value: 0.5, fallbackWidth: 30, fallbackHeight: 30 })
    .layout(context(), unbounded);
  assert.deepEqual([circular.width, circular.height], [30, 50]);
  // A bounded axis ignores the fallback.
  const bounded = new Pdf.LinearProgressIndicator({ value: 0.5, fallbackWidth: 120 })
    .layout(context(), { maxWidth: 200, maxHeight: 50 });
  assert.equal(bounded.width, 200);

  const pdf = render(() => new Pdf.SizedBox({
    height: 40,
    child: new Pdf.Row({
      children: [
        new Pdf.LinearProgressIndicator({ value: 0.4, fallbackWidth: 100 }),
        new Pdf.CircularProgressIndicator({ value: 0.7, fallbackWidth: 40 })
      ]
    })
  }));
  assert.doesNotMatch(pdf, /NaN|Infinity/);
});

test('L107: a non-finite pie value is rejected', () => {
  for (const value of [NaN, Infinity, -Infinity, 'abc']) {
    assert.throws(() => new Pdf.PieDataSet({ value, color: '#ff0000' }), RangeError, String(value));
  }
  assert.equal(new Pdf.PieDataSet({ value: '3', color: '#ff0000' }).value, 3);
});

test('L187: a Page GridView whose cell is taller than the page still draws one row', () => {
  const grid = () => new Pdf.GridView({
    crossAxisCount: 1,
    childAspectRatio: 3,
    children: [new Pdf.Container({ background: '#ff0000' }), new Pdf.Container({ background: '#00ff00' })]
  });
  const box = grid().layout(context(), { maxWidth: 200, maxHeight: 100 });
  assert.equal(box.data.children.length, 1);
  assert.equal(box.height, 100);
  assert.match(render(grid), /1 0 0 rg/);
});

test('L187: MultiPage still terminates on a GridView cell taller than a page', { timeout: 30000 }, () => {
  const document = new Pdf.Document();
  document.addPage(new Pdf.MultiPage({
    maxPages: 5,
    build: () => [new Pdf.GridView({
      crossAxisCount: 1,
      childAspectRatio: 3,
      children: [new Pdf.Container({ background: '#ff0000' })]
    })]
  }));
  assert.throws(() => document.save(), /full MultiPage content area/);
});
