/*
 * js_pdf PR 15 review regression example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

/** One host-free proof for colour-alpha isolation, tspan opacity and directional margins. */
export function generateReviewPr15(api = defaultApi, compress = true) {
  const { Document, Page, PageFormat, Text, TextStyle, Column, Row, Container, SizedBox,
    BoxDecoration, Border, LinearGradient, Image, RawImage, SvgImage, Directionality,
    EdgeInsetsDirectional, Opacity, PdfColor, PdfColors } = api;
  const document = new Document({ compress, title: 'PR 15 review regressions', author: 'Romulo Campos' });
  const text = (value, size = 10) => new Text(value, { style: new TextStyle({ fontSize: size, color: PdfColors.blueGrey900 }) });
  const heading = value => text(value, 14);
  const panel = child => new Container({ padding: 10, decoration: new BoxDecoration({
    border: Border.all({ color: PdfColors.blueGrey200, width: 0.5 }) }), child });
  const image = new RawImage({ bytes: new Uint8Array([
    255, 180, 0, 255, 0, 140, 180, 255,
    0, 140, 180, 255, 255, 180, 0, 255
  ]), width: 2, height: 2 });
  const paints = () => new Row({ gap: 12, children: [
    // The background deliberately leaves /ca at zero before its image child.
    new Container({ color: new PdfColor(1, 0, 0, 0), child: new Image(image, { width: 72, height: 48, fit: 'fill' }) }),
    new Container({ width: 140, height: 48, decoration: new BoxDecoration({
      color: new PdfColor(1, 0, 0, 0),
      gradient: new LinearGradient({ colors: [PdfColors.teal, PdfColors.indigo] }) }) })
  ] });
  const margins = direction => new Directionality({ textDirection: direction, child: panel(new Column({
    mainAxisSize: 'min', crossAxisAlignment: 'start', gap: 6, children: [
      text(direction.toUpperCase()),
      new Row({ margin: EdgeInsetsDirectional.only({ start: 30 }), mainAxisSize: 'min', children: [
        new Container({ width: 90, height: 18, color: PdfColors.indigo200 })
      ] }),
      new Text('Text: start = 30', { margin: EdgeInsetsDirectional.only({ start: 30 }), fontSize: 9 }),
      new Column({ margin: EdgeInsetsDirectional.only({ start: 30 }), mainAxisSize: 'min', children: [
        new Container({ width: 90, height: 18, color: PdfColors.teal200 })
      ] })
    ]
  })) });
  document.addPage(new Page({ pageFormat: PageFormat.A4, margin: 36, background: PdfColors.white, build: () => new Column({
    mainAxisSize: 'min', crossAxisAlignment: 'start', gap: 12, children: [
      text('PR 15 / review regressions', 22),
      heading('A transparent background affects only its own fill'),
      panel(paints()),
      text('The image and gradient above are fully visible. Both used to disappear.'),
      panel(new Opacity({ opacity: 0.5, child: paints() })),
      text('The same paints under Opacity(0.5) keep that enclosing opacity.'),
      heading('Nested tspan opacity composes without leaking to siblings'),
      panel(new SvgImage({ width: 460, height: 50, svg: `<svg viewBox="0 0 460 50">
        <text x="0" y="20" font-size="14" fill="#334155">Opaque <tspan opacity="0.5">Half <tspan opacity="0.5">Quarter</tspan> Half</tspan><tspan opacity="0">HIDDEN</tspan> Opaque</text>
      </svg>` })),
      text('Read: Opaque, Half, Quarter, Half, Opaque. HIDDEN leaves space but draws nothing.'),
      heading('Row, Text and Column reserve a 30pt start margin'),
      new Row({ gap: 12, crossAxisAlignment: 'start', children: [
        new SizedBox({ width: 250, child: margins('ltr') }),
        new SizedBox({ width: 250, child: margins('rtl') })
      ] }),
      text('The inset is on the left in LTR and on the right in RTL, using the same inputs.')
    ]
  }) }));
  return document.save();
}
