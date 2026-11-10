/*
 * js_pdf tests — phase 6.9 directional layout.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as Pdf from '../src/index.ts';
import { latin1 } from './support/pdf-text.mjs';

/** A canvas that accepts every call, for widgets that clip around their children. */
const quietCanvas = new Proxy({ pageHeight: 300 }, { get: (target, key) => key in target ? target[key] : () => {} });

function context(textDirection = undefined, width = 300, height = 300) {
  const document = new Pdf.Document();
  return {
    document,
    canvas: quietCanvas,
    pageFormat: { width, height },
    pageNumber: 1,
    theme: document.theme,
    textDirection
  };
}

const rtl = () => context('rtl');

/** Records where its parent painted it. */
class Probe extends Pdf.Widget {
  constructor(name, width, height, log, exact = false) {
    super();
    this.name = name;
    this.width = width;
    this.height = height;
    this.log = log;
    this.exact = exact;
  }

  layout(_context, constraints) {
    const wanted = { width: this.width, height: this.height };
    const size = this.exact ? wanted : Pdf.BoxConstraints.from(constraints).constrain(wanted);
    return { widget: this, width: size.width, height: size.height, data: null };
  }

  paint(_context, box) {
    this.log.push([this.name, box.x, box.y]);
  }
}

/** Lays `build(log)` out at the origin, paints it, and returns the probe positions. */
function placed(ctx, build, constraints = new Pdf.BoxConstraints({ maxWidth: 100, maxHeight: 100 })) {
  const log = [];
  const widget = build(log);
  const box = widget.layout(ctx, constraints);
  widget.paint(ctx, { ...box, x: 0, y: 0 });
  return log;
}

function pdf(build) {
  return latin1(Pdf.createPdf({ compress: false }, build));
}

test('phase 6.9 directional geometry is on named, namespace and callback APIs', () => {
  for (const name of ['EdgeInsetsDirectional', 'AlignmentDirectional', 'resolveInsets', 'resolveAlignment']) {
    assert.ok(Pdf[name] !== undefined, `${name} named`);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `${name} namespace`);
  }
  let seen = null;
  Pdf.createPdf({}, api => {
    seen = [api.EdgeInsetsDirectional, api.AlignmentDirectional, api.resolveInsets, api.resolveAlignment];
    return new api.Page({ build: () => new api.SizedBox() });
  });
  assert.deepEqual(seen, [Pdf.EdgeInsetsDirectional, Pdf.AlignmentDirectional, Pdf.resolveInsets, Pdf.resolveAlignment]);
});

test('EdgeInsetsDirectional factories resolve start and end against the direction', () => {
  const { EdgeInsetsDirectional, resolveInsets } = Pdf;
  const only = EdgeInsetsDirectional.only({ start: 8, top: 1, bottom: 2 });
  assert.deepEqual(resolveInsets(only, 'ltr'), { top: 1, right: 0, bottom: 2, left: 8 });
  assert.deepEqual(resolveInsets(only, 'rtl'), { top: 1, right: 8, bottom: 2, left: 0 });
  assert.deepEqual(resolveInsets(EdgeInsetsDirectional.fromSTEB(1, 2, 3, 4), 'rtl'), { top: 2, right: 1, bottom: 4, left: 3 });
  assert.deepEqual(resolveInsets(EdgeInsetsDirectional.all(5), 'rtl'), Pdf.EdgeInsets.all(5));
  assert.deepEqual(
    resolveInsets(EdgeInsetsDirectional.symmetric({ horizontal: 3, vertical: 4 }), 'rtl'),
    Pdf.EdgeInsets.symmetric({ horizontal: 3, vertical: 4 })
  );
  assert.deepEqual(resolveInsets(EdgeInsetsDirectional.zero, 'rtl'), Pdf.EdgeInsets.zero);
  // No direction is ltr, as Directionality.of falls back to it.
  assert.deepEqual(resolveInsets(only), resolveInsets(only, 'ltr'));
  // A physical value is its own resolution.
  const physical = Pdf.EdgeInsets.only({ left: 4 });
  assert.equal(resolveInsets(physical, 'rtl'), physical);
});

test('AlignmentDirectional constants are y-up, so each resolves to the physical one of its name', () => {
  const { Alignment, AlignmentDirectional, resolveAlignment } = Pdf;
  const pairs = [
    ['topStart', 'topLeft', 'topRight'],
    ['topCenter', 'topCenter', 'topCenter'],
    ['topEnd', 'topRight', 'topLeft'],
    ['centerStart', 'centerLeft', 'centerRight'],
    ['centerEnd', 'centerRight', 'centerLeft'],
    ['bottomStart', 'bottomLeft', 'bottomRight'],
    ['bottomCenter', 'bottomCenter', 'bottomCenter'],
    ['bottomEnd', 'bottomRight', 'bottomLeft']
  ];
  for (const [name, ltr, rtlName] of pairs) {
    assert.deepEqual(resolveAlignment(AlignmentDirectional[name], 'ltr'), Alignment[ltr], `${name} ltr`);
    assert.deepEqual(resolveAlignment(AlignmentDirectional[name], 'rtl'), Alignment[rtlName], `${name} rtl`);
  }
  assert.equal(resolveAlignment(Alignment.topLeft, 'rtl'), Alignment.topLeft);
  assert.deepEqual(resolveAlignment({ start: 0.5, y: 0.25 }, 'rtl'), { x: -0.5, y: 0.25 });
});

test('Padding resolves directional insets with the ambient direction', () => {
  const build = log => new Pdf.Padding({
    padding: Pdf.EdgeInsetsDirectional.only({ start: 10, top: 3 }),
    child: new Probe('child', 20, 20, log)
  });
  assert.deepEqual(placed(context(), build), [['child', 10, 3]]);
  assert.deepEqual(placed(rtl(), build), [['child', 0, 3]]);
  // A plain object with start/end keys is the same value.
  assert.deepEqual(placed(rtl(), log => new Pdf.Padding({ padding: { end: 7 }, child: new Probe('c', 5, 5, log) })), [['c', 7, 0]]);
});

test('Directionality scopes the resolution of a subtree', () => {
  const log = placed(context(), log => new Pdf.Directionality({
    textDirection: 'rtl',
    child: new Pdf.Align({
      alignment: Pdf.AlignmentDirectional.centerStart,
      child: new Probe('child', 20, 10, log)
    })
  }));
  assert.deepEqual(log, [['child', 80, 45]]);
});

test('Align, FittedBox and OverflowBox take directional alignments and names', () => {
  const align = alignment => log => new Pdf.Align({ alignment, child: new Probe('a', 20, 10, log) });
  assert.deepEqual(placed(context(), align(Pdf.AlignmentDirectional.topStart)), [['a', 0, 0]]);
  assert.deepEqual(placed(rtl(), align(Pdf.AlignmentDirectional.topStart)), [['a', 80, 0]]);
  assert.deepEqual(placed(rtl(), align('bottomEnd')), [['a', 0, 90]]);
  assert.deepEqual(placed(rtl(), align('topRight')), [['a', 80, 0]]);
  assert.throws(() => new Pdf.Align({ alignment: 'topSideways' }), /Unknown alignment/);

  const overflow = placed(rtl(), log => new Pdf.SizedBox({
    width: 40,
    height: 40,
    child: new Pdf.OverflowBox({
      alignment: 'centerStart',
      maxWidth: 60,
      minHeight: 0,
      child: new Probe('o', 60, 10, log)
    })
  }));
  assert.deepEqual(overflow, [['o', -20, 15]]);
});

test('Container resolves directional margin, padding and alignment', () => {
  const build = log => new Pdf.Container({
    margin: Pdf.EdgeInsetsDirectional.only({ start: 5 }),
    padding: Pdf.EdgeInsetsDirectional.only({ start: 7, end: 1 }),
    alignment: Pdf.AlignmentDirectional.topStart,
    child: new Probe('c', 10, 10, log)
  });
  assert.deepEqual(placed(context(), build), [['c', 12, 0]]);
  // rtl: margin on the right, padding 1 left / 7 right, child at the right.
  assert.deepEqual(placed(rtl(), build), [['c', 100 - 5 - 7 - 10, 0]]);
});

test('Row lays its main axis out from the start side of the text direction', () => {
  const row = mainAxisAlignment => log => new Pdf.Row({
    mainAxisAlignment,
    children: [new Probe('a', 10, 10, log), new Probe('b', 20, 10, log)]
  });
  assert.deepEqual(placed(context(), row('start')), [['a', 0, 0], ['b', 10, 0]]);
  assert.deepEqual(placed(rtl(), row('start')), [['a', 90, 0], ['b', 70, 0]]);
  assert.deepEqual(placed(rtl(), row('end')), [['a', 20, 0], ['b', 0, 0]]);
  assert.deepEqual(placed(rtl(), row('spaceBetween')), [['a', 90, 0], ['b', 0, 0]]);
});

test('Column cross-axis start and end follow the text direction', () => {
  const column = crossAxisAlignment => log => new Pdf.Column({
    crossAxisAlignment,
    children: [new Probe('a', 10, 10, log), new Probe('b', 30, 10, log)]
  });
  assert.deepEqual(placed(context(), column('start')), [['a', 0, 0], ['b', 0, 10]]);
  assert.deepEqual(placed(rtl(), column('start')), [['a', 20, 0], ['b', 0, 10]]);
  assert.deepEqual(placed(rtl(), column('end')), [['a', 0, 0], ['b', 0, 10]]);
  assert.deepEqual(placed(rtl(), column('center')), [['a', 10, 0], ['b', 0, 10]]);
});

test('Row cross-axis start is the bottom when verticalDirection is up, as upstream _startIsTopLeft', () => {
  const log = placed(context(), log => new Pdf.Row({
    crossAxisAlignment: 'start',
    verticalDirection: 'up',
    children: [new Probe('a', 10, 10, log), new Probe('b', 10, 30, log)]
  }));
  assert.deepEqual(log, [['a', 0, 20], ['b', 10, 0]]);
});

test('Wrap places runs from the start side under rtl', () => {
  const horizontal = log => new Pdf.Wrap({
    spacing: 5,
    children: [new Probe('a', 40, 10, log), new Probe('b', 40, 10, log), new Probe('c', 30, 20, log)]
  });
  assert.deepEqual(placed(context(), horizontal), [['a', 0, 0], ['b', 45, 0], ['c', 0, 10]]);
  assert.deepEqual(placed(rtl(), horizontal), [['a', 45, 0], ['b', 0, 0], ['c', 55, 10]]);

  const vertical = log => new Pdf.Wrap({
    direction: 'vertical',
    runSpacing: 4,
    crossAxisAlignment: 'start',
    children: [new Probe('a', 10, 60, log), new Probe('b', 20, 60, log)]
  });
  assert.deepEqual(placed(context(), vertical), [['a', 0, 0], ['b', 14, 0]]);
  // Runs from the right, and within a run start is the right edge.
  assert.deepEqual(placed(rtl(), vertical), [['a', 24, 0], ['b', 0, 0]]);
});

test('a reversed Wrap steps over each child and run once', () => {
  // verticalDirection up reverses the runs of a horizontal wrap and the
  // children of a vertical one; the cursor used to subtract each extent twice.
  const runs = placed(context(), log => new Pdf.Wrap({
    verticalDirection: 'up',
    runSpacing: 4,
    children: [new Probe('a', 60, 10, log), new Probe('b', 60, 20, log), new Probe('c', 60, 10, log)]
  }));
  assert.deepEqual(runs, [['a', 0, 38], ['b', 0, 14], ['c', 0, 0]]);
  const column = placed(context(), log => new Pdf.Wrap({
    direction: 'vertical',
    verticalDirection: 'up',
    spacing: 5,
    children: [new Probe('a', 10, 20, log), new Probe('b', 10, 30, log)]
  }));
  assert.deepEqual(column, [['a', 0, 35], ['b', 0, 0]]);
});

test('Stack resolves AlignmentDirectional and PositionedDirectional at layout', () => {
  const stack = log => new Pdf.Stack({
    alignment: Pdf.AlignmentDirectional.topStart,
    overflow: 'visible',
    children: [
      new Probe('aligned', 20, 10, log),
      new Pdf.PositionedDirectional({ start: 5, top: 2, child: new Probe('positioned', 10, 10, log) }),
      Pdf.PositionedDirectional.fill({ start: 10, end: 30, child: new Probe('fill', 0, 0, log) }),
      new Pdf.PositionedDirectional({ start: 5, textDirection: 'ltr', child: new Probe('pinned', 10, 10, log) })
    ]
  });
  const size = Pdf.BoxConstraints.tight({ width: 100, height: 50 });
  assert.deepEqual(placed(context(), stack, size), [
    ['aligned', 0, 0], ['positioned', 5, 2], ['fill', 10, 0], ['pinned', 5, 0]
  ]);
  assert.deepEqual(placed(rtl(), stack, size), [
    ['aligned', 80, 0], ['positioned', 85, 2], ['fill', 30, 0], ['pinned', 5, 0]
  ]);
});

test('RTL GridView mirrors the ltr cell positions about the padded band', () => {
  const grid = (crossAxisCount, padding) => log => new Pdf.GridView({
    crossAxisCount,
    crossAxisSpacing: 6,
    childAspectRatio: 1,
    padding,
    children: Array.from({ length: crossAxisCount }, (_, index) => new Probe(String(index), 0, 0, log))
  });
  const size = new Pdf.BoxConstraints({ maxWidth: 200, maxHeight: 400 });
  const xs = log => log.map(([, x]) => x);

  // One column: the cell fills the band in both directions (upstream put it 400pt off the page).
  assert.deepEqual(xs(placed(rtl(), grid(1, 0), size)), [0]);

  const padding = Pdf.EdgeInsetsDirectional.only({ start: 10, end: 30 });
  const ltr = xs(placed(context(), grid(4, padding), size));
  const mirrored = xs(placed(rtl(), grid(4, padding), size));
  // childCrossAxis = (200 - 40 - 18) / 4 = 35.5
  assert.deepEqual(ltr, [10, 51.5, 93, 134.5]);
  // rtl: padding 30 on the left, the first cell at the right edge of the band.
  assert.deepEqual(mirrored, [154.5, 113, 71.5, 30]);
  for (const x of mirrored) assert.ok(x >= 30 && x + 35.5 <= 190 + 1e-9);

  const horizontal = placed(rtl(), log => new Pdf.GridView({
    direction: 'horizontal',
    crossAxisCount: 1,
    childAspectRatio: 1,
    children: [new Probe('a', 0, 0, log), new Probe('b', 0, 0, log)]
  }), new Pdf.BoxConstraints({ maxWidth: 200, maxHeight: 50 }));
  assert.deepEqual(horizontal, [['a', 50, 0], ['b', 0, 0]]);
});

test('Table lays its columns out from the right on an rtl page', () => {
  const table = (textDirection, log) => new Pdf.Table({
    textDirection,
    columnWidths: { 0: new Pdf.FixedColumnWidth(10), 1: new Pdf.FixedColumnWidth(20), 2: new Pdf.FixedColumnWidth(30) },
    tableWidth: 'min',
    children: [new Pdf.TableRow({ children: ['a', 'b', 'c'].map(name => new Probe(name, 0, 5, log)) })]
  });
  const xs = log => log.map(([name, x]) => [name, x]);
  assert.deepEqual(xs(placed(context(), log => table(undefined, log))), [['a', 0], ['b', 10], ['c', 30]]);
  assert.deepEqual(xs(placed(rtl(), log => table(undefined, log))), [['a', 50], ['b', 30], ['c', 0]]);
  // An explicit direction wins over the ambient one.
  assert.deepEqual(xs(placed(rtl(), log => table('ltr', log))), [['a', 0], ['b', 10], ['c', 30]]);
  assert.deepEqual(xs(placed(context(), log => table('rtl', log))), [['a', 50], ['b', 30], ['c', 0]]);
});

test('RTL Table draws its inside rules where its columns actually are', () => {
  const source = pdf(api => new api.Page({
    margin: 0,
    textDirection: 'rtl',
    build: () => new api.Table({
      border: api.TableBorder.all({ width: 1 }),
      tableWidth: 'min',
      columnWidths: { 0: new api.FixedColumnWidth(10), 1: new api.FixedColumnWidth(20) },
      children: [new api.TableRow({ children: [new api.SizedBox({ height: 5 }), new api.SizedBox({ height: 5 })] })]
    })
  }));
  // The page is rtl, so the 30pt table sits at the right edge of A4, from
  // 565.28: column 0 (10pt) is rightmost, and the rule is 20pt in, not 10.
  assert.match(source, /\n585\.28 836\.89 10 5 re\nW n\n/);
  assert.match(source, / 1 w 585\.28 841\.89 m 585\.28 836\.89 l S/);
  assert.doesNotMatch(source, / 1 w 575\.28 841\.89 m 575\.28 836\.89 l S/);
});

test('TableHelper resolves directional cell geometry and forwards cell directions', () => {
  const ctx = rtl();
  const table = Pdf.TableHelper.fromTextArray({
    context: ctx,
    data: [['a', 'b']],
    headerCount: 0,
    cellAlignment: Pdf.AlignmentDirectional.centerStart,
    cellPadding: Pdf.EdgeInsetsDirectional.only({ start: 9 }),
    tableDirection: 'rtl'
  });
  const cell = table.children[0].children[0];
  const text = cell.child;
  // A directional alignment stays directional; the text resolves it at layout.
  assert.equal(text.textAlign, 'start');
  assert.equal(text.textDirection, 'rtl');
  const physical = Pdf.TableHelper.fromTextArray({ data: [['a']], headerCount: 0, cellAlignment: 'centerRight' });
  assert.equal(physical.children[0].children[0].child.textAlign, 'right');
  const contextless = Pdf.TableHelper.fromTextArray({ data: [['a']], headerCount: 0, cellAlignment: 'centerEnd' });
  assert.equal(contextless.children[0].children[0].child.textAlign, 'end');
  const box = cell.layout(ctx, Pdf.BoxConstraints.tight({ width: 50, height: 20 }));
  const log = [];
  const probeCell = new cell.constructor({
    child: new Probe('p', 10, 10, log, true),
    padding: Pdf.EdgeInsetsDirectional.only({ start: 9 }),
    minimumHeight: 0,
    alignment: Pdf.AlignmentDirectional.centerStart,
    decoration: null
  });
  probeCell.paint(ctx, { ...probeCell.layout(ctx, Pdf.BoxConstraints.tight({ width: 50, height: 20 })), x: 0, y: 0 });
  assert.deepEqual(log, [['p', 31, 5]]);
  assert.equal(box.width, 50);
});

test('a gradient with directional begin and end runs from the start side', () => {
  const page = textDirection => pdf(api => new api.Page({
    margin: 0,
    textDirection,
    pageFormat: { width: 100, height: 100 },
    build: () => new api.Container({
      width: 100,
      height: 100,
      decoration: new api.BoxDecoration({
        gradient: new api.LinearGradient({
          colors: ['#ff0000', '#0000ff'],
          begin: api.AlignmentDirectional.topStart,
          end: api.AlignmentDirectional.bottomEnd
        })
      })
    })
  }));
  assert.match(page('ltr'), /\/Coords \[0 100 100 0\]/);
  assert.match(page('rtl'), /\/Coords \[100 100 0 0\]/);
});

test('BoxDecoration resolves BorderRadiusDirectional with the ambient direction', () => {
  const page = textDirection => pdf(api => new api.Page({
    margin: 0,
    textDirection,
    pageFormat: { width: 100, height: 100 },
    build: () => new api.Container({
      width: 100,
      height: 100,
      decoration: new api.BoxDecoration({
        color: '#ff0000',
        borderRadius: api.BorderRadiusDirectional.only({ topStart: 20 })
      })
    })
  }));
  // The rounded corner is the top-left under ltr and the top-right under rtl.
  assert.match(page('ltr'), /\n20 100 l\n8\.9643 100 0 91\.0357 0 80 c\n/);
  assert.match(page('rtl'), /\n100 80 l\n100 91\.0357 91\.0357 100 80 100 c\n/);
});

test('PageTheme resolves a directional margin, with ltr when it has no direction', () => {
  const margin = Pdf.EdgeInsetsDirectional.fromSTEB(10, 20, 30, 40);
  // Upstream PR #1980 L74: no textDirection must not throw.
  assert.deepEqual(new Pdf.PageTheme({ margin }).margin, { top: 20, right: 30, bottom: 40, left: 10 });
  assert.deepEqual(new Pdf.PageTheme({ margin, textDirection: 'rtl' }).margin, { top: 20, right: 10, bottom: 40, left: 30 });
  // Rotating needs physical edges: resolve first, then turn.
  const rotated = new Pdf.PageTheme({ margin, orientation: 'landscape' });
  assert.deepEqual(rotated.margin, { left: 40, top: 10, right: 20, bottom: 30 });
  const copy = new Pdf.PageTheme({ margin, textDirection: 'rtl' }).copyWith({ clip: true });
  assert.equal(copy.textDirection, 'rtl');
  assert.deepEqual(copy.margin, { top: 20, right: 10, bottom: 40, left: 30 });
});

test('Page and MultiPage scope their textDirection and resolve directional margins', () => {
  for (const Section of ['Page', 'MultiPage']) {
    let seen = null;
    const log = [];
    Pdf.createPdf({}, api => new api[Section]({
      pageFormat: { width: 200, height: 200 },
      textDirection: 'rtl',
      margin: api.EdgeInsetsDirectional.only({ start: 10 }),
      build: context => {
        seen = api.Directionality.of(context);
        const child = new Probe('p', 50, 20, log);
        return Section === 'Page' ? child : [child];
      }
    }));
    assert.equal(seen, 'rtl', Section);
    // The narrower child sits at the start (right) side, inside the 10pt right margin.
    assert.deepEqual(log.at(-1), ['p', 140, 0], Section);
  }
});

test('MultiPage.crossAxisAlignment places children, honouring the direction for start and end', () => {
  const positions = (crossAxisAlignment, textDirection) => {
    const log = [];
    Pdf.createPdf({}, api => new api.MultiPage({
      pageFormat: { width: 200, height: 200 },
      margin: 0,
      crossAxisAlignment,
      textDirection,
      build: () => [new Probe('a', 50, 20, log), new Probe('b', 100, 20, log)]
    }));
    return log.map(([name, x]) => [name, x]);
  };
  assert.deepEqual(positions('start'), [['a', 0], ['b', 0]]);
  assert.deepEqual(positions('end'), [['a', 150], ['b', 100]]);
  assert.deepEqual(positions('center'), [['a', 75], ['b', 50]]);
  assert.deepEqual(positions('stretch'), [['a', 0], ['b', 0]]);
  assert.deepEqual(positions('start', 'rtl'), [['a', 150], ['b', 100]]);
  assert.deepEqual(positions('end', 'rtl'), [['a', 0], ['b', 0]]);
  assert.throws(() => new Pdf.MultiPage({ crossAxisAlignment: 'baseline', build: () => [] }), /CrossAxisAlignment/);
});

test('MultiPage right-aligns its header and footer on an rtl page', () => {
  const log = [];
  Pdf.createPdf({}, api => new api.MultiPage({
    pageFormat: { width: 200, height: 200 },
    margin: 0,
    textDirection: 'rtl',
    header: () => new Probe('header', 40, 10, log),
    footer: () => new Probe('footer', 60, 10, log),
    build: () => [new Probe('body', 200, 10, log)]
  }));
  assert.deepEqual(log.filter(([name]) => name !== 'body'), [['header', 160, 0], ['footer', 140, 190]]);
});

test('Icon follows the ambient direction when it has none of its own', () => {
  const icons = new Pdf.IconData(0xe5c8, { matchTextDirection: true });
  const font = Pdf.Font.helvetica();
  const icon = new Pdf.Icon(icons, { font });
  const ltr = icon.build(context());
  const mirrored = icon.build(rtl());
  assert.ok(!(ltr instanceof Pdf.Transform));
  assert.ok(mirrored instanceof Pdf.Transform);
});
