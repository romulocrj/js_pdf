/*
 * js_pdf tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';
import { latin1 } from "./support/pdf-text.mjs";


function assertClose(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test('createPdf returns a valid Uint8Array PDF with one page', () => {
  const bytes = Pdf.createPdf({}, () => [
    new Pdf.Page({
      build: () => new Pdf.Text('Hello js_pdf')
    })
  ]);

  assert.ok(bytes instanceof Uint8Array);
  const source = latin1(bytes);
  assert.match(source, /^%PDF-1\.7/);
  assert.match(source, /\/Type \/Page\b/);
  assert.match(source, /Hello js_pdf/);
  assert.match(source, /%%EOF\s*$/);
});

test('MultiPage creates additional physical pages when widgets overflow', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.MultiPage({
    margin: 40,
    gap: 4,
    build: () => Array.from({ length: 45 }, (_, index) =>
      new Pdf.Container({
        padding: 5,
        borderColor: '#cccccc',
        child: new Pdf.Text(`Linha ${index + 1}`, { fontSize: 12 })
      })
    )
  }));

  const source = latin1(bytes);
  const pageObjectCount = (source.match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pageObjectCount >= 2);
  assert.match(source, /\/Count [2-9]/);
});

test('MultiPage does not duplicate content bytes before post-processing', () => {
  const document = new Pdf.Document();
  const section = new Pdf.MultiPage({
    build: () => [new Pdf.Text('serialized once')]
  });
  const summaries = section.render({ document, pageOffset: 0, pagesCount: 0 });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].content.length, 0);
  const pages = section.postProcess({ document, pageOffset: 0, pagesCount: 1 });
  assert.ok(pages[0].content.length > 0);
});

test('Text emits WinAnsi octal escapes for Portuguese accents', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.Text('Relatório de execução')
  }));

  const source = latin1(bytes);
  assert.match(source, /Relat\\363rio/);
  assert.match(source, /execu\\347\\343o/);
});

test('Helvetica measures a known string with AFM advance widths', () => {
  const font = Pdf.PdfType1Font.helvetica();
  const metrics = font.stringMetrics('Hello', 12);

  assertClose(metrics.advanceWidth, 27.336);
  assertClose(metrics.width, 27.336);
  assertClose(metrics.ascent, 11.172);
  assertClose(metrics.descent, -2.7);
});

test('all 14 standard Type1 fonts can be selected for a document', () => {
  const fonts = [
    Pdf.PdfType1Font.courier(),
    Pdf.PdfType1Font.courierBold(),
    Pdf.PdfType1Font.courierBoldOblique(),
    Pdf.PdfType1Font.courierOblique(),
    Pdf.PdfType1Font.helvetica(),
    Pdf.PdfType1Font.helveticaBold(),
    Pdf.PdfType1Font.helveticaBoldOblique(),
    Pdf.PdfType1Font.helveticaOblique(),
    Pdf.PdfType1Font.times(),
    Pdf.PdfType1Font.timesBold(),
    Pdf.PdfType1Font.timesBoldItalic(),
    Pdf.PdfType1Font.timesItalic(),
    Pdf.PdfType1Font.symbol(),
    Pdf.PdfType1Font.zapfDingbats()
  ];

  assert.equal(fonts.length, 14);
  for (const font of fonts) {
    const bytes = Pdf.createPdf({ font }, () => new Pdf.Page({
      build: () => new Pdf.Text('Font metrics')
    }));
    const source = latin1(bytes);

    assert.match(source, new RegExp(`/BaseFont /${font.fontName}\\b`));
    assert.match(source, /BT \/F1 12 Tf/);
  }
});

test('two fonts on one page get their own /Font entries and Tf operators', () => {
  const times = Pdf.PdfType1Font.timesBoldItalic();
  const courier = Pdf.PdfType1Font.courier();

  const bytes = Pdf.createPdf({ font: times }, () => new Pdf.Page({
    build: () => new Pdf.Column({
      children: [
        new Pdf.Text('document default'),
        new Pdf.Text('override', { font: courier, fontSize: 10 })
      ]
    })
  }));

  const source = latin1(bytes);
  assert.match(source, /\/BaseFont \/Times-BoldItalic\b/);
  assert.match(source, /\/BaseFont \/Courier\b/);
  assert.match(source, /\/Resources << \/Font << \/F1 \d+ 0 R \/F2 \d+ 0 R >> >>/);
  assert.match(source, /BT \/F1 12 Tf/);
  assert.match(source, /BT \/F2 10 Tf/);
});

test('a font used on several pages is written once and named per page', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.MultiPage({
    margin: 40,
    build: () => Array.from({ length: 60 }, (_, index) => new Pdf.Text(`Linha ${index + 1}`))
  }));

  const source = latin1(bytes);
  assert.ok((source.match(/\/Type \/Page\b/g) ?? []).length >= 2);
  assert.equal((source.match(/\/BaseFont \/Helvetica\b/g) ?? []).length, 1);
  assert.equal(
    (source.match(/\/Resources << \/Font << \/F1 \d+ 0 R >> >>/g) ?? []).length,
    (source.match(/\/Type \/Page\b/g) ?? []).length
  );
});

test('a page that draws no text carries no /Resources', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.Container({ width: 100, height: 100, background: '#ff0000' })
  }));

  assert.ok(!latin1(bytes).includes('/Resources'));
});

test('Type1 font encoding and resource dictionary use the font seam', () => {
  const font = Pdf.PdfType1Font.timesBoldItalic();

  assert.equal(font.encodeText('Ação'), '(A\\347\\343o)');

  // resourceDict() returns a PdfDict as of phase 0.2, not a string.
  const dict = font.resourceDict().toString();
  assert.match(dict, /\/Subtype \/Type1/);
  assert.match(dict, /\/BaseFont \/Times-BoldItalic/);
  assert.match(dict, /\/Encoding \/WinAnsiEncoding/);
});

test('the namespace export exposes the same API as the named exports', () => {
  for (const name of [
    'Document', 'Page', 'MultiPage', 'Text', 'Column', 'Row', 'Container', 'Spacer', 'Vector',
    'PageFormat', 'PdfType1Font', 'PdfTtfFont', 'Font', 'TextStyle', 'Theme', 'ThemeData',
    'DefaultTextStyle', 'PageTheme'
  ]) {
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name} must match the named export`);
  }
  assert.equal(typeof Pdf.js_pdf.createPdf, 'function');
});

test('a single widget taller than the content area is rejected', () => {
  assert.throws(
    () => Pdf.createPdf({}, () => new Pdf.MultiPage({
      build: () => [new Pdf.Container({ height: 5000 })]
    })),
    RangeError
  );
});

// ---------------------------------------------------------------------------
// Phase 3.3 — composition widgets.
// ---------------------------------------------------------------------------

/** Lay a widget out against a fixed box, without building a whole document. */
function layoutOnly(widget, constraints = { maxWidth: 200, maxHeight: 100 }) {
  const document = new Pdf.Document();
  const context = {
    document,
    canvas: null,
    pageFormat: { width: 200, height: 100 },
    pageNumber: 1,
    theme: document.theme
  };
  return widget.layout(context, constraints);
}

test('EdgeInsets builds the same shapes as the inset shorthand', () => {
  assert.deepEqual(Pdf.EdgeInsets.all(4), { top: 4, right: 4, bottom: 4, left: 4 });
  assert.deepEqual(
    Pdf.EdgeInsets.symmetric({ vertical: 2, horizontal: 6 }),
    { top: 2, right: 6, bottom: 2, left: 6 }
  );
  assert.deepEqual(Pdf.EdgeInsets.only({ left: 8 }), { top: 0, right: 0, bottom: 0, left: 8 });
  assert.deepEqual(Pdf.EdgeInsets.fromLTRB(1, 2, 3, 4), { top: 2, right: 3, bottom: 4, left: 1 });
  assert.deepEqual(Pdf.EdgeInsets.zero, { top: 0, right: 0, bottom: 0, left: 0 });
});

test('Padding grows its box by the insets and offsets the child', () => {
  const child = new Pdf.SizedBox({ width: 20, height: 10 });
  const box = layoutOnly(new Pdf.Padding({ padding: { vertical: 5, horizontal: 8 }, child }));

  assert.equal(box.width, 20 + 16);
  assert.equal(box.height, 10 + 10);
  assert.equal(box.data.childBox.width, 20);
});

test('Padding with no child is just the insets', () => {
  const box = layoutOnly(new Pdf.Padding({ padding: 6 }));
  assert.equal(box.width, 12);
  assert.equal(box.height, 12);
  assert.equal(box.data.childBox, null);
});

test('Align fills both axes and inscribes the child by alignment', () => {
  const child = () => new Pdf.SizedBox({ width: 50, height: 20 });

  const centered = layoutOnly(new Pdf.Center({ child: child() }));
  assert.equal(centered.width, 200, 'fills the constraint when no factor is given');
  assert.equal(centered.height, 100);
  assert.equal(centered.data.dx, (200 - 50) / 2);
  assert.equal(centered.data.dy, (100 - 20) / 2);

  // Alignment y is upstream's, growing upward; the widget layer is y-down.
  const topLeft = layoutOnly(new Pdf.Align({ alignment: Pdf.Alignment.topLeft, child: child() }));
  assert.deepEqual([topLeft.data.dx, topLeft.data.dy], [0, 0]);

  const bottomRight = layoutOnly(new Pdf.Align({ alignment: Pdf.Alignment.bottomRight, child: child() }));
  assert.deepEqual([bottomRight.data.dx, bottomRight.data.dy], [150, 80]);
});

test('Align shrink-wraps an axis when given a factor', () => {
  const box = layoutOnly(new Pdf.Align({
    heightFactor: 1,
    widthFactor: 2,
    child: new Pdf.SizedBox({ width: 30, height: 20 })
  }));

  assert.equal(box.width, 60);
  assert.equal(box.height, 20);
});

test('SizedBox reports its stated size and caps the child', () => {
  const box = layoutOnly(new Pdf.SizedBox({
    width: 40,
    height: 25,
    child: new Pdf.Text('x'.repeat(200))
  }));

  assert.equal(box.width, 40);
  assert.equal(box.height, 25);
  assert.ok(box.data.childBox.width <= 40);

  // No size and no child is upstream's SizedBox.shrink().
  const shrink = layoutOnly(new Pdf.SizedBox());
  assert.deepEqual([shrink.width, shrink.height], [0, 0]);
});

test('Divider fills the width and draws a centred rule', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.Divider({ height: 20, thickness: 2, indent: 10, endIndent: 30, color: '#ff0000' })
  }));

  const source = latin1(bytes);
  // 595.28 wide, minus the two indents; the rule sits 9pt below the box top,
  // which is 841.89 - 9 - 2 from the bottom in PDF space.
  assert.match(source, /1 0 0 rg 10 830\.89 555\.28 2 re f/);
});

test('a StatelessWidget builds its subtree during layout', () => {
  class Labelled extends Pdf.StatelessWidget {
    build() {
      return new Pdf.Padding({ padding: 4, child: new Pdf.SizedBox({ width: 12, height: 6 }) });
    }
  }

  const box = layoutOnly(new Labelled());
  assert.equal(box.width, 20);
  assert.equal(box.height, 14);

  const bytes = Pdf.createPdf({}, () => new Pdf.Page({ build: () => new Labelled() }));
  assert.match(latin1(bytes), /%%EOF/);
});

test('the composition widgets compose into a real document', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.Column({
      children: [
        new Pdf.Padding({ padding: Pdf.EdgeInsets.all(6), child: new Pdf.Text('padded') }),
        new Pdf.Divider({ height: 12 }),
        new Pdf.Align({
          alignment: Pdf.Alignment.centerRight,
          heightFactor: 1,
          child: new Pdf.Text('right')
        })
      ]
    })
  }));

  const source = latin1(bytes);
  assert.match(source, /\(padded\) Tj/);
  assert.match(source, /\(right\) Tj/);
  assert.match(source, / re f/);
});
