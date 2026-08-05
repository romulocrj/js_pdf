/*
 * js_pdf phase 3.4 constraints and flex example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * This generator is synchronous and host-free for ClearScript V8 coverage.
 */

import * as pw from '../dist/js_pdf.mjs';

function panel(color, title, detail = '') {
  return new pw.Container({
    height: 72,
    padding: 10,
    background: color,
    child: new pw.Column({
      mainAxisSize: 'min',
      gap: 5,
      children: [
        new pw.Text(title, { fontSize: 14, color: '#ffffff' }),
        new pw.Text(detail, { fontSize: 8, color: '#ffffff' })
      ]
    })
  });
}

export function generateFlexLayoutPhase34() {
  return pw.createPdf({ title: 'Phase 3.4 — full flex and constraints' }, () => new pw.Page({
    margin: 36,
    build: () => new pw.Column({
      mainAxisSize: 'min',
      gap: 16,
      children: [
        new pw.Text('Phase 3.4 · Full flex and BoxConstraints', {
          fontSize: 22,
          color: '#172554'
        }),
        new pw.Text(
          'Expanded · Flexible · Spacer · alignment · tight/loose constraints · overflow',
          { fontSize: 10, color: '#475569' }
        ),
        new pw.Divider({ thickness: 2, color: '#2563eb' }),
        new pw.SizedBox({
          height: 90,
          child: new pw.Row({
            crossAxisAlignment: 'stretch',
            gap: 10,
            children: [
              new pw.Expanded({
                child: panel('#2563eb', 'Expanded · 1', 'one third of free width')
              }),
              new pw.Expanded({
                flex: 2,
                child: panel('#0f766e', 'Expanded · 2', 'two thirds of free width')
              })
            ]
          })
        }),
        new pw.SizedBox({
          height: 86,
          child: new pw.Row({
            mainAxisAlignment: 'spaceEvenly',
            crossAxisAlignment: 'center',
            children: [
              new pw.SizedBox({ width: 82, child: panel('#7c3aed', 'start') }),
              new pw.SizedBox({ width: 82, child: panel('#db2777', 'space') }),
              new pw.SizedBox({ width: 82, child: panel('#ea580c', 'evenly') })
            ]
          })
        }),
        new pw.Container({
          height: 82,
          padding: 10,
          background: '#e0f2fe',
          borderColor: '#0284c7',
          child: new pw.Row({
            crossAxisAlignment: 'stretch',
            children: [
              new pw.ConstrainedBox({
                constraints: new pw.BoxConstraints({ minWidth: 150, minHeight: 42 }),
                child: new pw.Container({
                  padding: 8,
                  background: '#0369a1',
                  child: new pw.Text('ConstrainedBox ≥ 150 pt', {
                    fontSize: 10,
                    color: '#ffffff'
                  })
                })
              }),
              new pw.Spacer(1),
              new pw.Flexible({
                flex: 2,
                fit: 'loose',
                child: new pw.Container({
                  width: 170,
                  padding: 8,
                  background: '#38bdf8',
                  child: new pw.Text('Flexible.loose uses only what it needs', {
                    fontSize: 9,
                    color: '#082f49'
                  })
                })
              })
            ]
          })
        }),
        new pw.Container({
          height: 90,
          background: '#f8fafc',
          borderColor: '#94a3b8',
          child: new pw.OverflowBox({
            alignment: 'center',
            minWidth: 360,
            maxWidth: 360,
            minHeight: 54,
            maxHeight: 54,
            child: new pw.Container({
              width: 360,
              height: 54,
              padding: 10,
              background: '#fef3c7',
              borderColor: '#d97706',
              child: new pw.Text('OverflowBox: child constraints are independent', {
                fontSize: 11,
                color: '#78350f',
                align: 'center'
              })
            })
          })
        })
      ]
    })
  }));
}
