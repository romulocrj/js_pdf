/*
 * js_pdf phase 3.2 spanning-table example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * This generator is synchronous and host-free for ClearScript V8 coverage.
 */

import * as pw from '../dist/js_pdf.mjs';

const rows = Array.from({ length: 82 }, (_, index) => [
  String(index + 1),
  `Paginated record ${index + 1}`,
  index % 4 === 0 ? 'Pending' : 'Complete',
  (42.75 + index * 3.25).toFixed(2)
]);

export function generateTableSpanningPhase32() {
  const table = pw.TableHelper.fromTextArray({
    headers: ['ID', 'Record', 'State', 'Amount'],
    data: rows,
    cellPadding: 6,
    headerHeight: 26,
    cellHeight: 22,
    headerDecoration: { color: '#0f766e' },
    oddRowDecoration: { color: '#f0fdfa' },
    border: pw.TableBorder.all({ color: '#99f6e4', width: 0.6 }),
    columnWidths: {
      0: new pw.FixedColumnWidth(42),
      1: new pw.FlexColumnWidth(3),
      2: new pw.FlexColumnWidth(1.4),
      3: new pw.FixedColumnWidth(70)
    }
  });

  return pw.createPdf({ title: 'Phase 3.2 — spanning tables' }, () => new pw.MultiPage({
    margin: 34,
    gap: 10,
    maxPages: 10,
    header: context => new pw.Row({
      widths: [3, 1],
      children: [
        new pw.Text('PHASE 3.2 · IMMUTABLE TABLE CONTINUATION', {
          fontSize: 11,
          color: '#115e59'
        }),
        new pw.Text(`Page ${context.pageNumber}`, {
          fontSize: 10,
          align: 'right',
          color: '#64748b'
        })
      ]
    }),
    footer: context => new pw.Text(`Fragment ${context.pageNumber}`, {
      fontSize: 9,
      align: 'center',
      color: '#64748b'
    }),
    build: () => [table]
  }));
}
