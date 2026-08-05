/*
 * js_pdf phase 4.3 image widget and provider example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

// A complete 12x12 RGBA PNG kept inline so this phase proof remains host-free
// under both Node and bare V8.
const PNG = Uint8Array.from([
  137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,12,0,0,0,12,8,6,0,0,0,86,117,92,231,
  0,0,0,79,73,68,65,84,120,156,99,224,23,215,210,32,5,51,128,8,213,228,215,151,18,150,254,202,
  195,135,65,106,224,26,96,2,248,20,131,104,20,13,48,137,175,243,184,255,35,99,100,131,48,52,
  192,20,32,43,6,209,120,53,192,20,34,107,164,174,6,146,156,68,146,167,73,10,86,146,35,142,20,
  12,0,195,243,8,164,24,21,223,205,0,0,0,0,73,69,78,68,174,66,96,130
]);

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generateImagePhase43() {
  const provider = new pw.MemoryImage(PNG);
  const document = new pw.Document();

  document.addPage(new pw.Page({
    margin: 48,
    build: () => new pw.Column({
      crossAxisAlignment: 'stretch',
      gap: 20,
      children: [
        new pw.Text('Phase 4.3 - Image widget and MemoryImage provider', {
          style: new pw.TextStyle({ fontSize: 24, fontWeight: 'bold', color: '#172554' })
        }),
        new pw.Text(
          'The widget uses BoxFit.cover and clipping while the provider resolves bytes to a reusable image resource.',
          { style: new pw.TextStyle({ fontSize: 13, color: '#475569' }) }
        ),
        new pw.Row({
          mainAxisAlignment: 'spaceAround',
          children: [
            new pw.Container({
              width: 220,
              height: 120,
              padding: new pw.EdgeInsets(8),
              decoration: new pw.BoxDecoration({
                color: '#eff6ff',
                border: pw.Border.all({ color: '#1d4ed8', width: 2 }),
                borderRadius: pw.BorderRadius.circular(10)
              }),
              child: new pw.Image(provider, {
                fit: 'cover',
                alignment: 'topCenter',
                width: 204,
                height: 104
              })
            }),
            new pw.Container({
              width: 120,
              height: 120,
              decoration: new pw.BoxDecoration({
                color: '#ecfeff',
                border: pw.Border.all({ color: '#0891b2', width: 2 }),
                shape: 'circle'
              }),
              padding: new pw.EdgeInsets(8),
              child: new pw.ClipOval({
                child: new pw.Image(provider, {
                  fit: 'cover',
                  width: 104,
                  height: 104
                })
              })
            })
          ]
        }),
        new pw.Text(`${provider.width} x ${provider.height} PNG via MemoryImage`, {
          textAlign: 'center',
          style: new pw.TextStyle({ fontSize: 12, fontWeight: 'bold', color: '#1e3a8a' })
        })
      ]
    })
  }));

  return document.save();
}