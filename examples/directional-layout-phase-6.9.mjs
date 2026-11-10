/*
 * js_pdf directional layout phase 6.9 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

const ITEMS = [
  ['1', 'Layout review', '2', '120.00'],
  ['2', 'Bidi fixtures', '5', '45.50'],
  ['3', 'Directional table', '1', '310.00']
];

/**
 * Each widget tree is built once and drawn twice, inside `Directionality(ltr)`
 * and `Directionality(rtl)`: every difference between the two halves of a page
 * comes from the ambient direction alone. Labels are numbered in source order
 * so the reading order can be checked on the page.
 */
export function generateDirectionalLayoutPhase69(api = defaultApi, compress = true) {
  const { Document, Page, MultiPage, PageFormat, Text, TextStyle, Column, Row, Container, SizedBox,
    Expanded, Stack, PositionedDirectional, Directionality, Table, TableRow, TableBorder, TableHelper,
    FixedColumnWidth, FlexColumnWidth, GridView, Wrap, BoxDecoration, Border, BorderRadiusDirectional,
    LinearGradient, RadialGradient, AlignmentDirectional, EdgeInsetsDirectional, Center, PdfColors } = api;
  const document = new Document({ compress, title: 'Directional layout - phase 6.9', author: 'Romulo Campos' });
  const ink = PdfColors.blueGrey900;
  const text = (value, size = 9, color = ink) => new Text(value, { style: new TextStyle({ fontSize: size, color }) });
  const caption = value => text(value, 8, PdfColors.blueGrey600);
  const heading = value => text(value, 13, PdfColors.indigo);
  const chip = (label, color, width = 58) => new Container({
    width,
    height: 22,
    alignment: 'center',
    decoration: new BoxDecoration({ color, borderRadius: BorderRadiusDirectional.only({ topStart: 9, bottomStart: 9 }) }),
    child: text(label, 8, PdfColors.white)
  });
  const frame = child => new Container({
    padding: 8,
    decoration: new BoxDecoration({ border: Border.all({ color: PdfColors.blueGrey200, width: 0.5 }) }),
    child
  });
  const both = (build, width = 250) => new Row({ crossAxisAlignment: 'start', gap: 15, children: ['ltr', 'rtl'].map(direction =>
    new Column({ mainAxisSize: 'min', crossAxisAlignment: 'start', gap: 4, children: [
      caption(`Directionality(${direction})`),
      new SizedBox({ width, child: new Directionality({ textDirection: direction, child: build() }) })
    ] })) });

  const invoice = () => new Column({ mainAxisSize: 'min', crossAxisAlignment: 'start', gap: 8, children: [
    // Row: the logo, then the address, then the title; rtl reads them from the right.
    new Row({ gap: 8, children: [
      new Container({ width: 34, height: 34, alignment: 'center',
        decoration: new BoxDecoration({ shape: 'circle', gradient: new RadialGradient({
          colors: [PdfColors.amber, PdfColors.deepOrange], center: AlignmentDirectional.topStart, radius: 1.2 }) }),
        child: text('1', 11, PdfColors.white) }),
      new Column({ mainAxisSize: 'min', crossAxisAlignment: 'start', children: [
        text('Port & Sons'), caption('Example Street')
      ] }),
      new Expanded({ child: new SizedBox() }),
      text('INVOICE', 14, PdfColors.indigo)
    ] }),
    // EdgeInsetsDirectional: the accent bar and the padding sit on the start side.
    new Row({ children: [
      new Container({ width: 4, height: 30, color: PdfColors.indigo }),
      new Container({ padding: EdgeInsetsDirectional.only({ start: 10, top: 4, bottom: 4 }), child:
        new Column({ mainAxisSize: 'min', crossAxisAlignment: 'start', children: [
          text('Bill to: Ada Lovelace'), caption('EdgeInsetsDirectional.only({ start: 10 })')
        ] }) })
    ] }),
    // Table: column 0 is the first child of each row, at the start side.
    new Table({
      border: TableBorder.all({ color: PdfColors.blueGrey300, width: 0.5 }),
      columnWidths: { 0: new FixedColumnWidth(20), 1: new FlexColumnWidth(3), 2: new FixedColumnWidth(30), 3: new FlexColumnWidth(1.4) },
      children: [['#', 'Item', 'Qty', 'Price'], ...ITEMS].map((cells, row) => new TableRow({
        decoration: row === 0 ? new BoxDecoration({ color: PdfColors.indigo50 }) : null,
        children: cells.map(value => new Container({ padding: 3, child: text(value, 8) }))
      }))
    }),
    // TableHelper: AlignmentDirectional.centerEnd keeps the amounts on the end side.
    TableHelper.fromTextArray({
      headers: ['Subtotal', 'Tax', 'Total'],
      data: [['475.50', '47.55', '523.05']],
      headerCount: 0,
      cellAlignment: AlignmentDirectional.centerEnd,
      headerAlignment: AlignmentDirectional.centerStart,
      cellPadding: EdgeInsetsDirectional.only({ start: 4, end: 6, top: 2, bottom: 2 }),
      headerStyle: new TextStyle({ fontSize: 8, color: PdfColors.blueGrey700 }),
      cellStyle: new TextStyle({ fontSize: 9 }),
      border: TableBorder.all({ color: PdfColors.blueGrey200, width: 0.5 })
    }),
    // Stack: AlignmentDirectional and PositionedDirectional resolve at layout.
    new Container({ height: 56, decoration: new BoxDecoration({ color: PdfColors.grey100 }), child: new Stack({
      alignment: AlignmentDirectional.centerStart,
      children: [
        new Container({ padding: EdgeInsetsDirectional.only({ start: 8 }),
          child: text('Stack(alignment: centerStart)') }),
        new PositionedDirectional({ end: 6, top: 6, child: chip('PAID', PdfColors.green600, 46) }),
        new PositionedDirectional({ end: 6, bottom: 6, child: caption('PositionedDirectional({ end: 6 })') })
      ]
    }) }),
    // A gradient from centerStart to centerEnd runs from the start side.
    new Container({ height: 18, decoration: new BoxDecoration({ gradient: new LinearGradient({
      colors: [PdfColors.indigo, PdfColors.cyan100], begin: AlignmentDirectional.centerStart, end: AlignmentDirectional.centerEnd
    }) }), child: new Center({ child: text('LinearGradient(centerStart -> centerEnd)', 7, PdfColors.white) }) })
  ] });

  const grid = (count, padding) => () => frame(new GridView({
    crossAxisCount: count,
    childAspectRatio: 0.5,
    crossAxisSpacing: 6,
    mainAxisSpacing: 6,
    padding,
    children: Array.from({ length: count * 2 }, (_, index) => chip(String(index + 1),
      index % count === 0 ? PdfColors.indigo : PdfColors.blueGrey400, null))
  }));
  const wrap = () => frame(new Wrap({ spacing: 6, runSpacing: 6, children: Array.from({ length: 9 }, (_, index) =>
    chip(String(index + 1), index === 0 ? PdfColors.indigo : PdfColors.teal400, 40 + (index % 3) * 14)) }));
  const verticalWrap = () => frame(new SizedBox({ height: 80, child: new Wrap({ direction: 'vertical', spacing: 4, runSpacing: 6,
    children: Array.from({ length: 7 }, (_, index) => chip(String(index + 1), index === 0 ? PdfColors.indigo : PdfColors.purple300)) }) }));
  const column = () => frame(new Column({ mainAxisSize: 'min', crossAxisAlignment: 'start', gap: 3, children: [
    chip('start', PdfColors.indigo, 70), chip('2', PdfColors.blueGrey400, 110), chip('3', PdfColors.blueGrey400, 40)
  ] }));

  document.addPage(new Page({ pageFormat: PageFormat.A4, margin: 32, build: () => new Column({
    crossAxisAlignment: 'start', gap: 10, children: [
      text('Directional layout / phase 6.9', 20, PdfColors.indigo),
      caption('The same widget tree under each direction: a Row, a Table, TableHelper, a Stack and a gradient. rtl starts on the right.'),
      both(invoice)
    ] }) }));

  document.addPage(new Page({ pageFormat: PageFormat.A4, margin: 32, build: () => new Column({
    crossAxisAlignment: 'start', gap: 10, children: [
      heading('GridView mirrors each cell about the padded band'),
      caption('crossAxisCount 4, padding EdgeInsetsDirectional.only({ start: 24 }). Upstream before PR #1980 shifted rtl cells by about a cell.'),
      both(grid(4, EdgeInsetsDirectional.only({ start: 24 }))),
      caption('crossAxisCount 1: upstream placed the rtl cell a whole grid width to the right.'),
      both(grid(1, 0), 120),
      heading('Wrap places runs from the start side'),
      both(wrap),
      caption('A vertical Wrap fills columns, and rtl adds them leftwards.'),
      both(verticalWrap),
      heading('Column crossAxisAlignment.start follows the direction'),
      both(column, 180)
    ] }) }));

  const block = (label, width, color) => new Container({ width, height: 28, alignment: 'center',
    margin: EdgeInsetsDirectional.only({ bottom: 6 }), decoration: new BoxDecoration({ color }), child: text(label, 9, PdfColors.white) });
  const blocks = () => [
    text('MultiPage children narrower than the body are placed by crossAxisAlignment', 10),
    block('200pt', 200, PdfColors.indigo),
    block('320pt', 320, PdfColors.blueGrey500),
    block('120pt', 120, PdfColors.teal500)
  ];
  const strip = label => () => new Container({ padding: 4, decoration: new BoxDecoration({ color: PdfColors.indigo50 }),
    child: text(label, 8, PdfColors.indigo) });

  document.addPage(new MultiPage({
    pageFormat: PageFormat.A4,
    margin: 48,
    gap: 6,
    crossAxisAlignment: 'center',
    header: strip('MultiPage({ crossAxisAlignment: "center" })'),
    build: () => [heading('MultiPage.crossAxisAlignment: center'), ...blocks()]
  }));

  document.addPage(new MultiPage({
    pageFormat: PageFormat.A4,
    margin: EdgeInsetsDirectional.only({ start: 96, end: 32, top: 48, bottom: 48 }),
    textDirection: 'rtl',
    gap: 6,
    crossAxisAlignment: 'end',
    header: strip('rtl page: the header sits on the start (right) side'),
    footer: strip('margin EdgeInsetsDirectional.only({ start: 96, end: 32 })'),
    build: () => [
      heading('MultiPage.crossAxisAlignment: end, textDirection: rtl'),
      caption('Under rtl, end is the left side and the 96pt start margin is on the right'),
      ...blocks(),
      new SizedBox({ height: 10 }),
      text('Table columns follow the page direction, so # is the rightmost column', 10),
      new SizedBox({ height: 4 }),
      TableHelper.fromTextArray({
        headers: ['#', 'Item', 'Qty', 'Price'],
        data: ITEMS,
        cellAlignment: AlignmentDirectional.centerStart,
        cellAlignments: { 3: AlignmentDirectional.centerEnd },
        headerStyle: new TextStyle({ fontSize: 9, color: PdfColors.white }),
        headerDecoration: new BoxDecoration({ color: PdfColors.indigo }),
        cellStyle: new TextStyle({ fontSize: 9 }),
        border: TableBorder.all({ color: PdfColors.blueGrey300, width: 0.5 })
      })
    ]
  }));

  return document.save();
}
