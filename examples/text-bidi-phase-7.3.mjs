/*
 * js_pdf text layout, bidi and Arabic phase 7.3 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

/** Sentences of one Arabic paragraph, numbered so the line order can be read off the page. */
export const NUMBERED_ARABIC = [
  '1 هذه هي الجملة الأولى في الفقرة.',
  '2 تأتي الجملة الثانية بعدها مباشرة.',
  '3 ثم الجملة الثالثة على السطر التالي.',
  '4 وتنتهي الفقرة بالجملة الرابعة.'
];

/**
 * `arabicFontBytes` is examples/assets/JsPdfArabicExample.ttf, a modified Noto
 * Sans Arabic subset (SIL OFL 1.1). Runners load it like the phase 6.4 CJK font.
 */
export function generateTextBidiPhase73(api = defaultApi, compress = true, arabicFontBytes = null) {
  if (!(arabicFontBytes instanceof Uint8Array)) {
    throw new TypeError('generateTextBidiPhase73 needs the bytes of examples/assets/JsPdfArabicExample.ttf');
  }
  const { Document, Page, PageFormat, Text, RichText, TextSpan, TextStyle, Column, Row, Container,
    SizedBox, BoxDecoration, Border, Font, PdfColors } = api;
  const arabic = Font.ttf(arabicFontBytes);
  const document = new Document({ compress, title: 'Text layout, bidi and Arabic - phase 7.3', author: 'Romulo Campos' });
  const ink = PdfColors.blueGrey900;
  const label = (text, size = 9, color = PdfColors.blueGrey700) => new Text(text, { style: new TextStyle({ fontSize: size, color }) });
  const arabicStyle = new TextStyle({ font: arabic, fontSize: 13, color: ink });
  const courier = new TextStyle({ font: Font.courier(), fontSize: 10, color: ink });
  const fallback = new TextStyle({ fontSize: 13, color: ink, fontFallback: [arabic] });
  const box = (width, child) => new Container({ width, padding: 6,
    decoration: new BoxDecoration({ color: '#f8fafc', border: Border.all({ color: '#cbd5e1', width: 0.5 }) }), child });
  const panel = (title, caption, ...children) => new Column({ mainAxisSize: 'min', crossAxisAlignment: 'start', gap: 5, children: [
    label(title, 12, PdfColors.indigo), label(caption), ...children
  ] });
  const pair = (left, right) => new Row({ crossAxisAlignment: 'start', gap: 18, children: [
    new SizedBox({ width: 256, child: left }), new SizedBox({ width: 256, child: right })
  ] });

  const spaced = new TextStyle({ font: Font.courier(), fontSize: 12, letterSpacing: 4, color: ink });
  const centred = new Container({ width: 240, height: 34, padding: 0,
    decoration: new BoxDecoration({ border: Border.all({ color: '#94a3b8', width: 0.5 }) }),
    child: new Column({ children: [
      new RichText({ textAlign: 'center', text: new TextSpan({ style: spaced, children: [
        new TextSpan({ text: 'AAA' }),
        new TextSpan({ text: 'BBB', style: new TextStyle({ color: PdfColors.red }) }),
        new TextSpan({ text: 'CCC', style: new TextStyle({ color: PdfColors.blue }) })
      ] }) }),
      new Text('AAABBBCCC', { style: spaced, textAlign: 'center' })
    ] })
  });

  document.addPage(new Page({ pageFormat: PageFormat.A4, margin: 32, build: () => new Column({
    crossAxisAlignment: 'start', gap: 14, children: [
      label('Text layout, bidi and Arabic / phase 7.3', 22, ink),
      label('Lines break on logical text and are reordered one at a time (UAX #9 rule L2). Shaping joins across spans.'),
      pair(
        panel('Wrapped RTL paragraph', 'Line 1 holds sentence 1 at its right edge. Before 7.3 the lines came out in reverse.',
          box(240, new Text(NUMBERED_ARABIC.join(' '), { style: arabicStyle, textDirection: 'rtl' }))),
        panel('Justified RTL', 'The first word is rightmost; only the last line stays unstretched, at the start.',
          box(240, new Text(NUMBERED_ARABIC.join(' '), { style: arabicStyle, textDirection: 'rtl', textAlign: 'justify' })))
      ),
      pair(
        panel('Latin inside RTL', 'An embedded LTR run keeps its order; a fallback Arabic run sits on the right.', box(240, new Column({
          crossAxisAlignment: 'start', gap: 4, children: [
            new Text('يدعم js_pdf الإصدار PDF 1.7 بدون أي مكتبات خارجية.', { style: arabicStyle, textDirection: 'rtl' }),
            new Text('مرحبا world', { style: fallback, textDirection: 'rtl' }),
            new Text('الهاتف \u2066+967-777-123456\u2069 للعميل', { style: arabicStyle, textDirection: 'rtl' })
          ] }))),
        panel('Arabic inside LTR', 'No textDirection is set: the fragment is still shaped and reversed.', box(240, new Column({
          crossAxisAlignment: 'start', gap: 4, children: [
            new Text('Total: مرحبا today', { style: fallback }),
            new RichText({ text: new TextSpan({ style: arabicStyle, children: [
              new TextSpan({ text: 'Split spans join: سل' }),
              new TextSpan({ text: 'ام', style: new TextStyle({ color: PdfColors.red }) }),
              new TextSpan({ text: ' (peace)' })
            ] }) })
          ] })))
      ),
      pair(
        panel('Soft hyphen and zero-width space', 'Wide: nothing invisible is drawn. Narrow: a hyphen appears only at a taken break.', new Row({
          crossAxisAlignment: 'start', gap: 8, children: [
            box(156, new Text('Bundes\u00adverfassungs\u00adgericht\nalpha\u200bbeta\u200bgamma\u200bdelta', { style: courier })),
            box(84, new Text('Bundes\u00adverfassungs\u00adgericht\nalpha\u200bbeta\u200bgamma\u200bdelta', { style: courier }))
          ] })),
        panel('No-break space and hyphen', 'Left: a space splits 10 / km. Right: U+00A0 keeps 10 km whole. Both break after a hyphen.', new Row({
          crossAxisAlignment: 'start', gap: 8, children: [
            box(72, new Text('It is 10 km away.\nLightning-fast', { style: courier })),
            box(72, new Text('It is 10\u00a0km away.\nLightning-fast', { style: courier }))
          ] }))
      ),
      pair(
        panel('Letter spacing, centred', 'Three spans and one span centre identically: one spacing per glyph, none after the last.', centred),
        panel('Separators the font lacks', 'Tab and em space draw as a space in Helvetica, never as ?.', box(200, new Column({
          crossAxisAlignment: 'start', children: [new Text('Tab:\tA\tB', { fontSize: 12 }), new Text('Em space:\u2003A\u2003B', { fontSize: 12 })]
        })))
      ),
      label('Arabic font: JsPdfArabicExample, a modified Noto Sans Arabic subset, SIL OFL 1.1. See examples/assets/THIRD-PARTY-NOTICES.md.', 8)
    ] }) }));
  return document.save();
}
