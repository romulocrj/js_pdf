/*
 * js_pdf progress phase 5.5 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as Pdf from '../dist/js_pdf.mjs';

const ink = '#172554';
const muted = '#475569';
const border = '#cbd5e1';
const panel = '#f8fafc';
const blue = '#2563eb';
const green = '#10b981';
const amber = '#f59e0b';

function label(text) {
  return new Pdf.Text(text, { style: new Pdf.TextStyle({ fontSize: 8, color: muted }) });
}

function card(title, subtitle, child) {
  return new Pdf.Container({
    padding: 14,
    decoration: new Pdf.BoxDecoration({
      color: panel,
      border: Pdf.Border.all({ color: border, width: 1 }),
      borderRadius: Pdf.BorderRadius.circular(8)
    }),
    child: new Pdf.Column({
      crossAxisAlignment: 'stretch',
      gap: 10,
      children: [
        new Pdf.Text(title, {
          style: new Pdf.TextStyle({ fontSize: 12, fontWeight: 'bold', color: ink })
        }),
        new Pdf.Text(subtitle, { style: new Pdf.TextStyle({ fontSize: 8, color: muted }) }),
        child
      ]
    })
  });
}

function circle(value, options = {}) {
  return new Pdf.Column({
    gap: 5,
    children: [
      new Pdf.SizedBox({
        width: options.width ?? 48,
        height: options.height ?? 48,
        child: new Pdf.CircularProgressIndicator({
          value,
          backgroundColor: options.backgroundColor ?? '#dbeafe',
          ...(options.useDefaultColor ? {} : { color: options.color ?? blue }),
          strokeWidth: options.strokeWidth ?? 6
        })
      }),
      label(`${Math.round(value * 100)}%`)
    ]
  });
}

function linear(value, options = {}) {
  return new Pdf.Column({
    crossAxisAlignment: 'stretch',
    gap: 4,
    children: [
      new Pdf.Row({
        mainAxisAlignment: 'spaceBetween',
        children: [label(options.label ?? `${Math.round(value * 100)}%`), label(`${options.minHeight ?? 4} pt`)]
      }),
      new Pdf.LinearProgressIndicator({
        value,
        minHeight: options.minHeight,
        valueColor: options.valueColor,
        backgroundColor: options.backgroundColor
      })
    ]
  });
}

/** Synchronous host-free proof of both determinate progress widgets. */
export function generateProgressPhase55() {
  const document = new Pdf.Document({ title: 'Phase 5.5 - progress indicators' });

  document.addPage(new Pdf.Page({
    margin: 36,
    build: () => new Pdf.Column({
      crossAxisAlignment: 'stretch',
      gap: 14,
      children: [
        new Pdf.Text('Phase 5.5 - progress indicators', {
          style: new Pdf.TextStyle({ fontSize: 24, fontWeight: 'bold', color: ink })
        }),
        new Pdf.Text(
          'Determinate circular rings and linear bars, including every public color and size option.',
          { style: new Pdf.TextStyle({ fontSize: 10, color: muted }) }
        ),
        card(
          'CircularProgressIndicator - values',
          'The unpainted remainder stays visible from empty through complete.',
          new Pdf.Row({
            mainAxisAlignment: 'spaceAround',
            crossAxisAlignment: 'end',
            children: [circle(0), circle(0.15), circle(0.35), circle(0.65), circle(1)]
          })
        ),
        new Pdf.Row({
          gap: 12,
          crossAxisAlignment: 'stretch',
          children: [
            new Pdf.Expanded({
              child: card(
                'Circular options',
                'strokeWidth, foreground, background and elliptical constraints.',
                new Pdf.Row({
                  mainAxisAlignment: 'spaceAround',
                  crossAxisAlignment: 'end',
                  children: [
                    circle(0.72, { color: green, backgroundColor: '#d1fae5', strokeWidth: 3 }),
                    circle(0.72, { color: amber, backgroundColor: '#fef3c7', strokeWidth: 10 }),
                    circle(0.72, {
                      color: '#7c3aed',
                      backgroundColor: '#ede9fe',
                      strokeWidth: 5,
                      width: 70,
                      height: 40
                    })
                  ]
                })
              )
            }),
            new Pdf.Expanded({
              child: card(
                'Default circular color',
                'No foreground option uses upstream indigo.',
                new Pdf.Center({
                  child: circle(0.58, {
                    useDefaultColor: true,
                    backgroundColor: '#e0e7ff',
                    strokeWidth: 7
                  })
                })
              )
            })
          ]
        }),
        card(
          'LinearProgressIndicator - values',
          'Default blue uses the upstream HSL shade for its remaining track.',
          new Pdf.Column({
            crossAxisAlignment: 'stretch',
            gap: 10,
            children: [linear(0), linear(0.25), linear(0.5), linear(0.75), linear(1)]
          })
        ),
        card(
          'Linear options',
          'Custom heights and explicit foreground/background colors.',
          new Pdf.Column({
            crossAxisAlignment: 'stretch',
            gap: 10,
            children: [
              linear(0.32, {
                label: 'thin green',
                minHeight: 2,
                valueColor: green,
                backgroundColor: '#d1fae5'
              }),
              linear(0.58, {
                label: 'medium amber',
                minHeight: 7,
                valueColor: amber,
                backgroundColor: '#fef3c7'
              }),
              linear(0.84, {
                label: 'thick violet',
                minHeight: 14,
                valueColor: '#7c3aed',
                backgroundColor: '#ede9fe'
              })
            ]
          })
        )
      ]
    })
  }));

  return document.save();
}
