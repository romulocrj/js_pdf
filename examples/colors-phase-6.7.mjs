/*
 * js_pdf color values and device spaces phase 6.7 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

export function generateColorsPhase67(api = defaultApi, compress = true) {
  const { Document, Page, PageFormat, Text, TextStyle, Column, Row, Container,
    BoxDecoration, LinearGradient, SizedBox, PdfColor, PdfColorGrey, PdfColorCmyk,
    PdfColorHsv, PdfColorHsl, PdfColors } = api;
  const document = new Document({ compress, title: 'Color values and device spaces', author: 'Romulo Campos' });
  const label = text => new Text(text, { style: new TextStyle({ fontSize: 10, color: PdfColors.blueGrey800 }) });
  const swatch = (color, text) => new Column({ mainAxisSize: 'min', gap: 5, children: [
    new Container({ width: 75, height: 32, decoration: new BoxDecoration({ color }) }), label(text)
  ] });
  const section = (title, items) => new Column({ mainAxisSize: 'min', gap: 8, children: [
    new Text(title, { style: new TextStyle({ fontSize: 14, color: PdfColors.blueGrey900 }) }),
    new Row({ gap: 10, children: items })
  ] });
  document.addPage(new Page({ pageFormat: PageFormat.A4, margin: 32,
    build: () => new Column({ mainAxisSize: 'min', gap: 18, children: [
      new Text('Color values / phase 6.7', { style: new TextStyle({ fontSize: 24, color: PdfColors.indigo }) }),
      label('RGB, DeviceGray and DeviceCMYK are retained in solid PDF painting.'),
      section('Device spaces', [swatch(new PdfColor(0.1,0.5,0.8), 'RGB'), swatch(new PdfColorGrey(0.25), 'Gray 25%'),
        swatch(new PdfColorCmyk(1,0,0,0), 'CMYK cyan'), swatch(new PdfColorCmyk(0,1,0,0), 'CMYK magenta'),
        swatch(new PdfColorCmyk(0,0,0,1), 'CMYK black')]),
      section('Named Material palette', [PdfColors.red, PdfColors.amber, PdfColors.green, PdfColors.blue, PdfColors.deepPurple]
        .map((color, i) => swatch(color, ['red','amber','green','blue','deepPurple'][i]))),
      section('Conversions and painter mixing', [swatch(new PdfColorHsv(30,1,1), 'HSV 30'),
        swatch(new PdfColorHsl(180,1,0.5), 'HSL 180'), swatch(PdfColor.fromRYB(1,1,0), 'RYB orange'),
        swatch(PdfColor.fromHex('#369').toCmyk(), 'RGB to CMYK'), swatch(new PdfColor(0,0,0).toHsl(), 'Black to HSL')]),
      section('Alpha flattened over white', [0.2,0.4,0.6,0.8,1].map(alpha =>
        swatch(PdfColors.red.withAlpha(alpha).flatten(), `alpha ${alpha}`))),
      label('Color alpha is a value. Use flatten() or an Opacity widget for painting.'),
      new Text('RGB gradient from color values', { style: new TextStyle({ fontSize: 14 }) }),
      new Container({ height: 45, decoration: new BoxDecoration({
        gradient: new LinearGradient({ colors: [PdfColors.indigo, PdfColors.cyan, PdfColors.lime] })
      }), child: new SizedBox({ width: 480 }) }),
      label('Gradients, SVG filters and outline colors convert to RGB. Device CMYK is not an ICC print profile.')
    ] })
  }));
  return document.save();
}
