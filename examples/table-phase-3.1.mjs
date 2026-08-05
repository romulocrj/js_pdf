/*
 * js_pdf phase 3.1 table example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * This generator is synchronous and host-free for ClearScript V8 coverage.
 */

import * as pw from '../dist/js_pdf.mjs';

const rows = Array.from({ length: 18 }, (_, index) => [
  String(index + 1).padStart(2, '0'),
  `Item ${index + 1}`,
  index % 3 === 0 ? 'Review' : 'Ready',
  (125 + index * 17.5).toFixed(2)
]);

export function generateTablePhase31() {
  const table = pw.TableHelper.fromTextArray({
    headers: ['#', 'Description', 'Status', 'Value'],
    data: rows,
    cellPadding: 7,
    headerHeight: 28,
    cellHeight: 24,
    headerDecoration: { color: '#1d4ed8' },
    oddRowDecoration: { color: '#eff6ff' },
    border: pw.TableBorder.all({ color: '#93c5fd', width: 0.7 }),
    columnWidths: {
      0: new pw.FixedColumnWidth(42),
      1: new pw.FlexColumnWidth(3),
      2: new pw.FlexColumnWidth(1.4),
      3: new pw.FixedColumnWidth(72)
    },
    cellAlignments: { 0: 'center', 2: 'center', 3: 'centerRight' },
    headerAlignments: { 0: 'center', 2: 'center', 3: 'centerRight' }
  });

  return pw.createPdf({ title: 'Phase 3.1 — tables' }, () => new pw.Page({
    margin: 38,
    build: () => new pw.Column({
      gap: 14,
      children: [
        new pw.Text('Phase 3.1 · Tables', { fontSize: 22, color: '#172554' }),
        new pw.Text('Fixed and flexible tracks, decorations, alignment and borders.', {
          fontSize: 10,
          color: '#475569'
        }),
        table
      ]
    })
  }));
}
