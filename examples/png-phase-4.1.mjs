/*
 * js_pdf phase 4.1 PNG decoder example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

// A 12×12 RGBA PNG. Keeping the complete file in this module proves that the
// decoder and DEFLATE implementation need no asset loader in either runtime.
const PNG = Uint8Array.from([
  137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,12,0,0,0,12,8,6,0,0,0,86,117,92,231,
  0,0,0,79,73,68,65,84,120,156,99,224,23,215,210,32,5,51,128,8,213,228,215,151,18,150,254,202,
  195,135,65,106,224,26,96,2,248,20,131,104,20,13,48,137,175,243,184,255,35,99,100,131,48,52,
  192,20,32,43,6,209,120,53,192,20,34,107,164,174,6,146,156,68,146,167,73,10,86,146,35,142,20,
  12,0,195,243,8,164,24,21,223,205,0,0,0,0,73,69,78,68,174,66,96,130
]);

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generatePngPhase41() {
  const image = pw.PdfImage.fromPng(PNG);
  const document = new pw.Document();
  document.addPage(new pw.Page({
    margin: 48,
    build: () => new pw.Column({
      crossAxisAlignment: 'stretch',
      gap: 22,
      children: [
        new pw.Text('Phase 4.1 — pure PNG decoder', {
          style: new pw.TextStyle({ fontSize: 24, fontWeight: 'bold', color: '#172554' })
        }),
        new pw.Text(
          'The embedded RGBA file is inflated, unfiltered and split into RGB + soft-mask streams entirely in ECMAScript.',
          { style: new pw.TextStyle({ fontSize: 13, color: '#475569' }) }
        ),
        new pw.Center({
          child: new pw.Container({
            width: 300,
            height: 300,
            padding: 18,
            decoration: new pw.BoxDecoration({
              color: '#e2e8f0',
              border: pw.Border.all({ color: '#334155', width: 2 }),
              borderRadius: pw.BorderRadius.circular(18)
            }),
            child: new pw.CustomPaint({
              size: { x: 264, y: 264 },
              painter: canvas => canvas.drawImage(image, 0, 0, 264, 264)
            })
          })
        }),
        new pw.Text(`${image.sourceWidth} × ${image.sourceHeight} RGBA · alpha soft mask`, {
          textAlign: 'center',
          style: new pw.TextStyle({ fontSize: 12, fontWeight: 'bold', color: '#1e3a8a' })
        })
      ]
    })
  }));
  return document.save();
}
