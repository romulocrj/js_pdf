/*
 * js_pdf serialization and PDF objects phase 7.1 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

/**
 * One document whose metadata, bookmarks, form values and page labels all go
 * through the 7.1 serializers: PDFDocEncoding-or-UTF-16 text strings, sorted
 * and unique named destinations, `/Count` per ISO 32000-1 Table 153, a page-0
 * label entry, one parent field for a repeated header field, and a table of
 * contents that shares the flow with the chapters it lists.
 */
export function generateSerializationPhase71(api = defaultApi, compress = true) {
  const { Document, MultiPage, PageFormat, PdfPageLabel, Text, TextStyle, Row, Column, Expanded,
    Container, BoxDecoration, Border, BorderSide, Header, Paragraph, TableOfContent, Outline,
    Anchor, Link, TextField, ChoiceField, SizedBox } = api;
  const ink = '#172554';
  const muted = '#475569';
  const small = new TextStyle({ fontSize: 8, color: muted });
  const note = text => new Paragraph({ text, style: new TextStyle({ fontSize: 9, color: ink }) });

  const document = new Document({
    compress,
    pageMode: 'outlines',
    title: 'Serialization — “PDF objects” € 7.1',
    author: 'Romulo Campos',
    subject: 'PDFDocEncoding ’text strings’, outlines and forms',
    keywords: '€, —, ’, “, ”',
    // Physical pages 1 and 2 read 1 and 2; numbering restarts at page 3.
    pageLabels: [{ pageIndex: 2, label: PdfPageLabel.romanLower({ prefix: 'Annex ' }) }]
  });

  const chapter = (index, title) => [
    new Header({ level: 0, text: `${index}. ${title}` }),
    new Header({ level: 1, text: `${index}.1 Details — “${title}”` }),
    new Header({ level: 2, text: `${index}.1.1 Notes’ detail` }),
    note('Each heading is a bookmark and a table-of-contents row. Opening the parent '
      + 'bookmark reveals its direct children only, which is what /Count now says.'),
    new Header({ level: 1, text: `${index}.2 Summary € ${index}00` }),
    note('The table of contents above sits in the same flow as these chapters, so '
      + 'its own height moves them; the layout is replayed until every page number '
      + 'it prints is where the chapter really landed.')
  ];

  document.addPage(new MultiPage({
    pageFormat: PageFormat.A5,
    margin: 36,
    // A form field repeated on every page: one /AcroForm field with one
    // widget per page as its kids, instead of one root field per page.
    header: () => new Row({ children: [
      new Expanded({ child: new Text('Phase 7.1 · serialization', { style: small }) }),
      new TextField({ name: 'reviewer', value: 'Revisão — “ok” €', width: 130, height: 14 })
    ] }),
    footer: context => new Text(
      `Page label “${context.pageLabel}” · physical page ${context.pageNumber}`,
      { style: small }
    ),
    build: () => [
      new Text('Serialization and PDF objects', {
        style: new TextStyle({ fontSize: 20, fontWeight: 'bold', color: ink })
      }),
      new SizedBox({ height: 6 }),
      note('Metadata, bookmarks and form values below hold € — ’ “ ”. They are '
        + 'written as UTF-16 text strings now, because PDFDocEncoding puts other '
        + 'characters at the CP1252 bytes they used to get (€— read back as •Š).'),
      new SizedBox({ height: 8 }),
      new Container({
        padding: 6,
        decoration: new BoxDecoration({ border: new Border({ bottom: new BorderSide({ width: 0.5 }) }) }),
        child: new Text('Contents', { style: new TextStyle({ fontSize: 12, fontWeight: 'bold' }) })
      }),
      new TableOfContent({ textStyle: new TextStyle({ fontSize: 9 }) }),
      ...chapter(1, 'Preço e “metadados”'),
      new Outline({
        name: 'bookmark-only',
        title: 'Ünïcödé — “Outline” ’widget’ €',
        level: 1,
        child: note('An Outline widget is also an Anchor: its destination is now '
          + 'written once, keeping its x coordinate, instead of twice.')
      }),
      new Anchor({
        name: 'outline-1',
        child: note('A user Anchor named outline-1. Generated anchors now use the '
          + 'reserved __dest prefix, so this one no longer collides with a heading.')
      }),
      new Link({ destination: 'outline-1', child: new Text('Go to the outline-1 anchor', {
        style: new TextStyle({ fontSize: 9, color: '#2563eb' })
      }) }),
      ...chapter(2, 'Formulários’ values'),
      new Column({ crossAxisAlignment: 'start', gap: 4, children: [
        new TextField({ name: 'amount', value: 'Total € 1.234 — “paid”', width: 200, height: 14 }),
        new ChoiceField({ name: 'method', items: ['Crédito’s', '“Débito”', '€ cash'], value: '“Débito”', width: 200, height: 14 })
      ] }),
      ...chapter(3, 'Page labels'),
      note('The page-label tree starts at page 3 here, and still names page index 0 '
        + 'explicitly (/Nums [0 << /S /D >> 2 …]), as ISO 32000-1 12.4.2 requires.'),
      ...chapter(4, 'Números'),
      note('A non-finite number writes 0 and one of 1e21 or more writes plain '
        + 'digits, so no number reaches the file in a form a reader cannot parse.')
    ]
  }));

  return document.save();
}
