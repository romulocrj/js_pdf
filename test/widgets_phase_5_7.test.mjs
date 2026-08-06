/*
 * js_pdf remaining widgets phase 5.7 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';

const source = bytes => String.fromCharCode(...bytes);

test('phase 5.7 exports every newly retained widget except Signature', () => {
  for (const name of [
    'Inseparable', 'NewPage', 'ListView', 'Watermark', 'Footer',
    'Directionality', 'GridPaper', 'Circle', 'Rectangle', 'Polygon', 'InkList',
    'Shape', 'SquareAnnotation', 'CircleAnnotation', 'PolygonAnnotation',
    'PolyLineAnnotation', 'InkAnnotation', 'Outline', 'InheritedWidget', 'DelayedWidget'
  ]) {
    assert.equal(typeof Pdf[name], 'function', name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }
  assert.equal(Pdf.Signature, undefined);
});

test('NewPage and Inseparable move an atomic block without splitting it', () => {
  const pdf = source(Pdf.createPdf({}, () => new Pdf.MultiPage({
    pageFormat: { width: 200, height: 300 },
    margin: 20,
    build: () => [
      new Pdf.SizedBox({ height: 210, child: new Pdf.Text('before') }),
      new Pdf.Inseparable({
        child: new Pdf.SizedBox({
          height: 80,
          child: new Pdf.Column({ children: [new Pdf.Text('atomic heading'), new Pdf.Text('atomic body')] })
        })
      }),
      new Pdf.NewPage(),
      new Pdf.Text('forced page')
    ]
  })));

  assert.match(pdf, /\/Count 3\b/);
  assert.equal((pdf.match(/\(atomic heading\) Tj/g) ?? []).length, 1);
  assert.equal((pdf.match(/\(atomic body\) Tj/g) ?? []).length, 1);
  assert.equal((pdf.match(/\(forced page\) Tj/g) ?? []).length, 1);
});

test('shape widgets emit ellipse, rectangle, polygon, ink and path operators', () => {
  const pdf = source(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.Column({ children: [
      new Pdf.SizedBox({ width: 40, height: 30, child: new Pdf.Circle({ fillColor: '#ff0000' }) }),
      new Pdf.SizedBox({ width: 40, height: 30, child: new Pdf.Rectangle({ strokeColor: '#00ff00' }) }),
      new Pdf.SizedBox({ width: 40, height: 30, child: new Pdf.Polygon({
        points: [{ x: 0, y: 20 }, { x: 20, y: 0 }, { x: 40, y: 20 }],
        fillColor: '#0000ff'
      }) }),
      new Pdf.SizedBox({ width: 40, height: 30, child: new Pdf.InkList({
        points: [[{ x: 0, y: 0 }, { x: 40, y: 30 }]], strokeColor: '#000000'
      }) }),
      new Pdf.SizedBox({ width: 40, height: 30, child: new Pdf.Shape('M0 0 L40 0 L20 30 Z', {
        fillColor: '#ffff00'
      }) })
    ] })
  })));

  assert.match(pdf, / c\n/);
  assert.match(pdf, /\nf\n/);
  assert.match(pdf, /40 30 re/);
  assert.match(pdf, /\nS\n/);
  assert.match(pdf, / m\n.* l\n.* l\nh\nf/s);
  assert.match(pdf, /1 1 0 rg/);
});

test('geometric annotation widgets serialize all native PDF subtypes', () => {
  const points = [{ x: 2, y: 18 }, { x: 10, y: 2 }, { x: 18, y: 18 }];
  const ink = [[{ x: 2, y: 18 }, { x: 10, y: 2 }, { x: 18, y: 18 }]];
  const pdf = source(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.Row({ children: [
      new Pdf.SizedBox({ width: 20, height: 20, child: new Pdf.SquareAnnotation({ color: '#ff0000' }) }),
      new Pdf.SizedBox({ width: 20, height: 20, child: new Pdf.CircleAnnotation({ color: '#00ff00' }) }),
      new Pdf.SizedBox({ width: 20, height: 20, child: new Pdf.PolygonAnnotation({ points, color: '#0000ff' }) }),
      new Pdf.SizedBox({ width: 20, height: 20, child: new Pdf.PolyLineAnnotation({ points, color: '#000000' }) }),
      new Pdf.SizedBox({ width: 20, height: 20, child: new Pdf.InkAnnotation({ points: ink, color: '#000000' }) })
    ] })
  })));

  for (const subtype of ['Square', 'Circle', 'Polygon', 'PolyLine', 'Ink']) {
    assert.match(pdf, new RegExp(`/Subtype /${subtype}\\b`));
  }
  assert.match(pdf, /\/Vertices \[/);
  assert.match(pdf, /\/InkList \[\[/);
});

test('ListView variants, inherited context, delayed paint and outline compose', () => {
  class Accent extends Pdf.Inherited {
    constructor(value) { super(); this.value = value; }
  }
  const document = new Pdf.Document({ title: 'phase 5.7 composition' });
  document.addPage(new Pdf.MultiPage({
    build: () => [
      new Pdf.Outline({ name: 'widgets', title: 'Widgets', child: new Pdf.Text('outline child') }),
      Pdf.ListView.builder({ itemCount: 2, itemBuilder: (_context, index) => new Pdf.Text(`builder ${index}`) }),
      Pdf.ListView.separated({
        itemCount: 2,
        itemBuilder: (_context, index) => new Pdf.Text(`separated ${index}`),
        separatorBuilder: () => new Pdf.Text('separator')
      }),
      new Pdf.Directionality({ textDirection: 'rtl', child: new Pdf.Text('rtl scope') }),
      new Pdf.InheritedWidget({
        inherited: new Accent('inherited value'),
        build: context => new Pdf.Text(Pdf.InheritedWidget.of(context, Accent)?.value ?? 'missing')
      }),
      new Pdf.DelayedWidget({ build: context => new Pdf.Text(`paint page ${context.pageNumber}`) })
    ]
  }));
  const pdf = source(document.save());

  for (const text of ['builder 0', 'builder 1', 'separator', 'rtl scope', 'inherited value', 'paint page 1']) {
    assert.match(pdf, new RegExp(`\\(${text}\\) Tj`));
  }
  assert.match(pdf, /\/Outlines \d+ 0 R/);
  assert.match(pdf, /\(widgets\)/);
});

test('GridPaper and Footer paint visible line work and footer slots', () => {
  const pdf = source(Pdf.createPdf({}, () => new Pdf.MultiPage({
    pageFormat: { width: 200, height: 300 },
    margin: 20,
    footer: () => new Pdf.Footer({
      leading: new Pdf.Text('left'), title: new Pdf.Text('middle'), trailing: new Pdf.Text('right')
    }),
    build: () => [new Pdf.SizedBox({ width: 160, height: 100, child: Pdf.GridPaper.quad() })]
  })));

  assert.ok((pdf.match(/ m\n/g) ?? []).length >= 6);
  for (const text of ['left', 'middle', 'right']) assert.match(pdf, new RegExp(`\\(${text}\\) Tj`));
});
