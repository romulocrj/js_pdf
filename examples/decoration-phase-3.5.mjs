/*
 * js_pdf phase 3.5 decoration example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generateDecorationPhase35() {
  const document = new pw.Document();
  document.addPage(new pw.Page({
    margin: 36,
    build: () => new pw.Column({
      gap: 18,
      children: [
        new pw.Text('Phase 3.5 — decoration', {
          style: new pw.TextStyle({ fontSize: 24, fontWeight: 'bold', color: '#17324d' })
        }),
        new pw.Container({
          height: 92,
          padding: 16,
          alignment: 'centerLeft',
          decoration: new pw.BoxDecoration({
            borderRadius: pw.BorderRadius.only({
              topLeft: pw.Radius.elliptical(28, 18),
              bottomRight: 20
            }),
            gradient: new pw.LinearGradient({
              begin: pw.Alignment.topLeft,
              end: pw.Alignment.bottomRight,
              colors: ['#0f766e', '#22c55e', '#facc15'],
              stops: [0, 0.58, 1]
            }),
            border: pw.Border.all({ color: '#064e3b', width: 1.5 }),
            boxShadow: [new pw.BoxShadow({
              color: '#0f172a',
              offset: { x: 5, y: 7 },
              blurRadius: 7,
              spreadRadius: 1,
              opacity: 0.3
            })]
          }),
          child: new pw.Text('rounded linear gradient + vector shadow', {
            style: new pw.TextStyle({ color: '#ffffff', fontSize: 14, fontWeight: 'bold' })
          })
        }),
        new pw.Row({
          gap: 18,
          children: [
            new pw.Expanded({
              child: new pw.Container({
                height: 130,
                alignment: 'center',
                decoration: new pw.BoxDecoration({
                  shape: 'circle',
                  gradient: new pw.RadialGradient({
                    focal: pw.Alignment.topLeft,
                    center: pw.Alignment.center,
                    radius: 0.68,
                    colors: ['#ffffff', '#60a5fa', '#1e3a8a'],
                    stops: [0, 0.45, 1]
                  }),
                  border: pw.Border.all({ color: '#172554', width: 2 })
                }),
                child: new pw.Text('radial', {
                  style: new pw.TextStyle({ color: '#ffffff', fontWeight: 'bold' })
                })
              })
            }),
            new pw.Expanded({
              child: new pw.Container({
                height: 130,
                padding: 14,
                alignment: 'center',
                decoration: new pw.BoxDecoration({
                  color: '#fff7ed',
                  border: new pw.Border({
                    top: new pw.BorderSide({ color: '#ea580c', width: 4 }),
                    right: new pw.BorderSide({ color: '#7c3aed', width: 2, style: 'dashed' }),
                    bottom: new pw.BorderSide({ color: '#16a34a', width: 4 }),
                    left: new pw.BorderSide({ color: '#0284c7', width: 2, style: 'dotted' })
                  })
                }),
                child: new pw.Text('four independent sides', {
                  align: 'center',
                  style: new pw.TextStyle({ color: '#431407', fontSize: 13 })
                })
              })
            })
          ]
        }),
        new pw.Container({
          height: 52,
          alignment: 'center',
          foregroundDecoration: new pw.BoxDecoration({
            borderRadius: pw.BorderRadius.all(10),
            border: pw.Border.all({ color: '#dc2626', width: 2, style: 'dashed' })
          }),
          child: new pw.Text('foreground border paints over its child')
        })
      ]
    })
  }));
  return document.save();
}
