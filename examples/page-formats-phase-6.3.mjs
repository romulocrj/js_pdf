/*
 * js_pdf page clipping and paper formats phase 6.3 visual example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as pw from '../dist/js_pdf.mjs';

const text = (value, size = 11) => new pw.Text(value, {
  style: new pw.TextStyle({ fontSize: size, color: '#172554' })
});

// Deliberately paints past its measured box: clipping must contain the band.
class Band extends pw.Widget {
  layout(_context, constraints) {
    return { widget: this, width: constraints.maxWidth, height: 32, data: null };
  }
  paint(context, box) {
    context.canvas.fillRect(box.x - 60, box.y, box.width + 120, box.height, '#38bdf8');
  }
}

class Guide extends pw.Widget {
  layout(_context, constraints) {
    return { widget: this, width: constraints.maxWidth, height: constraints.maxHeight, data: null };
  }
  paint(context, box) {
    context.canvas.strokeRect(24, 24, box.width - 48, box.height - 48, '#2563eb', 1);
  }
}

const background = context => new pw.Container({
  width: context.pageFormat.width, height: context.pageFormat.height, background: '#eff6ff'
});

export function generatePageFormatsPhase63() {
  const pdf = new pw.Document({ title: 'Page clipping and formats - phase 6.3', author: 'Romulo Campos' });
  for (const clip of [false, true]) {
    pdf.addPage(new pw.Page({ pageTheme: new pw.PageTheme({
      pageFormat: pw.PageFormat.A5, margin: 24, clip,
      buildBackground: background, buildForeground: () => new Guide()
    }), build: () => new pw.Column({ gap: 16, children: [
      text(`A5 / clip ${clip ? 'ON' : 'OFF'}`, 24),
      text('The blue band paints beyond its layout box. Compare both pages: clip ON keeps the band and pale background inside the 24 pt margins.'),
      new Band(),
      text('The blue outline marks the content area. Page clipping changes paint, not layout or pagination.'),
      text('Paper presets', 17),
      ...['A3', 'A4', 'A5', 'A6', 'LETTER', 'LEGAL'].map(name => {
        const format = pw.PageFormat[name];
        return text(`${name}: ${format.width.toFixed(2)} x ${format.height.toFixed(2)} pt`);
      })
    ] }) }));
  }
  pdf.addPage(new pw.Page({ pageTheme: new pw.PageTheme({
    pageFormat: pw.PageFormat.A6, orientation: 'landscape', clip: true,
    margin: { left: 16, top: 24, right: 32, bottom: 40 }, buildBackground: background
  }), build: () => new pw.Column({ gap: 14, children: [
    text('A6 / landscape', 22),
    text('Asymmetric margins rotate with the paper: left 40, top 16, right 24, bottom 32 pt.'),
    new Band(), text('The band stops at the rotated left and right margins.')
  ] }) }));

  pdf.addPage(new pw.MultiPage({ pageTheme: new pw.PageTheme({
    pageFormat: pw.PageFormat.A6, margin: 24, clip: true, buildBackground: background
  }), gap: 12,
  header: context => text(`MultiPage / ${context.pageNumber} of ${context.pagesCount}`, 15),
  footer: () => text('A6 / clipped page layers', 9),
  build: () => [
    text('Page one: content, header, footer and background share the page margin clip.'),
    new Band(), new pw.NewPage(),
    text('Page two: the clip is applied again after a page break.'), new Band()
  ] }));

  for (const name of ['ROLL57', 'ROLL80']) {
    pdf.addPage(new pw.Page({ pageTheme: new pw.PageTheme({
      pageFormat: pw.PageFormat[name], clip: true, buildBackground: background
    }), build: () => new pw.Column({ mainAxisSize: 'min', gap: 10, children: [
      text(name, 19), text('Content-sized receipt', 10),
      new pw.Divider(), text('Coffee       4.00'), text('Bread        3.50'),
      text('Total        7.50', 14), new pw.Divider(),
      text('The paper ends after this message plus its 5 mm bottom margin.', 9)
    ] }) }));
  }
  pdf.addPage(new pw.Page({ pageFormat: pw.PageFormat.UNDEFINED,
    build: () => new pw.Container({ width: 240, padding: 16, background: '#dbeafe',
      child: new pw.Column({ mainAxisSize: 'min', gap: 8, children: [
        text('UNDEFINED / fitted label', 16), text('Both paper dimensions follow this content. No implicit 40 pt margin.')
      ] }) })
  }));
  return pdf.save();
}
