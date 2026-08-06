/*
 * js_pdf phase 5.7 remaining widgets example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

class AccentValue extends pw.Inherited {
  constructor(color) {
    super();
    this.color = color;
  }
}

function label(value) {
  return new pw.Text(value, { fontSize: 8, color: '#334155', align: 'center' });
}

function card(title, child, width = 155, height = 110) {
  return new pw.Container({
    width,
    height,
    padding: 7,
    decoration: { color: '#ffffff', border: { color: '#cbd5e1', width: 0.7 } },
    child: new pw.Column({
      children: [
        new pw.Text(title, { fontSize: 9, fontWeight: 'bold', color: '#1e3a8a' }),
        new pw.SizedBox({ height: 5 }),
        new pw.Expanded({ child })
      ]
    })
  });
}

function shapePage() {
  return [
    new pw.Outline({
      name: 'phase-57-shapes',
      title: 'Phase 5.7 shapes and composition',
      level: 0,
      child: new pw.Text('Shapes and composition', {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#172554'
      })
    }),
    new pw.SizedBox({ height: 12 }),
    new pw.Row({
      mainAxisAlignment: 'spaceBetween',
      children: [
        card('Circle', new pw.Circle({ fillColor: '#93c5fd', strokeColor: '#1d4ed8', strokeWidth: 2 })),
        card('Rectangle', new pw.Rectangle({ fillColor: '#bbf7d0', strokeColor: '#15803d', strokeWidth: 2 })),
        card('Polygon', new pw.Polygon({
          points: [{ x: 12, y: 55 }, { x: 65, y: 5 }, { x: 118, y: 55 }, { x: 65, y: 75 }],
          fillColor: '#fde68a',
          strokeColor: '#b45309',
          strokeWidth: 2
        }))
      ]
    }),
    new pw.SizedBox({ height: 10 }),
    new pw.Row({
      mainAxisAlignment: 'spaceBetween',
      children: [
        card('InkList', new pw.InkList({
          points: [
            [{ x: 5, y: 50 }, { x: 25, y: 15 }, { x: 50, y: 60 }, { x: 80, y: 20 }, { x: 120, y: 48 }],
            [{ x: 10, y: 70 }, { x: 45, y: 52 }, { x: 90, y: 72 }, { x: 125, y: 55 }]
          ],
          strokeColor: '#7c3aed',
          strokeWidth: 2
        })),
        card('Shape path data', new pw.Shape('M 5 70 L 35 10 L 65 70 L 95 10 L 125 70 Z', {
          fillColor: '#fbcfe8',
          strokeColor: '#be185d',
          fit: 'contain'
        })),
        card('Watermark', new pw.Watermark({
          angle: -Math.PI / 10,
          child: new pw.Text('DRAFT', { fontSize: 28, fontWeight: 'bold', color: '#dbeafe' })
        }))
      ]
    }),
    new pw.SizedBox({ height: 12 }),
    new pw.Text('ListView', { fontSize: 14, fontWeight: 'bold', color: '#172554' }),
    new pw.SizedBox({ height: 6 }),
    new pw.ListView({
      direction: 'horizontal',
      spacing: 8,
      children: ['eager item', 'reverse-ready', 'spaced with boxes'].map(text =>
        new pw.Container({ padding: 7, decoration: { color: '#eff6ff' }, child: label(text) })
      )
    }),
    new pw.SizedBox({ height: 12 }),
    new pw.Inseparable({
      child: new pw.Container({
        padding: 9,
        decoration: { color: '#f5f3ff', border: { color: '#c4b5fd', width: 1 } },
        child: new pw.Column({
          children: [
            new pw.Text('Inseparable', { fontSize: 13, fontWeight: 'bold', color: '#5b21b6' }),
            new pw.SizedBox({ height: 5 }),
            new pw.Text('This heading and its content move to the next page as one atomic block.')
          ]
        })
      })
    })
  ];
}

function annotationPage() {
  const polygon = [{ x: 8, y: 62 }, { x: 52, y: 5 }, { x: 96, y: 62 }];
  const ink = [[{ x: 5, y: 55 }, { x: 28, y: 12 }, { x: 55, y: 60 }, { x: 92, y: 18 }]];
  return [
    new pw.Outline({
      name: 'phase-57-annotations',
      title: 'Geometric annotations',
      level: 0,
      child: new pw.Text('Geometric annotations', { fontSize: 22, fontWeight: 'bold', color: '#172554' })
    }),
    new pw.SizedBox({ height: 8 }),
    new pw.Text('The visible shapes below also emit native PDF annotation objects.', { color: '#475569' }),
    new pw.SizedBox({ height: 14 }),
    new pw.Row({
      mainAxisAlignment: 'spaceBetween',
      children: [
        card('SquareAnnotation', new pw.SquareAnnotation({
          color: '#1d4ed8', interiorColor: '#dbeafe', border: { width: 2 },
          author: 'js_pdf', subject: 'Square', content: 'Native square annotation'
        })),
        card('CircleAnnotation', new pw.CircleAnnotation({
          color: '#15803d', interiorColor: '#dcfce7', border: { width: 2 },
          author: 'js_pdf', subject: 'Circle', content: 'Native circle annotation'
        })),
        card('PolygonAnnotation', new pw.PolygonAnnotation({
          points: polygon, color: '#b45309', interiorColor: '#fef3c7', border: { width: 2 },
          author: 'js_pdf', subject: 'Polygon', content: 'Native polygon annotation'
        }))
      ]
    }),
    new pw.SizedBox({ height: 12 }),
    new pw.Row({
      children: [
        card('PolyLineAnnotation', new pw.PolyLineAnnotation({
          points: polygon, color: '#be185d', border: { width: 2 },
          author: 'js_pdf', subject: 'Polyline', content: 'Native polyline annotation'
        }), 240, 130),
        new pw.SizedBox({ width: 12 }),
        card('InkAnnotation', new pw.InkAnnotation({
          points: ink, color: '#7c3aed', border: { width: 2 },
          author: 'js_pdf', subject: 'Ink', content: 'Native ink annotation'
        }), 240, 130)
      ]
    })
  ];
}

function infrastructurePage() {
  return [
    new pw.Outline({
      name: 'phase-57-infrastructure',
      title: 'Context, grid paper and delayed widgets',
      level: 0,
      child: new pw.Text('Context and utility widgets', { fontSize: 22, fontWeight: 'bold', color: '#172554' })
    }),
    new pw.SizedBox({ height: 12 }),
    new pw.Directionality({
      textDirection: 'rtl',
      child: new pw.Container({
        padding: 8,
        decoration: { color: '#f8fafc', border: { color: '#cbd5e1', width: 1 } },
        child: new pw.Text('Directionality: this line is laid out from the right edge.', { align: 'start' })
      })
    }),
    new pw.SizedBox({ height: 10 }),
    new pw.InheritedWidget({
      inherited: new AccentValue('#dc2626'),
      build: context => new pw.Text('InheritedWidget: descendants can read scoped values.', {
        color: pw.InheritedWidget.of(context, AccentValue)?.color ?? '#000000',
        fontWeight: 'bold'
      })
    }),
    new pw.SizedBox({ height: 10 }),
    new pw.DelayedWidget({
      build: context => new pw.Text(`DelayedWidget rebuilt for page ${context.pageNumber}.`, {
        color: '#0369a1'
      })
    }),
    new pw.SizedBox({ height: 14 }),
    new pw.Text('GridPaper presets', { fontSize: 14, fontWeight: 'bold', color: '#172554' }),
    new pw.SizedBox({ height: 8 }),
    new pw.Row({
      mainAxisAlignment: 'spaceBetween',
      children: [
        card('GridPaper.quad', pw.GridPaper.quad(), 155, 130),
        card('GridPaper.engineering', pw.GridPaper.engineering(), 155, 130),
        card('GridPaper.seyes', pw.GridPaper.seyes(), 155, 130)
      ]
    }),
    new pw.SizedBox({ height: 10 }),
    new pw.Row({
      children: [
        card('GridPaper.millimeter', pw.GridPaper.millimeter(), 240, 130),
        new pw.SizedBox({ width: 12 }),
        card('GridPaper.collegeRuled', pw.GridPaper.collegeRuled(), 240, 130)
      ]
    })
  ];
}

export function generateWidgetsPhase57() {
  const document = new pw.Document({ title: 'Phase 5.7 - remaining dart_pdf widgets' });
  document.addPage(new pw.MultiPage({
    pageFormat: pw.PageFormat.A4,
    margin: 36,
    footer: context => new pw.Footer({
      leading: new pw.Text('js_pdf phase 5.7', { fontSize: 8, color: '#64748b' }),
      title: new pw.Text('Remaining widgets', { fontSize: 8, color: '#64748b' }),
      trailing: new pw.Text(`${context.pageNumber}/${context.pagesCount}`, { fontSize: 8, color: '#64748b' })
    }),
    build: () => [
      ...shapePage(),
      new pw.NewPage(),
      ...annotationPage(),
      new pw.NewPage({ freeSpace: 500 }),
      ...infrastructurePage()
    ]
  }));
  return document.save();
}
