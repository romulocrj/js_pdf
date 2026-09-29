/*
 * js_pdf font compatibility, PDF objects and API conveniences visual proofs.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

export function generateFontsPhase68(fonts, api = defaultApi) {
  const doc = new api.Document({ title: 'Font compatibility / phase 6.8' });
  const rows = [
    ['TrueType subset (default)', api.Font.ttf(fonts.ttf), 'Café — €  /  searchable Unicode'],
    ['Simple TrueType / WinAnsi (full font)', api.Font.ttf(fonts.ttf, { unicode: false }), 'Café — €  /  single-byte compatibility'],
    ['OpenType CFF / named glyphs', api.Font.ttf(fonts.cff), 'Café — € Ω  /  PostScript outlines'],
    ['OpenType CFF / CID-keyed glyphs', api.Font.ttf(fonts.cid), 'Café — € Ω  /  explicit CID mapping']
  ];
  doc.addPage(new api.Page({ margin: 32, build: () => new api.Column({ crossAxisAlignment: 'start', gap: 18, children: [
    new api.Text('Font compatibility / phase 6.8', { style: new api.TextStyle({ fontSize: 22 }) }),
    ...rows.map(([label,font,text]) => new api.Container({ padding: 12, background: '#eff6ff', child:
      new api.Column({ crossAxisAlignment: 'start', gap: 8, children: [new api.Text(label), new api.Text(text, { style: new api.TextStyle({ font, fontSize: 18 }) })] }) })),
    new api.Text('CFF embeds the supplied font in full. Simple TrueType is limited to WinAnsi; the Unicode subset remains the default.'),
    new api.Text('CFF specimens: renamed subsets of Adobe Source Sans 3, SIL OFL 1.1. These assets are separate from the library bundle.', { style: new api.TextStyle({ fontSize: 10 }) })
  ] }) }));
  return doc.save();
}

export function generateObjectsPhase610(api = defaultApi) {
  const doc = new api.Document({ title: 'Reusable forms and notes / phase 6.10' });
  const stamp = new api.PdfFormXObject({ width: 150, height: 44, paint: canvas => {
    canvas.fillRect(0,0,150,44,'#dbeafe'); canvas.strokeRect(0,0,150,44,'#1e40af',1);
    canvas.text('REUSABLE STAMP',10,14,{ fontSize: 12, color: '#1e40af' });
  } });
  for (let page=1;page<=2;page++) doc.addPage(new api.Page({ margin: 32, build: () => new api.Column({ crossAxisAlignment: 'start', gap: 20, children: [
    new api.Text(`PDF objects / phase 6.10 / page ${page}`, { style: new api.TextStyle({ fontSize: 22 }) }),
    new api.Text('The same form resource is placed twice on each page, at different sizes.'),
    new api.CustomPaint({ size: { x: 480, y: 100 }, painter: canvas => { canvas.drawForm(stamp,0,0); canvas.drawForm(stamp,190,0,225,66); } }),
    new api.TextAnnotation({ content: 'Review this reusable stamp. This is a real PDF text note.', author: 'js_pdf example', subject: 'Review',
      child: new api.Container({ padding: 12, background: '#fef3c7', child: new api.Text('A PDF note is attached to this box. Open it in a reader that supports annotations.') }) }),
    new api.Text('Annotation borders: solid, dashed, beveled, inset and underlined.'),
    new api.Row({ gap: 12, children: ['solid','dashed','beveled','inset','underlined'].map(style => new api.SquareAnnotation({
      color: '#1e40af', border: { width: 2, style, dash: style === 'dashed' ? [3,2] : null },
      child: new api.Container({ width: 88, height: 44, padding: 6, child: new api.Text(style, { style: new api.TextStyle({ fontSize: 10 }) }) }) })) })
  ] }) }));
  return doc.save();
}

export function generateApiPhase612(api = defaultApi) {
  const doc = new api.Document({ title: 'API conveniences / phase 6.12' });
  const format = api.PdfPageFormat.a5.landscape.copyWith({ marginTop: 24, marginLeft: 24 });
  const point = new api.LineChartValue(3, 7);
  doc.addPage(new api.Page({ pageFormat: format, build: () => new api.DefaultTextStyle({
    style: new api.TextStyle({ fontSize: 13, color: '#1e40af' }), child: new api.Column({ crossAxisAlignment: 'start', gap: 18, children: [
      new api.Text('API conveniences / phase 6.12'),
      api.DefaultTextStyle.merge({ style: new api.TextStyle({ fontSize: 23 }), child: new api.Text('Larger text, inherited blue') }),
      new api.Text('The parent style remains 13 pt.'),
      new api.Text(`PdfPageFormat: ${Math.round(format.width)} x ${Math.round(format.height)} pt, landscape.`),
      new api.Text(`LineChartValue: (${point.x}, ${point.y}), compatible with PointChartValue and ChartValue.`)
    ] }) }) }));
  return doc.save();
}
