/*
 * js_pdf phase 3.10 clipping-widgets example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

function clippedCard(label, clip) {
  return new pw.Column({
    mainAxisSize: 'min',
    children: [
      new pw.SizedBox({
        width: 140,
        height: 110,
        child: clip(new pw.Stack({
          fit: 'expand',
          children: [
            new pw.Container({ background: '#dbeafe' }),
            new pw.Positioned({
              left: -25,
              top: 18,
              child: new pw.Container({ width: 190, height: 32, background: '#2563eb' })
            }),
            new pw.Positioned({
              right: -20,
              bottom: 10,
              child: new pw.Container({ width: 95, height: 70, background: '#7c3aed' })
            })
          ]
        }))
      }),
      new pw.SizedBox({ height: 8 }),
      new pw.Text(label, { style: new pw.TextStyle({ fontWeight: 'bold', color: '#334155' }) })
    ]
  });
}

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generateClippingPhase310() {
  const document = new pw.Document();
  document.addPage(new pw.Page({
    margin: 44,
    build: () => new pw.Column({
      crossAxisAlignment: 'stretch',
      gap: 28,
      children: [
        new pw.Text('Phase 3.10 — clipping widgets', {
          style: new pw.TextStyle({ fontSize: 24, fontWeight: 'bold', color: '#172554' })
        }),
        new pw.Row({
          mainAxisAlignment: 'spaceBetween',
          crossAxisAlignment: 'start',
          children: [
            clippedCard('ClipRect', child => new pw.ClipRect({ child })),
            clippedCard('ClipRRect', child => new pw.ClipRRect({
              horizontalRadius: 24,
              verticalRadius: 18,
              child
            })),
            clippedCard('ClipOval', child => new pw.ClipOval({ child }))
          ]
        }),
        new pw.Text(
          'Each q/W n/Q scope clips the same overflowing stack without mutating its layout result.',
          { style: new pw.TextStyle({ fontSize: 13, color: '#475569' }) }
        )
      ]
    })
  }));
  return document.save();
}

