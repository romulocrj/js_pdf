/*
 * js_pdf widget layout and tables phase 7.6 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore';

/** A 30x40 portrait test card: a dark band on top, blue above orange. */
function portraitBytes() {
  const width = 30;
  const height = 40;
  const bytes = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const color = y < 6 ? [30, 41, 59] : y < 23 ? [59, 130, 246] : [249, 115, 22];
      bytes.set([...color, 255], offset);
    }
  }
  return bytes;
}

export function generateLayoutPhase76(api = defaultApi, compress = true) {
  const { Document, Page, MultiPage, PageFormat, Text, TextStyle, Column, Row, Container,
    SizedBox, ConstrainedBox, Center, Stack, Table, TableRow, TableBorder, TableHelper,
    FixedColumnWidth, FlexColumnWidth, Transform, Image, RawImage, Chart, CartesianGrid,
    FixedAxis, LineDataSet, PointChartValue, LinearProgressIndicator,
    CircularProgressIndicator } = api;
  const document = new Document({ compress, title: 'Widget layout and tables', author: 'Romulo Campos' });
  const heading = text => new Text(text, { style: new TextStyle({ fontSize: 13, color: '#1e3a8a' }) });
  const caption = text => new Text(text, { style: new TextStyle({ fontSize: 8.5, color: '#475569' }) });
  const cellStyle = new TextStyle({ fontSize: 10 });
  const rows = [['ATLANTICA', LOREM], ['PACIFICO', 'short']];
  const table = columnWidths => new ConstrainedBox({
    constraints: { maxWidth: 200 },
    child: new Table({
      border: TableBorder.all({ width: 0.5, color: '#64748b' }),
      columnWidths,
      children: rows.map(cells => new TableRow({ children: cells.map(value => new Text(value, { style: cellStyle })) }))
    })
  });
  const side = (label, child) => new Column({ crossAxisAlignment: 'start', gap: 4, children: [caption(label), child] });
  const slot = child => new Container({
    width: 120,
    height: 160,
    alignment: 'topLeft',
    decoration: { border: { color: '#94a3b8', width: 0.5 } },
    child
  });
  const portrait = () => new Image(new RawImage({ bytes: portraitBytes(), width: 30, height: 40 }));

  document.addPage(new Page({ pageFormat: PageFormat.A4, margin: 32,
    build: () => new Column({ crossAxisAlignment: 'start', gap: 10, children: [
      new Text('Widget layout and tables / phase 7.6', { style: new TextStyle({ fontSize: 20, color: '#1e3a8a' }) }),

      heading('An overflowing table keeps every word whole'),
      new Row({ gap: 24, crossAxisAlignment: 'start', children: [
        side('Before: one factor scaled every column (first column held at 1.0-beta width)',
          table({ 0: new FixedColumnWidth(47.82), 1: new FlexColumnWidth() })),
        side('After: no column below its longest word', table(null))
      ] }),

      heading('Transform.rotateBox fits the slot it is given'),
      new Row({ gap: 24, crossAxisAlignment: 'start', children: [
        // The old rotateBox, reproduced: the child measured against the
        // unrotated slot, then turned a quarter and moved back into view.
        side('Before (reproduced): measured unrotated, so it overflows',
          slot(new Transform({ transform: [0, -1, 1, 0, 0, 120], child: portrait() }))),
        side('After: a quarter turn measures against swapped constraints',
          slot(new Transform({ rotateBox: Math.PI / 2, child: portrait() })))
      ] }),

      heading('A rotated vertical axis reserves its labels\' height'),
      caption('Turned labels hang below their value. The axis now reserves the first label\'s height, so "0 kWh" stays inside the chart; it used to reserve the text height only and spill below.'),
      new SizedBox({ height: 160, child: new Chart({
        grid: new CartesianGrid({
          xAxis: FixedAxis.fromStrings(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], { marginStart: 10, marginEnd: 10 }),
          yAxis: new FixedAxis([0, 500, 1000], {
            angle: Math.PI / 2,
            divisions: true,
            textStyle: new TextStyle({ fontSize: 9 }),
            format: value => `${value} kWh`
          })
        }),
        datasets: [new LineDataSet({
          color: '#0891b2',
          data: [120, 480, 390, 860, 640, 1000].map((value, index) => new PointChartValue(index, value))
        })]
      }) }),

      heading('Row[Stack(fit: expand)] and progress indicators in a Row'),
      new SizedBox({ height: 36, child: new Row({ gap: 12, children: [
        new Stack({ fit: 'expand', children: [
          new Container({ width: 150, background: '#dbeafe' }),
          new Center({ child: new Text('Stack(expand) in a Row', { style: cellStyle }) })
        ] }),
        new LinearProgressIndicator({ value: 0.35, fallbackWidth: 140 }),
        new CircularProgressIndicator({ value: 0.7, fallbackWidth: 36 }),
        new CircularProgressIndicator({ value: 0.25, fallbackWidth: 36, backgroundColor: '#e2e8f0', color: '#16a34a' })
      ] }) }),
      caption('Each used to write a non-finite coordinate; the indicators now take a fallback size on the unbounded width.'),
      caption('The next pages hold a long MultiPage table: its column widths are measured once and each page lays out only its own rows.')
    ] })
  }));

  const categories = ['Hardware', 'Software', 'Services', 'Training', 'Support'];
  document.addPage(new MultiPage({ pageFormat: PageFormat.A4, margin: 32, maxPages: 20,
    header: context => new Text(`Long table / page ${context.pageNumber}`, { style: new TextStyle({ fontSize: 9, color: '#64748b' }) }),
    build: () => [TableHelper.fromTextArray({
      headers: ['#', 'Item', 'Category', 'Qty', 'Amount'],
      data: Array.from({ length: 240 }, (_, index) => [
        String(index + 1),
        `Line item ${index + 1}${index % 9 === 0 ? ' with a longer description that wraps' : ''}`,
        categories[index % categories.length],
        String(1 + (index * 7) % 23),
        ((index * 37.5) % 1000).toFixed(2)
      ]),
      cellStyle: new TextStyle({ fontSize: 9 }),
      headerStyle: new TextStyle({ fontSize: 9, fontWeight: 'bold' }),
      border: TableBorder.all({ width: 0.25, color: '#94a3b8' })
    })]
  }));
  return document.save();
}
