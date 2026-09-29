/*
 * js_pdf pie full-circle phase 6.2 visual regression example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

function panel(title, caption, value, innerRadius, partial = false) {
  const datasets = [new pw.PieDataSet({
    value, innerRadius, color: '#2563eb', drawBorder: true,
    borderColor: '#172554', borderWidth: 1, offset: 12,
    legend: partial ? '75%' : '100%', legendPosition: 'inside'
  })];
  if (partial) datasets.push(new pw.PieDataSet({
    value: 25, innerRadius, color: '#f59e0b', drawBorder: true,
    borderColor: '#172554', borderWidth: 1, offset: 12,
    legend: '25%', legendPosition: 'inside'
  }));
  return new pw.Container({ width: 245, child: new pw.Column({ gap: 7, children: [
    new pw.Text(title, { style: new pw.TextStyle({ fontSize: 13, color: '#172554', fontWeight: 'bold' }) }),
    new pw.SizedBox({ width: 240, height: 155,
      child: new pw.Chart({ grid: new pw.PieGrid(), datasets }) }),
    new pw.Text(caption, { style: new pw.TextStyle({ fontSize: 10, color: '#475569' }) })
  ] }) });
}

/** A single value of 75 exercises rounding in PieGrid's angle calculation. */
export function generatePieFullCirclePhase62() {
  const pdf = new pw.Document({ title: 'Pie full circles - phase 6.2', author: 'Romulo Campos' });
  pdf.addPage(new pw.Page({ orientation: 'landscape', margin: 32, build: () => new pw.Column({ gap: 16, children: [
    new pw.Text('Pie and donut: complete circles', {
      style: new pw.TextStyle({ fontSize: 23, color: '#172554' })
    }),
    new pw.Text('Compare the first two columns: both must show a closed, centered shape without a radial seam. The third column must retain separated slices.', {
      style: new pw.TextStyle({ fontSize: 11, color: '#475569' })
    }),
    new pw.Row({ gap: 12, children: [
      panel('Exact circle / value 1', 'One category fills the entire pie.', 1, 0),
      panel('Rounded circle / value 75', 'Same complete pie, despite angle rounding.', 75, 0),
      panel('Partial slices / 75 + 25', 'Two categories remain visibly separated.', 75, 0, true)
    ] }),
    new pw.Row({ gap: 12, children: [
      panel('Exact donut / value 1', 'The hole stays open and centered.', 1, 30),
      panel('Rounded donut / value 75', 'No seam or displaced ring.', 75, 30),
      panel('Partial donut / 75 + 25', 'The partial arcs keep their offsets.', 75, 30, true)
    ] })
  ] }) }));
  return pdf.save();
}
