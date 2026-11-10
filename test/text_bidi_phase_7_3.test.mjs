/*
 * js_pdf phase 7.3 text layout, bidi and Arabic regressions.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Courier keeps the widths countable: every glyph, including the '?' that
 * stands in for a Hebrew letter it cannot draw, advances 6pt at 10pt. Layout
 * runs carry the real text either way, so line order is asserted on them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pw from '../src/index.ts';
import { TtfParser } from '../src/pdf/font/ttf_parser.ts';
import { logicalToVisual } from '../src/pdf/font/bidi_utils.ts';
import { wrapText } from '../src/widgets/text.ts';
import { latin1 } from './support/pdf-text.mjs';

const asset = name => new Uint8Array(readFileSync(new URL(`../examples/assets/${name}`, import.meta.url)));
const ARABIC = asset('JsPdfArabicExample.ttf');
const OPEN_SANS = asset('OpenSans-Regular.ttf');

const courier = new pw.TextStyle({ font: pw.Font.courier(), fontSize: 10 });
function context() {
  const document = new pw.Document();
  return { document, canvas: null, pageFormat: { width: 600, height: 800 }, pageNumber: 1, theme: document.theme };
}
const measure = (widget, width = 400) => widget.layout(context(), { maxWidth: width, maxHeight: 1000 });
const lines = box => box.data.lines.map(line => line.runs.map(run => run.text).join(''));
const visual = line => [...line.runs].sort((a, b) => a.x - b.x);
const reversed = value => [...value].reverse().join('');
const codes = value => [...value].map(character => character.codePointAt(0));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} != ${expected}`);
const pdf = (build, options = {}) => latin1(pw.createPdf({ compress: false, ...options }, () => new pw.Page({ build })));

const HEBREW = ['אחד', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש'];

test('L147: a wrapped RTL paragraph keeps its lines in logical order', () => {
  const box = measure(new pw.Text(HEBREW.join(' '), { style: courier, textDirection: 'rtl' }), 60);
  assert.deepEqual(lines(box), [reversed('אחד שתיים'), reversed('שלוש ארבע'), reversed('חמש שש')]);
  for (const line of box.data.lines) {
    const last = visual(line).at(-1);
    near(last.x + last.width, 60, 'start alignment is the right edge');
  }
});

test('L147: justified RTL lines widen the gaps between words in visual order', () => {
  const box = measure(new pw.Text(HEBREW.join(' '), { style: courier, textDirection: 'rtl', textAlign: 'justify' }), 60);
  const words = visual(box.data.lines[0]).filter(run => run.kind === 'text');
  assert.deepEqual(words.map(run => run.text), [reversed('שתיים'), reversed('אחד')]);
  near(words[0].x, 0);
  near(words[1].x + words[1].width, 60, 'the logically first word ends at the right edge');
  const last = visual(box.data.lines[2]).at(-1);
  near(last.x + last.width, 60, 'the unstretched last line sits at the start, on the right');
  const left = measure(new pw.Text('אחד', { style: courier, textDirection: 'rtl', textAlign: 'left' }), 60);
  near(left.data.lines[0].runs[0].x, 0, 'an explicit left is left, not mirrored');
});

test('L147: an embedded Latin run is reordered per line, after the breaks are known', () => {
  const box = measure(new pw.Text('א the historical old town ב', { style: courier, textDirection: 'rtl' }), 120);
  assert.deepEqual(lines(box), ['the historical old א', 'ב town']);
});

test('L147: a fallback-font run stays at its visual position in an RTL line', () => {
  const style = new pw.TextStyle({ fontSize: 20, fontFallback: [pw.Font.ttf(ARABIC)] });
  const box = measure(new pw.Text('مرحبا world', { style, textDirection: 'rtl' }));
  const runs = visual(box.data.lines[0]);
  assert.equal(runs[0].text.trim(), 'world');
  assert.equal(runs[0].style.font.fontName, 'Helvetica');
  assert.deepEqual(codes(runs.at(-1).text), [0xfe8e, 0xfe92, 0xfea3, 0xfeae, 0xfee3]);
  assert.notEqual(runs.at(-1).style.font.fontName, 'Helvetica');

  const justified = measure(new pw.Text('مرحبا بكم مرحبا بكم', { style, textDirection: 'rtl', textAlign: 'justify' }), 120);
  assert.ok(justified.data.lines.length > 1, 'the paragraph wraps, so its first line is justified');
  const first = visual(justified.data.lines[0]).filter(run => run.kind === 'text');
  assert.ok(first.length >= 2, 'each Arabic word is one run, not one run per letter');
  assert.deepEqual(codes(first.at(-1).text), [0xfe8e, 0xfe92, 0xfea3, 0xfeae, 0xfee3], 'the first word is rightmost');
});

test('L147: Arabic shaping joins across TextSpan boundaries', () => {
  const style = new pw.TextStyle({ font: pw.Font.ttf(ARABIC), fontSize: 20 });
  const whole = measure(new pw.RichText({ textDirection: 'rtl', text: new pw.TextSpan({ style, text: 'سلام' }) }));
  const split = measure(new pw.RichText({ textDirection: 'rtl', text: new pw.TextSpan({ style, children: [
    new pw.TextSpan({ text: 'سل' }),
    new pw.TextSpan({ text: 'ام', style: new pw.TextStyle({ color: '#ff0000' }) })
  ] }) }));
  assert.deepEqual(codes(lines(whole)[0]), [0x0645, 0xfefc, 0xfeb3]);
  assert.deepEqual(visual(split.data.lines[0]).map(run => codes(run.text)), [[0x0645], [0xfefc, 0xfeb3]]);
});

test('L147: links and backgrounds cover their right-to-left runs', () => {
  const rects = [];
  class Recorder extends pw.AnnotationBuilder {
    build(_context, rect) { rects.push(rect); }
  }
  const linked = new pw.TextStyle({ background: new pw.BoxDecoration({ color: '#ffff00' }) });
  const widget = new pw.RichText({ textDirection: 'rtl', text: new pw.TextSpan({ style: courier, children: [
    new pw.TextSpan({ text: 'אחד ' }),
    new pw.TextSpan({ text: 'שתיים שלוש', style: linked, annotation: new Recorder() })
  ] }) });
  const box = measure(widget);
  const runs = visual(box.data.lines[0]);
  const covered = runs.filter(run => run.annotation !== null);
  const left = Math.min(...covered.map(run => run.x));
  const right = Math.max(...covered.map(run => run.x + run.width));
  near(left, 0, 'the linked words sit left of the first word');
  near(right, 60);
  near(covered.reduce((sum, run) => sum + run.width, 0), 60, 'runs tile the linked text');
  const plain = runs.find(run => run.annotation === null && run.text.trim() !== '');
  assert.equal(plain.text.trim(), reversed('אחד'));
  assert.ok(plain.x >= right - 1e-6);

  const output = pdf(() => widget);
  assert.equal(rects.reduce((sum, rect) => sum + rect.width, 0), 60);
  assert.match(output, /1 1 0 rg/);
});

test('L150: an RTL fragment in an LTR paragraph is shaped and reordered', () => {
  const box = measure(new pw.Text('Total: مرحبا today', { fontSize: 12 }));
  assert.deepEqual(codes(lines(box)[0]), [
    ...codes('Total: '), 0xfe8e, 0xfe92, 0xfea3, 0xfeae, 0xfee3, ...codes(' today')
  ]);
  const hebrew = measure(new pw.Text('see אחד שתיים now', { style: courier }));
  assert.deepEqual(lines(hebrew), [`see ${reversed('אחד שתיים')} now`]);
  const latin = new pw.Text('plain left to right', { style: courier });
  assert.deepEqual(lines(measure(latin)), ['plain left to right']);
});

test('isolates steer bidi without being drawn (issue #2001)', () => {
  const box = measure(new pw.Text('טלפון \u2066+967-777-123456\u2069 ללקוח', { style: courier, textDirection: 'rtl' }));
  const line = lines(box)[0];
  assert.ok(line.includes('+967-777-123456'), line);
  assert.doesNotMatch(line, /[\u2066-\u2069]/u);
  assert.equal(line, `${reversed('ללקוח')} +967-777-123456 ${reversed('טלפון')}`);
});

test('L139: invisible format characters are neither measured nor drawn', () => {
  const value = 'ab\u00adcd\u200bef\u200eg\u2066h\u2069i\ufeffj\u2060k\u202al\u202cm\u200dn';
  const box = measure(new pw.Text(value, { fontSize: 20 }));
  assert.deepEqual(lines(box), ['abcdefghijklmn']);
  near(box.width, measure(new pw.Text('abcdefghijklmn', { fontSize: 20 })).width);
  assert.match(pdf(() => new pw.Text(value, { fontSize: 20 })), /\(abcdefghijklmn\) Tj/);

  const ttf = pdf(() => new pw.Text(value, { style: new pw.TextStyle({ font: pw.Font.ttf(OPEN_SANS), fontSize: 20 }) }));
  const operand = /<([0-9a-f]+)> Tj/i.exec(ttf)[1];
  assert.equal(operand.length, 14 * 4, 'one CID per visible character');
});

test('L144: a soft hyphen breaks like a hyphenation point and is drawn only there', () => {
  const word = 'Bundes\u00adverfassungs\u00adgericht';
  assert.deepEqual(lines(measure(new pw.Text(word, { style: courier }))), ['Bundesverfassungsgericht']);
  assert.deepEqual(lines(measure(new pw.Text(word, { style: courier }), 130)), ['Bundesverfassungs-', 'gericht']);
  assert.deepEqual(lines(measure(new pw.Text(`xx ${word}`, { style: courier }), 72)), ['xx Bundes-', 'verfassungs-', 'gericht']);
  const output = pdf(() => new pw.SizedBox({ width: 72, child: new pw.Text(`xx ${word}`, { style: courier }) }));
  assert.match(output, /\(xx Bundes-\) Tj/);
  assert.doesNotMatch(output, /\xad/);
});

test('L145: a zero-width space is a break opportunity; a word joiner removes it', () => {
  assert.deepEqual(lines(measure(new pw.Text('aaaa\u200bbbbb\u200bcccc', { style: courier }), 50)), ['aaaabbbb', 'cccc']);
  assert.deepEqual(lines(measure(new pw.Text('aaaa\u200bbbbb', { style: courier }))), ['aaaabbbb']);
  assert.deepEqual(lines(measure(new pw.Text('aaaa\u200b\u2060bbbb', { style: courier }), 30)), ['aaaab', 'bbb']);
});

test('L140: CRLF and CR end one line each in right-to-left text', () => {
  for (const value of ['אבג\r\nדהו', 'אבג\rדהו', 'אבג\nדהו']) {
    assert.deepEqual(lines(measure(new pw.Text(value, { style: courier, textDirection: 'rtl' }))), ['גבא', 'והד'], JSON.stringify(value));
  }
  assert.equal(measure(new pw.Text('אבג\r\n\r\nדהו', { style: courier, textDirection: 'rtl' })).data.lines.length, 3);
  assert.equal(logicalToVisual('אבג\r\nדהו'), 'גבא\nוהד');
  assert.equal(logicalToVisual('אבג\rדהו'), 'גבא\nוהד');
});

test('L141: no-break spaces hold two words together', () => {
  for (const space of ['\u00a0', '\u2007', '\u202f']) {
    const result = lines(measure(new pw.Text(`x 10${space}km`, { style: courier }), 36));
    assert.equal(result.length, 2, JSON.stringify(space));
    assert.equal(result[0], 'x');
    assert.match(result[1], /^10.km$/u);
  }
});

test('L142: a separator the font cannot draw is measured and drawn as a space', () => {
  const helvetica = pdf(() => new pw.Column({ children: [
    new pw.Text('A\tB', { fontSize: 20 }), new pw.Text('C\u2003D', { fontSize: 20 }), new pw.Text('E\u3000F', { fontSize: 20 })
  ] }));
  assert.match(helvetica, /\(A B\) Tj/);
  assert.match(helvetica, /\(C D\) Tj/);
  assert.match(helvetica, /\(E F\) Tj/);
  near(measure(new pw.Text('A\tB', { fontSize: 20 })).width, measure(new pw.Text('A B', { fontSize: 20 })).width);

  const openSans = new pw.TextStyle({ font: pw.Font.ttf(OPEN_SANS), fontSize: 20 });
  const space = measure(new pw.Text('A B', { style: openSans })).width;
  near(measure(new pw.Text('A\tB', { style: openSans })).width, space);
  assert.ok(measure(new pw.Text('A\u2003B', { style: openSans })).width > space, 'a supported em space keeps its own advance');
});

test('L143: only a word longer than the line is cut, after a hyphen', () => {
  // As upstream #1980: a hyphen is a cut point for a word that overflows a
  // whole line; normal wrapping moves a hyphenated word to the next line whole.
  assert.deepEqual(lines(measure(new pw.Text('Hello-World-this-should-break', { style: courier }), 100)),
    ['Hello-World-', 'this-should-', 'break']);
  assert.deepEqual(lines(measure(new pw.Text('Hello-World', { style: courier }), 40)), ['Hello-', 'World']);
  assert.deepEqual(lines(measure(new pw.Text('Hello-World', { style: courier }), 50)), ['Hello-', 'World']);
  assert.deepEqual(lines(measure(new pw.Text('ab Hello-World', { style: courier }), 70)), ['ab', 'Hello-World']);
  assert.deepEqual(lines(measure(new pw.Text('ab e-mail cd', { style: courier }), 40)), ['ab', 'e-mail', 'cd']);
  assert.deepEqual(lines(measure(new pw.Text('xx 3-4', { style: courier }), 30)), ['xx', '3-4']);
  assert.deepEqual(lines(measure(new pw.Text('ab -5', { style: courier }), 18)), ['ab', '-5']);
  // Not before a digit and not where a word joiner follows: the width search cuts.
  assert.deepEqual(lines(measure(new pw.Text('INV-2024-0001', { style: courier }), 50)), ['INV-2024', '-0001']);
  assert.deepEqual(lines(measure(new pw.Text('Hello-\u2060World', { style: courier }), 50)), ['Hello-Wo', 'rld']);
  // The phase-0 helper shares the cut.
  assert.deepEqual(wrapText('Hello-World', 50, 10, pw.PdfType1Font.courier()), ['Hello-', 'World']);
});

test('L143: min-content is the widest piece between hyphens and soft hyphens', () => {
  const minContent = value => new pw.Text(value, { style: courier })
    .layout({ ...context(), minContent: true }, { maxWidth: 1000, maxHeight: 100 }).width;
  near(minContent('Hello-World'), 36, 'Hello- is the widest piece');
  near(minContent('Bundes\u00adrat'), 42, 'a taken soft hyphen draws a hyphen');
  near(minContent('INV-2024'), 48, 'no cut before a digit');
});

test('L155: letter spacing is one gap per character across spans and words', () => {
  const style = new pw.TextStyle({ font: pw.Font.ttf(OPEN_SANS), fontSize: 20, letterSpacing: 5 });
  const advance = character => measure(new pw.Text(character, { style: style.copyWith({ letterSpacing: 0 }) })).width;
  const spans = new pw.RichText({ text: new pw.TextSpan({ style, children: [
    new pw.TextSpan({ text: 'AAA' }),
    new pw.TextSpan({ text: 'BBB', style: new pw.TextStyle({ color: '#ff0000' }) }),
    new pw.TextSpan({ text: 'CCC', style: new pw.TextStyle({ color: '#0000ff' }) })
  ] }) });
  const runs = measure(spans, 1000).data.lines[0].runs;
  near(runs[1].x, 3 * (advance('A') + 5));
  near(runs[2].x, 3 * (advance('A') + 5) + 3 * (advance('B') + 5));
  const single = measure(new pw.Text('AAABBBCCC', { style }), 1000);
  near(measure(spans, 1000).data.lines[0].width, single.data.lines[0].width);
  near(single.width, 3 * (advance('A') + advance('B') + advance('C')) + 8 * 5);

  const space = advance('A A') - 2 * advance('A');
  const words = measure(new pw.Text('AA AA', { style, textAlign: 'justify' }), 1000);
  near(words.data.lines[0].width, 4 * advance('A') + space + 4 * 5);

  const centred = new pw.RichText({ textAlign: 'center', text: spans.text })
    .layout(context(), { minWidth: 300, maxWidth: 300, maxHeight: 100 }).data.lines[0].runs;
  const ink = single.data.lines[0].width;
  near(centred[0].x, (300 - ink) / 2, 'centred on the ink, not on a trailing spacing');
  near(centred.at(-1).x + centred.at(-1).width, (300 + ink) / 2);
  const output = pdf(() => spans);
  const xs = [...output.matchAll(/1 0 0 1 ([\d.]+) [\d.]+ Tm/g)].map(match => Number(match[1]));
  assert.ok(Math.abs(xs[1] - xs[0] - 3 * (advance('A') + 5)) < 1e-3, 'the PDF places BBB after three spaced glyphs');
});

test('L157: whitespace-only text keeps its width; an empty span lays out empty', () => {
  const style = new pw.TextStyle({ font: pw.Font.ttf(OPEN_SANS), fontSize: 12 });
  const space = measure(new pw.Text(' ', { style }));
  assert.ok(Math.abs(space.width - 3.12) < 0.01, String(space.width));
  assert.ok(Math.abs(space.height - 16.34) < 0.01, String(space.height));
  const blank = measure(new pw.Text('', { style }));
  assert.equal(blank.width, 0);
  assert.ok(Math.abs(blank.height - 16.34) < 0.01, String(blank.height));
  const empty = measure(new pw.RichText({ text: new pw.TextSpan() }));
  assert.deepEqual([empty.width, empty.height], [0, 0]);
  const nested = measure(new pw.RichText({ text: new pw.TextSpan({ children: [new pw.TextSpan({ style })] }) }));
  assert.deepEqual([nested.width, nested.height], [0, 0]);
});

test('issue #2000: isolated alef maksura and yeh alias their own base letters', () => {
  const parser = new TtfParser(ARABIC);
  const glyph = codePoint => parser.charToGlyphIndexMap.get(codePoint);
  assert.notEqual(glyph(0x064a), undefined);
  assert.notEqual(glyph(0x0649), glyph(0x064a));
  assert.equal(glyph(0xfef1), glyph(0x064a), 'U+FEF1 is ARABIC LETTER YEH ISOLATED FORM');
  assert.equal(glyph(0xfeef), glyph(0x0649), 'U+FEEF is ARABIC LETTER ALEF MAKSURA ISOLATED FORM');
});
