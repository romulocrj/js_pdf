/*
 * js_pdf phase 3.8 content-widgets example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generateContentPhase38() {
  const document = new pw.Document({ pageMode: 'outlines' });

  document.addPage(new pw.Page({
    margin: 48,
    build: () => new pw.Column({
      crossAxisAlignment: 'stretch',
      children: [
        new pw.Text('Phase 3.8 — table of content', {
          style: new pw.TextStyle({ fontSize: 24, fontWeight: 'bold', color: '#172554' })
        }),
        new pw.SizedBox({ height: 24 }),
        new pw.TableOfContent({ textStyle: new pw.TextStyle({ color: '#334155' }) })
      ]
    })
  }));

  document.addPage(new pw.Page({
    margin: 48,
    build: () => new pw.Column({
      crossAxisAlignment: 'stretch',
      children: [
        new pw.Header({ level: 0, text: 'Content widgets', outlineStyle: 'bold' }),
        new pw.Paragraph({
          text: 'Header records a real named destination and outline node. Paragraph uses the themed paragraph style and justified rich-text breaker.'
        }),
        new pw.Header({ level: 1, text: 'Bullet lists', outlineColor: '#2563eb' }),
        new pw.Bullet({ text: 'The marker is a decorated vector box.' }),
        new pw.Bullet({ text: 'Text uses the bullet style from the active theme.', bulletColor: '#2563eb' }),
        new pw.Bullet({
          text: 'Square markers are supported too.',
          bulletShape: 'rectangle',
          bulletColor: '#7c3aed'
        }),
        new pw.Header({ level: 2, text: 'Second-pass table' }),
        new pw.Paragraph({
          text: 'The table lives on the previous page, so Document renders a second time only when TableOfContent requests the completed outline data.'
        })
      ]
    })
  }));

  return document.save();
}

