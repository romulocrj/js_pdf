/*
 * js_pdf phase 3.6 stack, wrap, grid and partitions example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

function label(text, color, width = null) {
  return new pw.Container({
    width,
    height: 34,
    alignment: 'center',
    decoration: new pw.BoxDecoration({
      color,
      borderRadius: pw.BorderRadius.all(6),
      border: pw.Border.all({ color: '#334155', width: 0.6 })
    }),
    child: new pw.Text(text, {
      align: 'center',
      style: new pw.TextStyle({ fontSize: 10, color: '#ffffff', fontWeight: 'bold' })
    })
  });
}

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generateLayoutPhase36() {
  const document = new pw.Document();
  document.addPage(new pw.Page({
    margin: 36,
    build: () => new pw.Column({
      crossAxisAlignment: 'stretch',
      gap: 14,
      children: [
        new pw.Text('Phase 3.6 — stack, wrap, grid and partitions', {
          style: new pw.TextStyle({ fontSize: 21, fontWeight: 'bold', color: '#172554' })
        }),
        new pw.SizedBox({
          height: 112,
          child: new pw.Stack({
            alignment: 'center',
            children: [
              new pw.Container({
                decoration: new pw.BoxDecoration({
                  color: '#dbeafe',
                  borderRadius: pw.BorderRadius.all(12),
                  border: pw.Border.all({ color: '#2563eb' })
                })
              }),
              new pw.Positioned({ left: 18, top: 16, child: label('top / left', '#2563eb') }),
              new pw.Positioned({ right: 18, bottom: 16, child: label('bottom / right', '#7c3aed') }),
              new pw.Container({
                width: 150,
                height: 44,
                alignment: 'center',
                decoration: new pw.BoxDecoration({ color: '#ffffff', borderRadius: pw.BorderRadius.all(22) }),
                child: new pw.Text('non-positioned center')
              })
            ]
          })
        }),
        new pw.Wrap({
          spacing: 7,
          runSpacing: 7,
          alignment: 'spaceBetween',
          children: [
            label('Wrap 1', '#0f766e', 76),
            label('Wrap 2 wider', '#0d9488', 112),
            label('Wrap 3', '#14b8a6', 84),
            label('Wrap 4 wide item', '#0891b2', 138),
            label('Wrap 5', '#0284c7', 78)
          ]
        }),
        new pw.GridView({
          crossAxisCount: 4,
          crossAxisSpacing: 7,
          mainAxisSpacing: 7,
          childAspectRatio: 0.55,
          children: Array.from({ length: 8 }, (_, index) => label(
            `Grid ${index + 1}`,
            ['#dc2626', '#ea580c', '#ca8a04', '#65a30d'][index % 4]
          ))
        }),
        new pw.Partitions({
          children: [
            new pw.Partition({ width: 115, child: label('fixed 115', '#475569') }),
            new pw.Partition({ flex: 1, child: label('flex 1', '#64748b') }),
            new pw.Partition({ flex: 2, child: label('flex 2', '#334155') })
          ]
        })
      ]
    })
  }));
  return document.save();
}
