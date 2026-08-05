/*
 * js_pdf phase 3.3 basic-widget example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * This generator is synchronous and host-free for ClearScript V8 coverage.
 */

import * as pw from '../dist/js_pdf.mjs';

function card(color, title, detail) {
  return new pw.Container({
    width: 235,
    height: 74,
    padding: 12,
    background: color,
    borderColor: '#243047',
    child: new pw.Column({
      gap: 6,
      children: [
        new pw.Text(title, { fontSize: 16, color: '#ffffff' }),
        new pw.Text(detail, { fontSize: 9, color: '#ffffff' })
      ]
    })
  });
}

export function generateBasicWidgetsPhase33() {
  const pageTheme = new pw.PageTheme({
    margin: 36,
    buildBackground: () => new pw.FullPage({
      ignoreMargins: true,
      child: new pw.Container({
        width: pw.PageFormat.A4.width,
        height: pw.PageFormat.A4.height,
        background: '#eef2f7'
      })
    })
  });

  return pw.createPdf({ title: 'Phase 3.3 — basic widgets' }, () => new pw.Page({
    pageTheme,
    build: () => new pw.Padding({
      padding: 10,
      child: new pw.Column({
        gap: 14,
        children: [
          new pw.Builder({
            builder: () => new pw.Text('Phase 3.3 · Basic composition widgets', {
              fontSize: 22,
              color: '#172033'
            })
          }),
          new pw.Text(
            'Transform · Opacity · FittedBox · AspectRatio · FullPage · builders · custom paint',
            { fontSize: 10, color: '#4f5d75' }
          ),
          new pw.Divider({ thickness: 2, color: '#4464ad' }),
          new pw.Row({
            gap: 14,
            children: [
              new pw.Transform({
                rotateBox: -0.045,
                child: card('#4464ad', 'Transform', 'rotation with adjusted layout bounds')
              }),
              new pw.Opacity({
                opacity: 0.58,
                child: card('#d1495b', 'Opacity', 'scoped ExtGState alpha')
              })
            ]
          }),
          new pw.Row({
            gap: 14,
            children: [
              new pw.SizedBox({
                width: 235,
                height: 100,
                child: new pw.FittedBox({
                  fit: 'contain',
                  child: new pw.Container({
                    width: 360,
                    height: 110,
                    padding: 18,
                    background: '#2a9d8f',
                    child: new pw.Text('FittedBox · contain', {
                      fontSize: 18,
                      color: '#ffffff'
                    })
                  })
                })
              }),
              new pw.SizedBox({
                width: 235,
                height: 100,
                child: new pw.AspectRatio({
                  aspectRatio: 2.35,
                  child: new pw.Container({
                    background: '#f4a261',
                    borderColor: '#243047',
                    child: new pw.Center({
                      child: new pw.Text('AspectRatio 2.35', {
                        fontSize: 15,
                        color: '#172033'
                      })
                    })
                  })
                })
              })
            ]
          }),
          new pw.LayoutBuilder({
            builder: (_context, constraints) => new pw.Container({
              height: 42,
              padding: 10,
              background: '#dbe7ff',
              borderColor: '#4464ad',
              child: new pw.Text(
                `LayoutBuilder received ${constraints.maxWidth.toFixed(1)} pt`,
                { fontSize: 11, color: '#172033' }
              )
            })
          }),
          new pw.CustomPaint({
            size: { x: 500, y: 120 },
            painter: canvas => {
              canvas.setFillColor('#172033');
              canvas.drawRRect(0, 0, 500, 120, 12, 12);
              canvas.fillPath();
              canvas.setStrokeColor('#7ee8fa');
              canvas.setLineWidth(3);
              canvas.drawLine(25, 92, 130, 30);
              canvas.drawLine(130, 30, 235, 78);
              canvas.drawLine(235, 78, 340, 22);
              canvas.drawLine(340, 22, 475, 62);
              canvas.strokePath();
            },
            child: new pw.Padding({
              padding: 16,
              child: new pw.Text('CustomPaint: background → child → foreground', {
                fontSize: 13,
                color: '#ffffff'
              })
            }),
            foregroundPainter: canvas => {
              canvas.setStrokeColor('#ffffff');
              canvas.setLineWidth(1);
              canvas.drawRect(8, 8, 484, 104);
              canvas.strokePath();
            }
          }),
          new pw.Row({
            gap: 12,
            children: [
              new pw.Text('VerticalDivider', { fontSize: 11, color: '#172033' }),
              new pw.SizedBox({
                width: 10,
                height: 40,
                child: new pw.VerticalDivider({
                  width: 10,
                  thickness: 2,
                  color: '#d1495b'
                })
              }),
              new pw.LimitedBox({
                maxWidth: 330,
                maxHeight: 48,
                child: new pw.Container({
                  padding: 10,
                  background: '#ffffff',
                  borderColor: '#9aa7bd',
                  child: new pw.Text('LimitedBox keeps unbounded composition finite.', {
                    fontSize: 10,
                    color: '#172033'
                  })
                })
              })
            ]
          })
        ]
      })
    })
  }));
}
