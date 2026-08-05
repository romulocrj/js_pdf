/*
 * js_pdf port of demo/lib/examples/certificate.dart from dart_pdf.
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';
import { customData, requireFeatures } from './upstream-example-helpers.mjs';

export function generateCertificate(pageFormat = pw.PageFormat.A4, data = customData, resources = {}) {
  requireFeatures(pw, 'certificate', [
    'Border', 'BoxDecoration', 'Divider', 'EdgeInsets', 'Font',
    'LoremText', 'Padding', 'PageTheme', 'Positioned', 'RichText', 'SizedBox',
    'Stack', 'SvgImage', 'TextSpan', 'TextStyle', 'ThemeData'
  ]);

  const lorem = new pw.LoremText();
  const pdf = new pw.Document();
  const theme = pw.ThemeData.withFont({
    base: pw.Font.ttf(resources.libreBaskerville),
    italic: pw.Font.ttf(resources.libreBaskervilleItalic),
    bold: pw.Font.ttf(resources.libreBaskervilleBold)
  });

  const flipX = child => new pw.Transform({ transform: [-1, 0, 0, 1, 0, 0], adjustLayout: true, child });
  const flipY = child => new pw.Transform({ transform: [1, 0, 0, -1, 0, 0], adjustLayout: true, child });
  const flipBoth = child => new pw.Transform({ transform: [-1, 0, 0, -1, 0, 0], adjustLayout: true, child });

  pdf.addPage(
    new pw.Page({
      pageTheme: new pw.PageTheme({
        pageFormat,
        theme,
        buildBackground: () => new pw.FullPage({
          ignoreMargins: true,
          child: new pw.Container({
            margin: new pw.EdgeInsets({ all: 10 }),
            decoration: new pw.BoxDecoration({ border: pw.Border.all({ color: '#ffe435', width: 1 }) }),
            child: new pw.Container({
              margin: new pw.EdgeInsets({ all: 5 }),
              decoration: new pw.BoxDecoration({ border: pw.Border.all({ color: '#ffe435', width: 5 }) }),
              width: Infinity,
              height: Infinity,
              child: new pw.Stack({
                alignment: 'center',
                children: [
                  new pw.Positioned({ top: 5, child: new pw.SvgImage({ svg: resources.swirls1Svg, height: 60 }) }),
                  new pw.Positioned({ bottom: 5, child: flipY(new pw.SvgImage({ svg: resources.swirls1Svg, height: 60 })) }),
                  new pw.Positioned({ top: 5, left: 5, child: new pw.SvgImage({ svg: resources.swirls3Svg, height: 160 }) }),
                  new pw.Positioned({ top: 5, right: 5, child: flipX(new pw.SvgImage({ svg: resources.swirls3Svg, height: 160 })) }),
                  new pw.Positioned({ bottom: 5, left: 5, child: flipY(new pw.SvgImage({ svg: resources.swirls3Svg, height: 160 })) }),
                  new pw.Positioned({ bottom: 5, right: 5, child: flipBoth(new pw.SvgImage({ svg: resources.swirls3Svg, height: 160 })) }),
                  new pw.Padding({
                    padding: new pw.EdgeInsets({ top: 120, left: 80, right: 80, bottom: 80 }),
                    child: new pw.SvgImage({ svg: resources.garlandSvg })
                  })
                ]
              })
            })
          })
        })
      }),
      build: () => new pw.Column({
        children: [
          new pw.Spacer(2),
          new pw.RichText({
            text: new pw.TextSpan({
              style: new pw.TextStyle({ fontWeight: 'bold', fontSize: 25 }),
              children: [
                new pw.TextSpan({ text: 'CERTIFICATE ' }),
                new pw.TextSpan({ text: 'of', style: new pw.TextStyle({ fontStyle: 'italic', fontWeight: 'normal' }) }),
                new pw.TextSpan({ text: ' ACHIEVEMENT' })
              ]
            })
          }),
          new pw.Spacer(),
          new pw.Text('THIS ACKNOWLEDGES THAT', {
            style: new pw.TextStyle({ font: pw.Font.ttf(resources.robotoLight), fontSize: 10, letterSpacing: 2, wordSpacing: 2 })
          }),
          new pw.SizedBox({ width: 300, child: new pw.Divider({ color: '#9e9e9e', thickness: 1.5 }) }),
          new pw.Text(data.name, { align: 'center', style: new pw.TextStyle({ fontWeight: 'bold', fontSize: 20 }) }),
          new pw.SizedBox({ width: 300, child: new pw.Divider({ color: '#9e9e9e', thickness: 1.5 }) }),
          new pw.Text('HAS SUCCESSFULLY COMPLETED THE', {
            style: new pw.TextStyle({ font: pw.Font.ttf(resources.robotoLight), fontSize: 10, letterSpacing: 2, wordSpacing: 2 })
          }),
          new pw.SizedBox({ height: 10 }),
          new pw.Row({
            mainAxisAlignment: 'center',
            children: [
              new pw.SvgImage({ svg: resources.swirlsSvg, height: 10 }),
              new pw.Padding({
                padding: new pw.EdgeInsets({ horizontal: 10 }),
                child: new pw.Text('Flutter PDF Demo', { style: new pw.TextStyle({ fontSize: 10 }) })
              }),
              flipX(new pw.SvgImage({ svg: resources.swirlsSvg, height: 10 }))
            ]
          }),
          new pw.Spacer(),
          new pw.SvgImage({ svg: resources.swirls2Svg, width: 150 }),
          new pw.Spacer(),
          new pw.Row({
            crossAxisAlignment: 'start',
            children: [
              new pw.Flexible({
                child: new pw.Text(lorem.paragraph(40), {
                  style: new pw.TextStyle({ fontSize: 6 }),
                  align: 'justify'
                })
              }),
              new pw.SizedBox({ width: 100 }),
              new pw.SvgImage({ svg: resources.medailSvg, width: 100 })
            ]
          })
        ]
      })
    })
  );

  return pdf.save();
}
