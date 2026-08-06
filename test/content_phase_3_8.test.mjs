/*
 * js_pdf content-widgets phase 3.8 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';

import { latin1 as source } from './support/pdf-text.mjs';

test('phase 3.8 constructors are on named, namespace and callback APIs', () => {
  for (const name of ['Header', 'Paragraph', 'Bullet', 'TableOfContent']) {
    assert.equal(typeof Pdf[name], 'function', name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }

  const bytes = Pdf.createPdf({}, api => new api.Page({
    build: () => new api.Column({
      children: [
        new api.Header({ text: 'Content callback' }),
        new api.Paragraph({ text: 'paragraph callback' }),
        new api.Bullet({ text: 'bullet callback' })
      ]
    })
  }));
  const pdf = source(bytes);
  assert.match(pdf, /\(Content callback\) Tj/);
  assert.match(pdf, /\(paragraph callback\) Tj/);
  assert.match(pdf, /\(bullet callback\) Tj/);
});

test('Header writes named destinations and a hierarchical PDF outline', () => {
  const document = new Pdf.Document({ pageMode: 'outlines' });
  document.addPage(new Pdf.Page({
    build: () => new Pdf.Column({
      children: [
        new Pdf.Header({ level: 0, text: 'Root chapter', outlineStyle: 'bold' }),
        new Pdf.Header({ level: 1, text: 'Nested chapter', outlineColor: '#ff0000' }),
        new Pdf.Header({ level: 1, text: 'Root chapter' })
      ]
    })
  }));

  const pdf = source(document.save());
  assert.match(pdf, /\/Names \d+ 0 R/);
  assert.match(pdf, /\/Outlines \d+ 0 R/);
  assert.match(pdf, /\/PageMode \/UseOutlines/);
  assert.match(pdf, /\/Dests << \/Names \[\(outline-1\)/);
  assert.match(pdf, /\/Title \(Root chapter\).*\/Dest \(outline-1\)/s);
  assert.match(pdf, /\/Title \(Nested chapter\).*\/Dest \(outline-2\)/s);
  assert.match(pdf, /\/Title \(Root chapter\).*\/Dest \(outline-3\)/s);
  assert.match(pdf, /\/F 2/);
  assert.match(pdf, /\/C \[1 0 0\]/);
});

test('TableOfContent replays only when needed and sees later headings', () => {
  const document = new Pdf.Document();
  let tocBuilds = 0;
  let contentBuilds = 0;
  document.addPage(new Pdf.Page({
    build: () => {
      tocBuilds++;
      return new Pdf.Column({
        children: [new Pdf.Text('Contents'), new Pdf.TableOfContent()]
      });
    }
  }));
  document.addPage(new Pdf.Page({
    build: () => {
      contentBuilds++;
      return new Pdf.Column({
        children: [
          new Pdf.Header({ level: 0, text: 'First topic' }),
          new Pdf.Header({ level: 1, text: 'Second topic' })
        ]
      });
    }
  }));

  const pdf = source(document.save());
  assert.equal(tocBuilds, 2);
  assert.equal(contentBuilds, 2);
  assert.ok((pdf.match(/\(First topic\) Tj/g) ?? []).length >= 2);
  assert.ok((pdf.match(/\(Second topic\) Tj/g) ?? []).length >= 2);
  assert.ok((pdf.match(/\(2\) Tj/g) ?? []).length >= 2, 'both headings are on physical page two');
  assert.match(pdf, /\/A << \/S \/GoTo \/D \(outline-1\) >>/);
  assert.match(pdf, /\/A << \/S \/GoTo \/D \(outline-2\) >>/);
});

test('a document without TableOfContent stays single-pass', () => {
  let builds = 0;
  Pdf.createPdf({}, api => new api.Page({
    build: () => {
      builds++;
      return new api.Header({ text: 'One pass' });
    }
  }));
  assert.equal(builds, 1);
});

test('Paragraph justifies and Bullet paints its configured marker', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    pageFormat: { width: 180, height: 300 },
    build: () => new Pdf.Column({
      children: [
        new Pdf.Paragraph({
          text: 'A paragraph with enough words to wrap and visibly justify across this narrow content width.'
        }),
        new Pdf.Bullet({ text: 'square item', bulletShape: 'rectangle', bulletColor: '#00ff00' })
      ]
    })
  }));
  const pdf = source(bytes);
  assert.match(pdf, /\(A\) Tj/);
  assert.match(pdf, /0 1 0 rg .* re f/);
  assert.match(pdf, /\(square item\) Tj/);
  assert.doesNotMatch(pdf, /NaN|Infinity/);
});
