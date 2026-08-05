/*
 * js_pdf phase 3.9 placeholders example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generatePlaceholdersPhase39() {
  const document = new pw.Document();
  document.addPage(new pw.Page({
    margin: 44,
    build: () => new pw.Column({
      crossAxisAlignment: 'stretch',
      gap: 18,
      children: [
        new pw.Text('Phase 3.9 — placeholders', {
          style: new pw.TextStyle({ fontSize: 24, fontWeight: 'bold', color: '#172554' })
        }),
        new pw.Row({
          mainAxisAlignment: 'spaceAround',
          children: [
            new pw.SizedBox({ width: 110, height: 110, child: new pw.PdfLogo({ color: '#dc2626' }) }),
            new pw.SizedBox({ width: 110, height: 110, child: new pw.FlutterLogo() }),
            new pw.SizedBox({
              width: 110,
              height: 110,
              child: new pw.Placeholder({ color: '#475569', strokeWidth: 1.5 })
            })
          ]
        }),
        new pw.Text('Deterministic LoremText', {
          style: new pw.TextStyle({ fontSize: 16, fontWeight: 'bold', color: '#7c3aed' })
        }),
        new pw.Paragraph({ text: new pw.LoremText().paragraph(55) }),
        new pw.Text('Lorem widget', {
          style: new pw.TextStyle({ fontSize: 16, fontWeight: 'bold', color: '#0f766e' })
        }),
        new pw.Lorem({ length: 45, textAlign: 'justify' })
      ]
    })
  }));
  return document.save();
}

