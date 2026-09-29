/*
 * js_pdf phase 6.10 annotation and reusable form tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as pw from '../src/index.ts';
const render = children => {
 const doc = new pw.Document({ compress: false });
 doc.addPage(new pw.Page({ margin: 20, build: () => new pw.Column({ children }) }));
 return Buffer.from(doc.save()).toString('latin1');
};
test('text notes serialize content, metadata, opening state and custom borders', () => {
 const pdf = render([new pw.TextAnnotation({ content: 'Review café', author: 'Reviewer', subject: 'Check', open: true,
  border: new pw.PdfBorder({ width: 2, style: 'dashed', dash: [3, 2] }), child: new pw.Text('Note') })]);
 assert.match(pdf, /\/Subtype \/Text/); assert.match(pdf, /\/Open true/);
 assert.match(pdf, /\/Contents \(Review caf\\351\)/); assert.match(pdf, /\/T \(Reviewer\)/);
 assert.match(pdf, /\/BS << \/W 2 \/S \/D \/D \[3 2\] >>/);
});
test('all border styles validate and reach annotation dictionaries', () => {
 for (const [style, op] of [['solid','S'],['dashed','D'],['beveled','B'],['inset','I'],['underlined','U']]) {
  const pdf = render([new pw.SquareAnnotation({ border: { width: 2, style }, child: new pw.SizedBox({ width: 20, height: 20 }) })]);
  assert.ok(pdf.includes(`/BS << /W 2 /S /${op} >>`));
 }
 assert.throws(() => new pw.PdfBorder({ width: -1 }), RangeError);
 assert.throws(() => new pw.PdfBorder({ style: 'dashed', dash: [0,0] }), RangeError);
 assert.throws(() => new pw.PdfBorder({ dash: [NaN] }), RangeError);
});
test('reusable nested forms retain resources and serialize once across pages and saves', () => {
 const inner = new pw.PdfFormXObject({ width: 80, height: 30, paint: canvas => {
  canvas.fillRect(0, 0, 80, 30, '#ddeeff'); canvas.text('STAMP', 5, 5, { fontSize: 12, color: '#123456' });
 } });
 const outer = new pw.PdfFormXObject({ width: 100, height: 50, paint: canvas => canvas.drawForm(inner, 10, 10) });
 const doc = new pw.Document({ compress: false });
 for (let i=0;i<2;i++) doc.addPage(new pw.Page({ build: () => new pw.CustomPaint({ size: { x: 200, y: 100 }, painter: canvas => {
  canvas.drawForm(outer, 0, 0); canvas.drawForm(outer, 100, 0);
 } }) }));
 const a = doc.save(); assert.deepEqual(a, doc.save());
 const pdf = Buffer.from(a).toString('latin1');
 assert.equal((pdf.match(/\/Subtype \/Form\b/g) ?? []).length, 2);
 assert.match(pdf, /\/XObject << \/Xf1 \d+ 0 R/); assert.match(pdf, /\/Font << \/F1 \d+ 0 R/);
 assert.match(pdf, /\/BBox \[0 0 100 50\]/);
 assert.throws(() => new pw.PdfFormXObject({ width: 0, height: 20, paint() {} }), RangeError);
});
test('link builders carry borders through transformed rectangles', () => {
 const pdf = render([new pw.Annotation({ builder: new pw.AnnotationUrl('https://example.com', { border: { style: 'underlined', width: 2 } }), child: new pw.Text('Link') })]);
 assert.match(pdf, /\/BS << \/W 2 \/S \/U >>/);
});
test('forms reused inside field appearances retain their resource references', () => {
 const form = new pw.PdfFormXObject({ width: 30, height: 20, paint: canvas => canvas.fillRect(0,0,30,20,'#123456') });
 const pdf = render([new pw.TextField({ name: 'stamp', value: 'x', border: { style: 'inset', width: 2 }, child: new pw.CustomPaint({ size: { x: 30, y: 20 }, painter: canvas => canvas.drawForm(form,0,0) }) })]);
 assert.match(pdf, /\/BS << \/W 2 \/S \/I >>/);
 assert.match(pdf, /\/XObject << \/Xf1 \d+ 0 R/);
});
test('drawForm uses PDF user coordinates like drawImage inside CustomPaint', async () => {
 const { PdfCanvas } = await import('../src/pdf/graphics.ts');
 const form = new pw.PdfFormXObject({ width: 30, height: 20, paint() {} });
 const canvas = new PdfCanvas(800); canvas.drawForm(form,10,20);
 assert.equal(canvas.output(), 'q 1 0 0 1 10 20 cm /Xf1 Do Q\n');
});
