/*
 * js_pdf serialization and PDF objects phase 7.1 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';
import { PdfName } from '../src/pdf/format/name.ts';
import { PdfNum, PdfNumList, formatNumber } from '../src/pdf/format/num.ts';
import { PdfStream } from '../src/pdf/format/stream.ts';
import { PdfString } from '../src/pdf/format/string.ts';
import { PdfCanvas } from '../src/pdf/graphics.ts';

import { latin1 as source } from './support/pdf-text.mjs';

/** `text` as the UTF-16BE hex string a text string falls back to. */
function utf16(text) {
  let hex = '';
  for (let index = 0; index < text.length; index++) hex += text.charCodeAt(index).toString(16).padStart(4, '0');
  return `<feff${hex}>`;
}

function write(value) {
  const stream = new PdfStream();
  value.output(stream);
  return source(stream.output());
}

/** The body of indirect object `serial`, between `obj` and `endobj`. */
function object(pdf, serial) {
  const match = pdf.match(new RegExp(`(?:^|\\n)${serial} 0 obj\\n([^]*?)\\nendobj`));
  assert.ok(match, `object ${serial} exists`);
  return match[1];
}

/** One-based physical page number of every named destination. */
function destinationPages(pdf) {
  const kids = pdf.match(/\/Type \/Pages \/Count \d+ \/Kids \[([^\]]*)\]/)[1]
    .split(' R').map(entry => entry.trim().split(' ')[0]).filter(Boolean);
  const pages = new Map();
  for (const match of pdf.matchAll(/\(([^()]+)\) << \/D \[(\d+) 0 R/g)) {
    pages.set(match[1], kids.indexOf(match[2]) + 1);
  }
  return pages;
}

function namesTreeKeys(pdf) {
  const names = pdf.match(/\/Dests << \/Names \[([^]*?)\] \/Limits/)[1];
  return [...names.matchAll(/(\([^()]*\)|<[0-9a-f]+>) << \/D/g)].map(match => match[1]);
}

// L109 ---------------------------------------------------------------------

test('L109: non-finite numbers serialize as 0, never NaN or Infinity', () => {
  assert.equal(formatNumber(Number.NaN), '0');
  assert.equal(formatNumber(Number.POSITIVE_INFINITY), '0');
  assert.equal(formatNumber(Number.NEGATIVE_INFINITY), '0');
  assert.equal(write(new PdfNum(Number.NaN)), '0');
  assert.equal(write(new PdfNumList([1, Number.NaN, Number.POSITIVE_INFINITY, 2])), '1 0 0 2');
});

test('L109: magnitudes from 1e21 up are plain digits clamped to 3.403e38', () => {
  assert.equal(formatNumber(1e21), '1000000000000000000000');
  assert.equal(formatNumber(-1e22), '-10000000000000000000000');
  assert.equal(formatNumber(1e40), '340299999999999993642572978492905881600');
  assert.equal(formatNumber(-Number.MAX_VALUE), '-340299999999999993642572978492905881600');
  // The exact integer the double holds, as upstream's BigInt.from writes it.
  assert.equal(write(new PdfNumList([1e25, 0.5])), '10000000000000000905969664 0.5');
});

test('L109: ordinary numbers keep their exact previous output', () => {
  const cases = [
    [0, '0'], [-0, '0'], [1e-9, '0'], [12, '12'], [-3.5, '-3.5'],
    [595.2755905511812, '595.2756'], [0.00005, '0.0001'], [1e20, '100000000000000000000'],
    [999999999999999868928, '999999999999999900000']
  ];
  for (const [value, expected] of cases) assert.equal(formatNumber(value), expected, String(value));
});

test('L109: content operators never carry a token a PDF reader cannot parse', () => {
  const canvas = new PdfCanvas(100);
  canvas.drawRect(Number.NaN, 0, Number.POSITIVE_INFINITY, 1e40);
  canvas.fillRect(Number.NaN, 0, 10, 10, '#000000');
  const content = canvas.output();
  assert.doesNotMatch(content, /NaN|Infinity|e\+/);
  assert.match(content, /^0 0 0 340299999999999993642572978492905881600 re$/m);
  assert.match(content, / 0 90 10 10 re f$/m);
});

// X2 -----------------------------------------------------------------------

test('X2: text strings outside PDFDocEncoding agreement are written as UTF-16BE', () => {
  // CP1252 0x80..0x9F is not PDFDocEncoding: these used to read back as other glyphs.
  assert.equal(write(new PdfString('€—')), '<feff20ac2014>');
  assert.equal(write(new PdfString('’“”')), '<feff2019201c201d>');
  // 0xA0 is the euro sign and 0xAD is undefined in PDFDocEncoding.
  assert.equal(write(new PdfString('a\u00a0b')), '<feff006100a00062>');
  assert.equal(write(new PdfString('soft\u00adhyphen')), '<feff0073006f00660074' + '00ad' + '00680079007000680065006e>');
  // A C1 control has no PDFDocEncoding meaning either.
  assert.equal(write(new PdfString('\u0085')), '<feff0085>');
  assert.equal(write(new PdfString('\u0001')), '<feff0001>');
});

test('X2: Latin-1 text and the existing escapes keep the literal form', () => {
  assert.equal(write(new PdfString('Relatório')), '(Relat\\363rio)');
  assert.equal(write(new PdfString('a(b)c\\d')), '(a\\(b\\)c\\\\d)');
  assert.equal(write(new PdfString('tab\there\nline\r')), '(tab\\011here\\nline\\r)');
  assert.equal(write(new PdfString('¡ÿ')), '(\\241\\377)');
});

test('X2: metadata and bookmarks use UTF-16BE while Type1 text stays WinAnsi', () => {
  const document = new Pdf.Document({ compress: false, title: 'Preço € — “ok”' });
  document.addPage(new Pdf.Page({
    build: () => new Pdf.Column({ children: [
      new Pdf.Header({ text: 'Euro € chapter' }),
      new Pdf.Text('€—’')
    ] })
  }));
  const pdf = source(document.save());
  assert.ok(pdf.includes(`/Title ${utf16('Preço € — “ok”')}`), 'document title');
  assert.ok(pdf.includes(`<< /Title ${utf16('Euro € chapter')} `), 'bookmark title');
  // Content-stream text for a Type1 font is WinAnsi, which is CP1252.
  assert.match(pdf, /\(\\200\\227\\222\) Tj/);
});

// X1 -----------------------------------------------------------------------

test('X1: named destinations are sorted by bytes, once per name', () => {
  const document = new Pdf.Document({ compress: false });
  document.addPage(new Pdf.Page({
    build: () => new Pdf.Column({ children: [
      new Pdf.Anchor({ name: 'alpha', child: new Pdf.Text('a') }),
      new Pdf.Anchor({ name: 'Zeta', child: new Pdf.Text('z') }),
      new Pdf.Anchor({ name: 'Äpfel', child: new Pdf.Text('ä') }),
      new Pdf.Anchor({ name: 'beta', child: new Pdf.Text('b') }),
      new Pdf.Anchor({ name: 'beta', child: new Pdf.Text('b again') }),
      new Pdf.Outline({ name: 'ol', title: 'OL', child: new Pdf.Text('o') })
    ] })
  }));
  const pdf = source(document.save());
  assert.deepEqual(namesTreeKeys(pdf), ['(Zeta)', '(alpha)', '(beta)', '(ol)', '(\\304pfel)']);
  assert.match(pdf, /\/Limits \[\(Zeta\) \(\\304pfel\)\]/);
  // The Outline widget keeps the destination its Anchor registered, with its x.
  assert.match(pdf, /\(ol\) << \/D \[\d+ 0 R \/XYZ \d+(?:\.\d+)? \d+(?:\.\d+)? null\] >>/);
});

test('X1: generated outline anchors cannot collide with a user anchor', () => {
  const document = new Pdf.Document({ compress: false });
  document.addPage(new Pdf.Page({
    build: () => new Pdf.Column({ children: [
      new Pdf.Anchor({ name: 'outline-1', child: new Pdf.Text('user anchor') }),
      new Pdf.Header({ text: 'Generated' }),
      new Pdf.Header({ text: 'Generated' })
    ] })
  }));
  const pdf = source(document.save());
  assert.deepEqual(namesTreeKeys(pdf), ['(__dest0)', '(__dest1)', '(outline-1)']);
  assert.match(pdf, /\/Title \(Generated\)[^]*?\/Dest \(__dest0\)/);
  assert.match(pdf, /\/Title \(Generated\)[^]*?\/Dest \(__dest1\)/);
});

// L22 ----------------------------------------------------------------------

test('L22: PdfName escapes UTF-8 bytes, not UTF-16 code units', () => {
  assert.equal(write(new PdfName('/Accént')), '/Acc#c3#a9nt');
  assert.equal(write(new PdfName('/中')), '/#e4#b8#ad');
  assert.equal(write(new PdfName('/😀')), '/#f0#9f#98#80');
  assert.equal(write(new PdfName('/ÿ')), '/#c3#bf');
  assert.equal(write(new PdfName('/A B')), '/A#20B');
  assert.equal(write(new PdfName('/a/b')), '/a#2fb');
});

// L5 -----------------------------------------------------------------------

test('L5: a closed outline item counts only its immediate children', () => {
  const document = new Pdf.Document({ compress: false });
  document.addPage(new Pdf.Page({
    build: () => new Pdf.Column({ children: [
      new Pdf.Header({ level: 0, text: 'A' }),
      new Pdf.Header({ level: 1, text: 'A1' }),
      new Pdf.Header({ level: 2, text: 'A1a' }),
      new Pdf.Header({ level: 2, text: 'A1b' }),
      new Pdf.Header({ level: 1, text: 'A2' }),
      new Pdf.Header({ level: 0, text: 'B' })
    ] })
  }));
  const pdf = source(document.save());
  const item = title => pdf.match(new RegExp(`<< /Title \\(${title}\\)[^\\n]*`))[0];
  assert.match(item('A'), /\/Count -2\b/);
  assert.match(item('A1'), /\/Count -2\b/);
  assert.doesNotMatch(item('A1a'), /\/Count/);
  assert.doesNotMatch(item('A2'), /\/Count/);
  assert.doesNotMatch(item('B'), /\/Count/);
  // The root is open and shows its two closed children.
  assert.match(pdf, /<< \/Count 2 \/First \d+ 0 R \/Last \d+ 0 R >>/);
});

// L7 -----------------------------------------------------------------------

test('L7: the page-label tree always has an entry for page index 0', () => {
  const late = new Pdf.Document({
    compress: false,
    pageLabels: [{ pageIndex: 2, label: Pdf.PdfPageLabel.romanLower() }]
  });
  for (let index = 0; index < 3; index++) late.addPage(new Pdf.Page({ build: () => new Pdf.Text('p') }));
  assert.match(source(late.save()), /\/Nums \[0 << \/S \/D >> 2 << \/S \/r >>\]/);

  const early = new Pdf.Document({
    compress: false,
    pageLabels: [{ pageIndex: 0, label: Pdf.PdfPageLabel.lettersUpper() }]
  });
  early.addPage(new Pdf.Page({ build: () => new Pdf.Text('p') }));
  assert.match(source(early.save()), /\/Nums \[0 << \/S \/A >>\]/);
});

// L13 ----------------------------------------------------------------------

test('L13: widgets sharing a field name become kids of one field', () => {
  const document = new Pdf.Document({ compress: false });
  document.addPage(new Pdf.MultiPage({
    pageFormat: { width: 300, height: 200 },
    header: () => new Pdf.TextField({ name: 'hdr', value: 'Ref €1', width: 100, height: 20 }),
    build: () => Array.from({ length: 30 }, (_, index) => new Pdf.Text('line ' + index))
  }));
  const pdf = source(document.save());
  const pages = Number(pdf.match(/\/Type \/Pages \/Count (\d+)/)[1]);
  assert.ok(pages >= 3, 'the header repeats on several pages');

  const fields = pdf.match(/\/AcroForm << \/Fields \[([^\]]*)\]/)[1].trim().split(/ 0 R ?/).filter(Boolean);
  assert.equal(fields.length, 1);
  const parent = object(pdf, fields[0]);
  assert.match(parent, /\/T \(hdr\)/);
  assert.match(parent, /\/FT \/Tx/);
  assert.match(parent, /\/V <feff005200650066002020ac0031>/);
  const kids = parent.match(/\/Kids \[([^\]]*)\]/)[1].trim().split(/ 0 R ?/).filter(Boolean);
  assert.equal(kids.length, pages);
  for (const kid of kids) {
    const widget = object(pdf, kid);
    assert.match(widget, /\/Subtype \/Widget/);
    assert.match(widget, new RegExp(`/Parent ${fields[0]} 0 R`));
    assert.match(widget, /\/Rect \[/);
    assert.doesNotMatch(widget, /\/T \(/);
    assert.doesNotMatch(widget, /\/V /);
  }
  assert.equal((pdf.match(/\/T \(hdr\)/g) ?? []).length, 1);
});

test('L13: unique field names keep the merged field-and-widget form', () => {
  const document = new Pdf.Document({ compress: false });
  document.addPage(new Pdf.Page({
    build: () => new Pdf.Column({ children: [
      new Pdf.TextField({ name: 'first', value: 'one' }),
      new Pdf.TextField({ name: 'second', value: 'two' })
    ] })
  }));
  const pdf = source(document.save());
  const fields = pdf.match(/\/AcroForm << \/Fields \[(\d+) 0 R (\d+) 0 R\]/);
  assert.ok(fields);
  assert.match(object(pdf, fields[1]), /^<< \/Type \/Annot \/Subtype \/Widget \/Rect \[[^\]]+\] \/P \d+ 0 R \/F 4 \/FT \/Tx \/T \(first\) \/Ff 0 \/V \(one\) \/DA /);
  assert.match(object(pdf, fields[2]), /^<< \/Type \/Annot \/Subtype \/Widget \/Rect \[[^\]]+\] \/P \d+ 0 R \/F 4 \/FT \/Tx \/T \(second\) \/Ff 0 \/V \(two\) \/DA /);
  for (const line of pdf.match(/.*\/Subtype \/Widget.*/g)) assert.doesNotMatch(line, /\/Parent|\/Kids/);
});

// X3 -----------------------------------------------------------------------

test('X3: a TableOfContent in the same flow shows the final page numbers', () => {
  const chapters = 30;
  let builds = 0;
  const document = new Pdf.Document({ compress: false });
  document.addPage(new Pdf.MultiPage({
    pageFormat: { width: 300, height: 400 },
    build: () => {
      builds++;
      return [
        new Pdf.TableOfContent(),
        ...Array.from({ length: chapters }, (_, index) => [
          new Pdf.Header({ level: 0, text: 'Chapter ' + index }),
          new Pdf.Text('body text for chapter ' + index)
        ]).flat()
      ];
    }
  }));
  const pdf = source(document.save());
  const pages = destinationPages(pdf);
  // A TOC row is the title followed by its page number; a heading is followed
  // by its body text instead.
  const rows = [...pdf.matchAll(/\(Chapter (\d+)\) Tj[^()]*?\((\d+)\) Tj/g)]
    .map(match => [Number(match[1]), Number(match[2])]);
  assert.deepEqual(rows.map(([index]) => index), Array.from({ length: chapters }, (_, index) => index));
  const wrong = rows.filter(([index, page]) => pages.get(`__dest${index}`) !== page);
  assert.deepEqual(wrong, []);
  assert.ok(pages.get('__dest0') > 1, 'the TOC pushes the first chapter off page one');
  assert.ok(builds <= 5, `bounded replays, built ${builds} times`);
});

test('X3: a TableOfContent on its own page still renders only twice', () => {
  const document = new Pdf.Document({ compress: false });
  let tocBuilds = 0;
  document.addPage(new Pdf.Page({
    build: () => {
      tocBuilds++;
      return new Pdf.TableOfContent();
    }
  }));
  document.addPage(new Pdf.Page({ build: () => new Pdf.Header({ text: 'Only chapter' }) }));
  const pdf = source(document.save());
  assert.equal(tocBuilds, 2);
  assert.match(pdf, /\(Only chapter\) Tj[^()]*?\(2\) Tj/);
});

test('X3: a Header at a page break moves whole and registers one outline', () => {
  const document = new Pdf.Document({ compress: false });
  document.addPage(new Pdf.MultiPage({
    pageFormat: { width: 300, height: 400 },
    build: () => Array.from({ length: 8 }, (_, index) => [
      new Pdf.Header({ level: 0, text: 'Chapter ' + index }),
      new Pdf.Text('body text for chapter ' + index)
    ]).flat()
  }));
  const pdf = source(document.save());
  assert.equal(document.outlines.length, 8);
  assert.equal((pdf.match(/<< \/Title \(Chapter \d\)/g) ?? []).length, 8);
  // Split, the heading's filling Container painted an empty first fragment,
  // then a whole page for its one line, pushing its body a page further.
  assert.equal(Number(pdf.match(/\/Type \/Pages \/Count (\d+)/)[1]), 2);
  const moved = document.outlines.find(entry => entry.page === 2);
  assert.ok(moved, 'one heading moved to page two');
  assert.equal(destinationPages(pdf).get(moved.anchor), 2);
});
