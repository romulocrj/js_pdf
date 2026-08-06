/*
 * js_pdf annotations and links phase 5.3 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as Pdf from '../dist/js_pdf.mjs';

const blue = '#1d4ed8';
const paleBlue = '#dbeafe';
const green = '#166534';
const paleGreen = '#dcfce7';
const gray = '#475569';

function card(title, description, child, color, background) {
  return new Pdf.Container({
    margin: new Pdf.EdgeInsets({ bottom: 18 }),
    padding: new Pdf.EdgeInsets({ all: 14 }),
    decoration: new Pdf.BoxDecoration({
      color: background,
      border: Pdf.Border.all({ color, width: 1 }),
      borderRadius: Pdf.BorderRadius.all(6)
    }),
    child: new Pdf.Column({
      crossAxisAlignment: 'start',
      children: [
        new Pdf.Text(title, { style: new Pdf.TextStyle({ fontSize: 15, fontWeight: 'bold', color }) }),
        new Pdf.SizedBox({ height: 5 }),
        new Pdf.Text(description, { style: new Pdf.TextStyle({ fontSize: 9, color: gray }) }),
        new Pdf.SizedBox({ height: 10 }),
        child
      ]
    })
  });
}

export function generateAnnotationsPhase53() {
  const document = new Pdf.Document({
    title: 'Phase 5.3 - annotations and links',
    pageMode: 'outlines'
  });

  document.addPage(new Pdf.Page({
    margin: new Pdf.EdgeInsets({ all: 42 }),
    build: () => new Pdf.Column({
      crossAxisAlignment: 'stretch',
      children: [
        new Pdf.Header({ level: 0, text: 'Phase 5.3 - annotations and links' }),
        new Pdf.Text(
          'The colored regions make every clickable rectangle visible. Test the external, inline and internal links in a PDF viewer.',
          { style: new Pdf.TextStyle({ color: gray, fontSize: 10 }) }
        ),
        new Pdf.SizedBox({ height: 22 }),
        card(
          'UrlLink - whole widget',
          'The complete blue button is one external-link annotation.',
          new Pdf.UrlLink({
            destination: 'https://github.com/DavBfr/dart_pdf',
            child: new Pdf.Container({
              alignment: 'center',
              height: 38,
              decoration: new Pdf.BoxDecoration({ color: blue, borderRadius: Pdf.BorderRadius.all(4) }),
              child: new Pdf.Text('Open dart_pdf upstream', {
                style: new Pdf.TextStyle({ color: '#ffffff', fontWeight: 'bold' })
              })
            })
          }),
          blue,
          paleBlue
        ),
        card(
          'AnnotationUrl - inline span',
          'Only the underlined words carry the annotation; the surrounding sentence is plain text.',
          new Pdf.RichText({
            text: new Pdf.TextSpan({
              children: [
                new Pdf.TextSpan({ text: 'Visit the ' }),
                new Pdf.TextSpan({
                  text: 'PDF specification page',
                  annotation: new Pdf.AnnotationUrl('https://pdfa.org/resource/iso-32000-pdf/'),
                  style: new Pdf.TextStyle({ color: blue, decoration: 'underline', fontWeight: 'bold' })
                }),
                new Pdf.TextSpan({ text: ' without making this suffix clickable.' })
              ]
            })
          }),
          blue,
          '#ffffff'
        ),
        card(
          'Link - internal destination',
          'This green button jumps to the named Anchor on page 2.',
          new Pdf.Link({
            destination: 'internal-target',
            child: new Pdf.Container({
              alignment: 'center',
              height: 38,
              decoration: new Pdf.BoxDecoration({ color: green, borderRadius: Pdf.BorderRadius.all(4) }),
              child: new Pdf.Text('Jump to page 2', {
                style: new Pdf.TextStyle({ color: '#ffffff', fontWeight: 'bold' })
              })
            })
          }),
          green,
          paleGreen
        )
      ]
    })
  }));

  document.addPage(new Pdf.Page({
    margin: new Pdf.EdgeInsets({ all: 42 }),
    build: () => new Pdf.Anchor({
      name: 'internal-target',
      setX: true,
      child: new Pdf.Container({
        padding: new Pdf.EdgeInsets({ all: 22 }),
        decoration: new Pdf.BoxDecoration({
          color: paleGreen,
          border: Pdf.Border.all({ color: green, width: 2 }),
          borderRadius: Pdf.BorderRadius.all(8)
        }),
        child: new Pdf.Column({
          crossAxisAlignment: 'start',
          children: [
            new Pdf.Header({ level: 0, text: 'Named Anchor reached' }),
            new Pdf.Text('The internal GoTo action resolves to this exact top-left destination.'),
            new Pdf.SizedBox({ height: 12 }),
            new Pdf.Text('The outline panel and the page-1 green button both exercise named destinations.', {
              style: new Pdf.TextStyle({ color: gray, fontSize: 10 })
            })
          ]
        })
      })
    })
  }));

  return document.save();
}
