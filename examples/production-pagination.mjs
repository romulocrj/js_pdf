/*
 * js_pdf production pagination regression example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Proves that an area-chart heading and chart stay together when the remaining
 * page space cannot hold the complete section.
 */

import * as pw from '../dist/js_pdf.mjs';

const QR_URL = 'https://github.com/romulocrj/js_pdf';

const LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120" viewBox="0 0 420 120">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563eb"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="108" height="108" rx="28" fill="url(#g)"/>
  <path d="M32 73c0-22 14-38 35-38 13 0 23 6 30 16l-15 12c-4-6-9-9-16-9-10 0-17 8-17 19s7 19 17 19c8 0 13-3 17-10l15 11c-7 11-18 17-31 17-21 0-35-16-35-37Z" fill="#fff"/>
  <circle cx="88" cy="28" r="8" fill="#fbbf24"/>
  <text x="136" y="76" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700" fill="#0f172a">BLUNANA</text>
  <text x="140" y="101" font-family="Arial, Helvetica, sans-serif" font-size="14" letter-spacing="3" fill="#64748b">REPORTS THAT MOVE</text>
</svg>`;

function buildLogo() {
  return new pw.SvgImage({ svg: LOGO_SVG, width: 190, fit: 'contain' });
}

function buildImageCard(title, caption, imageBytes, accentColor) {
  return new pw.Expanded({
    child: new pw.Container({
      padding: 8,
      decoration: { color: '#ffffff', border: { color: accentColor, width: 1 } },
      child: new pw.Column({
        children: [
          new pw.Container({
            height: 112,
            child: new pw.Image(new pw.MemoryImage(imageBytes), {
              width: 210,
              height: 112,
              fit: 'cover',
              alignment: 'center'
            })
          }),
          new pw.SizedBox({ height: 7 }),
          new pw.Text(title, { fontSize: 11, fontWeight: 'bold', color: '#0f172a' }),
          new pw.SizedBox({ height: 3 }),
          new pw.Text(caption, { fontSize: 8, color: '#64748b' })
        ]
      })
    })
  });
}

function buildProgress(label, value, color) {
  return new pw.Column({
    crossAxisAlignment: 'start',
    children: [
      new pw.Row({
        children: [
          new pw.Expanded({ child: new pw.Text(label, { fontSize: 9, color: '#334155' }) }),
          new pw.Text(`${value}%`, { fontSize: 9, fontWeight: 'bold', color })
        ]
      }),
      new pw.SizedBox({ height: 4 }),
      new pw.Container({
        height: 8,
        alignment: 'centerLeft',
        decoration: { color: '#e2e8f0' },
        child: new pw.Container({
          width: 280 * value / 100,
          height: 8,
          alignment: 'centerLeft',
          decoration: { color }
        })
      })
    ]
  });
}

function buildFakeRows() {
  return [
    ['Jan', 12400, 9800],
    ['Feb', 13800, 11200],
    ['Mar', 15100, 12600],
    ['Apr', 14700, 11900],
    ['May', 16900, 14100],
    ['Jun', 18100, 15300]
  ];
}

function buildTable(rows) {
  return pw.TableHelper.fromTextArray({
    headers: ['Month', 'Revenue', 'Expenses', 'Result'],
    data: rows.map(row => [
      row[0],
      `$ ${row[1].toLocaleString('en-US')}`,
      `$ ${row[2].toLocaleString('en-US')}`,
      `$ ${(row[1] - row[2]).toLocaleString('en-US')}`
    ]),
    headerStyle: new pw.TextStyle({ color: '#ffffff', fontWeight: 'bold', fontSize: 10 }),
    headerDecoration: { color: '#2563eb' },
    cellStyle: new pw.TextStyle({ fontSize: 9 }),
    rowDecoration: { border: { bottom: { color: '#dbeafe', width: 0.5 } } },
    cellAlignment: 'centerRight',
    cellAlignments: { 0: 'centerLeft' },
    cellPadding: 6
  });
}

function buildChart(rows) {
  return new pw.Chart({
    left: new pw.Container({
      margin: { right: 6 },
      child: new pw.Text('R$', { fontSize: 9, color: '#64748b' })
    }),
    grid: new pw.CartesianGrid({
      xAxis: pw.FixedAxis.fromStrings(rows.map(row => row[0]), {
        marginStart: 20,
        marginEnd: 20,
        ticks: true
      }),
      yAxis: new pw.FixedAxis([0, 5000, 10000, 15000, 20000], {
        format: value => `${value / 1000}k`,
        divisions: true
      })
    }),
    datasets: [
      new pw.BarDataSet({
        color: '#93c5fd',
        borderColor: '#2563eb',
        legend: 'Revenue',
        width: 14,
        offset: -9,
        data: rows.map((row, index) => new pw.PointChartValue(index, row[1]))
      }),
      new pw.BarDataSet({
        color: '#fca5a5',
        borderColor: '#dc2626',
        legend: 'Expenses',
        width: 14,
        offset: 9,
        data: rows.map((row, index) => new pw.PointChartValue(index, row[2]))
      })
    ]
  });
}

function buildFakeStatusRows() {
  return [
    ['Completed', 42, '#2563eb'],
    ['Pending', 18, '#f59e0b'],
    ['Under review', 10, '#8b5cf6']
  ];
}

function buildAreaChart(rows) {
  return new pw.Chart({
    grid: new pw.CartesianGrid({
      xAxis: pw.FixedAxis.fromStrings(rows.map(row => row[0]), {
        marginStart: 20,
        marginEnd: 20,
        ticks: true
      }),
      yAxis: new pw.FixedAxis([0, 5000, 10000, 15000, 20000], {
        format: value => `${value / 1000}k`,
        divisions: true
      })
    }),
    datasets: [
      new pw.LineDataSet({
        legend: 'Accumulated revenue',
        color: '#7c3aed',
        lineWidth: 2,
        isCurved: true,
        drawPoints: true,
        pointSize: 2.5,
        drawSurface: true,
        surfaceOpacity: 0.22,
        data: rows.map((row, index) => new pw.PointChartValue(index, row[1]))
      })
    ]
  });
}

function buildStatusChart(rows) {
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  return new pw.Chart({
    grid: new pw.PieGrid(),
    datasets: rows.map(row => new pw.PieDataSet({
      legend: `${row[0]}\n${row[1]} (${Math.round((row[1] / total) * 100)}%)`,
      value: row[1],
      color: row[2],
      legendStyle: new pw.TextStyle({ fontSize: 8 }),
      legendPosition: 'outside',
      legendOffset: 12
    }))
  });
}

function buildQrCode() {
  return new pw.BarcodeWidget({
    barcode: pw.Barcode.qrCode(),
    data: QR_URL,
    width: 120,
    height: 120
  });
}

function buildReferenceCard(title, description, color) {
  return new pw.Expanded({
    child: new pw.Container({
      padding: 9,
      decoration: { color: '#ffffff', border: { color, width: 1 } },
      child: new pw.Column({
        children: [
          new pw.Text(title, { fontSize: 10, fontWeight: 'bold', color: '#0f172a' }),
          new pw.SizedBox({ height: 4 }),
          new pw.Text(description, { fontSize: 8, color: '#64748b' })
        ]
      })
    })
  });
}

function buildReferenceGuide() {
  return new pw.Container({
    padding: 10,
    decoration: { color: '#f8fafc', border: { color: '#cbd5e1', width: 1 } },
    child: new pw.Column({
      children: [
        new pw.Row({
          children: [
            buildReferenceCard('Rich text', 'Headings, paragraphs, highlights and clickable links.', '#93c5fd'),
            new pw.SizedBox({ width: 8 }),
            buildReferenceCard('Layout', 'Rows, columns, cards, spacing and alignment.', '#c4b5fd'),
            new pw.SizedBox({ width: 8 }),
            buildReferenceCard('Navigation', 'Headers, footers, page numbers and external references.', '#86efac')
          ]
        }),
        new pw.SizedBox({ height: 10 }),
        new pw.RichText({
          text: new pw.TextSpan({
            children: [
              new pw.TextSpan({
                text: 'Rich text example: ',
                style: new pw.TextStyle({ fontWeight: 'bold', color: '#0f172a' })
              }),
              new pw.TextSpan({
                text: 'approved result',
                style: new pw.TextStyle({ color: '#16a34a', fontWeight: 'bold' })
              }),
              new pw.TextSpan({
                text: ' · see the ',
                style: new pw.TextStyle({ color: '#475569' })
              }),
              new pw.TextSpan({
                text: 'online documentation',
                style: new pw.TextStyle({ color: '#2563eb', decoration: 'underline' }),
                annotation: new pw.AnnotationUrl('https://github.com/romulocrj/js_pdf')
              })
            ]
          })
        }),
        new pw.SizedBox({ height: 8 }),
        new pw.Bullet({ text: 'Bulleted lists for instructions and criteria.' }),
        new pw.Bullet({ text: 'Cards and bands for highlighting indicators.' }),
        new pw.Bullet({ text: 'Raster images, SVG, charts and barcodes.' }),
        new pw.Bullet({ text: 'Interactive fields for collecting data in the PDF.' })
      ]
    })
  });
}

function buildInteractiveExample() {
  return new pw.Container({
    padding: 10,
    decoration: { color: '#eff6ff', border: { color: '#bfdbfe', width: 1 } },
    child: new pw.Column({
      children: [
        new pw.Text('Interactive fields', { fontSize: 13, fontWeight: 'bold', color: '#1e3a8a' }),
        new pw.SizedBox({ height: 4 }),
        new pw.Text(
          'AcroForm field examples that can be edited in compatible PDF readers.',
          { fontSize: 8, color: '#475569' }
        ),
        new pw.SizedBox({ height: 9 }),
        new pw.Row({
          children: [
            new pw.Expanded({
              child: new pw.Column({
                children: [
                  new pw.Text('Approver name', { fontSize: 9, fontWeight: 'bold', color: '#0f172a' }),
                  new pw.SizedBox({ height: 4 }),
                  new pw.TextField({ name: 'approver-name', value: 'Marcos Oliveira', width: 210, height: 25 })
                ]
              })
            }),
            new pw.SizedBox({ width: 10 }),
            new pw.Expanded({
              child: new pw.Column({
                children: [
                  new pw.Text('Priority', { fontSize: 9, fontWeight: 'bold', color: '#0f172a' }),
                  new pw.SizedBox({ height: 4 }),
                  new pw.ChoiceField({
                    name: 'priority',
                    items: ['High', 'Medium', 'Low'],
                    value: 'Medium',
                    height: 25
                  })
                ]
              })
            })
          ]
        }),
        new pw.SizedBox({ height: 8 }),
        new pw.Row({
          children: [
            new pw.Checkbox({ name: 'approved', value: true, width: 16, height: 16 }),
            new pw.SizedBox({ width: 5 }),
            new pw.Text('Approval recorded', { fontSize: 9, color: '#334155' })
          ]
        })
      ]
    })
  });
}

export function generateProductionPaginationExample(profileImageBytes, galleryImageBytes = profileImageBytes) {
  const rows = buildFakeRows();
  const statusRows = buildFakeStatusRows();
  const totalRevenue = rows.reduce((sum, row) => sum + row[1], 0);
  const totalExpenses = rows.reduce((sum, row) => sum + row[2], 0);
  const document = new pw.Document({
    title: 'Demonstration report',
    author: 'Blunana',
    subject: 'Demonstration of visual PDF composition features',
    keywords: 'pdf, report, charts, images, svg, qr code'
  });

  document.addPage(new pw.MultiPage({
    pageFormat: pw.PageFormat.A4,
    margin: 36,
    header: () => new pw.Text('DEMONSTRATION REPORT', { fontSize: 9, color: '#64748b' }),
    footer: context => new pw.Text(
      `Page ${context.pageNumber} of ${context.pagesCount}`,
      { align: 'center', fontSize: 9, color: '#64748b' }
    ),
    build: () => [
      new pw.Row({
        children: [
          new pw.Expanded({ child: buildLogo() }),
          new pw.Column({
            crossAxisAlignment: 'end',
            children: [
              new pw.Text('DEMO EDITION', { fontSize: 9, fontWeight: 'bold', color: '#7c3aed' }),
              new pw.SizedBox({ height: 4 }),
              new pw.Text('Aug 6, 2026', { fontSize: 9, color: '#64748b' })
            ]
          })
        ]
      }),
      new pw.SizedBox({ height: 14 }),
      new pw.Header({
        text: 'Financial summary',
        level: 0,
        textStyle: new pw.TextStyle({ color: '#1d4ed8', fontSize: 24 })
      }),
      new pw.Paragraph({
        text: 'Fictional data demonstrating tables, charts and a QR code in a PDF generated with js_pdf.'
      }),
      new pw.SizedBox({ height: 12 }),
      new pw.Container({
        padding: 10,
        decoration: { color: '#f5f3ff', border: { color: '#ddd6fe', width: 1 } },
        child: new pw.Row({
          crossAxisAlignment: 'start',
          children: [
            new pw.Container({
              width: 78,
              height: 78,
              child: new pw.Image(new pw.MemoryImage(profileImageBytes), {
                width: 78,
                height: 78,
                fit: 'cover'
              })
            }),
            new pw.SizedBox({ width: 12 }),
            new pw.Expanded({
              child: new pw.Column({
                children: [
                  new pw.Text('Report owner profile', { fontSize: 12, fontWeight: 'bold', color: '#4c1d95' }),
                  new pw.SizedBox({ height: 5 }),
                  new pw.Text('Marcos Oliveira · Operations director', {
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: '#0f172a'
                  }),
                  new pw.SizedBox({ height: 4 }),
                  new pw.Text(
                    'An image embedded in the PDF to demonstrate profiles, avatars and visual identity.',
                    { fontSize: 9, color: '#64748b' }
                  )
                ]
              })
            })
          ]
        })
      }),
      new pw.SizedBox({ height: 14 }),
      new pw.Row({
        children: [
          new pw.Expanded({
            child: new pw.Container({
              padding: 10,
              decoration: { color: '#eff6ff', border: { color: '#bfdbfe', width: 1 } },
              child: new pw.Column({
                children: [
                  new pw.Text('Total revenue', { fontSize: 10, color: '#475569' }),
                  new pw.Text(`$ ${totalRevenue.toLocaleString('en-US')}`, {
                    fontSize: 16,
                    fontWeight: 'bold',
                    color: '#1d4ed8'
                  })
                ]
              })
            })
          }),
          new pw.SizedBox({ width: 10 }),
          new pw.Expanded({
            child: new pw.Container({
              padding: 10,
              decoration: { color: '#fef2f2', border: { color: '#fecaca', width: 1 } },
              child: new pw.Column({
                children: [
                  new pw.Text('Total expenses', { fontSize: 10, color: '#475569' }),
                  new pw.Text(`$ ${totalExpenses.toLocaleString('en-US')}`, {
                    fontSize: 16,
                    fontWeight: 'bold',
                    color: '#b91c1c'
                  })
                ]
              })
            })
          })
        ]
      }),
      new pw.SizedBox({ height: 18 }),
      new pw.Text('Monthly evolution', { fontSize: 16, fontWeight: 'bold', color: '#0f172a' }),
      new pw.SizedBox({ height: 8 }),
      new pw.Container({ height: 230, child: buildChart(rows) }),
      new pw.SizedBox({ height: 18 }),
      new pw.Text('Status distribution (Separated)', { fontSize: 16, fontWeight: 'bold', color: '#0f172a' }),
      new pw.SizedBox({ height: 8 }),
      new pw.Container({
        height: 190,
        padding: 8,
        decoration: { color: '#f8fafc', border: { color: '#e2e8f0', width: 1 } },
        child: buildStatusChart(statusRows)
      }),
      new pw.SizedBox({ height: 18 }),
      new pw.Text('Gallery and embedded media', { fontSize: 16, fontWeight: 'bold', color: '#0f172a' }),
      new pw.SizedBox({ height: 8 }),
      new pw.Row({
        crossAxisAlignment: 'start',
        children: [
          buildImageCard(
            'Embedded image',
            'Image loaded from examples/assets.',
            profileImageBytes,
            '#c4b5fd'
          ),
          new pw.SizedBox({ width: 10 }),
          buildImageCard(
            'Second local image',
            'No network access during generation.',
            galleryImageBytes,
            '#93c5fd'
          )
        ]
      }),
      new pw.SizedBox({ height: 18 }),
      new pw.Text('Execution indicators', { fontSize: 16, fontWeight: 'bold', color: '#0f172a' }),
      new pw.SizedBox({ height: 8 }),
      new pw.Container({
        padding: 10,
        decoration: { color: '#f8fafc', border: { color: '#e2e8f0', width: 1 } },
        child: new pw.Column({
          children: [
            buildProgress('Processing completed', 92, '#16a34a'),
            new pw.SizedBox({ height: 9 }),
            buildProgress('Data reconciled', 78, '#2563eb'),
            new pw.SizedBox({ height: 9 }),
            buildProgress('Items reviewed', 64, '#f59e0b')
          ]
        })
      }),
      new pw.SizedBox({ height: 18 }),

      // Inseparable measures the complete section before MultiPage places it.
      new pw.Inseparable({
        child: new pw.Container({
          padding: { top: 14, bottom: 0 },
          child: new pw.Column({
            children: [
              new pw.Text('Area chart (Inseparable)', { fontSize: 16, fontWeight: 'bold', color: '#0f172a' }),
              new pw.SizedBox({ height: 8 }),
              new pw.Container({
                height: 210,
                padding: 8,
                decoration: { color: '#faf5ff', border: { color: '#ddd6fe', width: 1 } },
                child: buildAreaChart(rows)
              })
            ]
          })
        })
      }),
      new pw.SizedBox({ height: 14 }),
      buildInteractiveExample(),
      new pw.SizedBox({ height: 18 }),
      new pw.Text('Results table', { fontSize: 16, fontWeight: 'bold', color: '#0f172a' }),
      new pw.SizedBox({ height: 8 }),
      buildTable(rows),
      new pw.SizedBox({ height: 22 }),
      new pw.Row({
        crossAxisAlignment: 'start',
        children: [
          new pw.Expanded({
            child: new pw.Column({
              children: [
                new pw.Text('Open the demonstration address', {
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: '#0f172a'
                }),
                new pw.SizedBox({ height: 6 }),
                new pw.Text(QR_URL, { fontSize: 10, color: '#475569' }),
                new pw.SizedBox({ height: 6 }),
                new pw.Text('Scan the QR code on the right.', { fontSize: 10, color: '#64748b' })
              ]
            })
          }),
          new pw.SizedBox({ width: 18 }),
          buildQrCode()
        ]
      })
    ]
  }));

  document.addPage(new pw.Page({
    pageFormat: pw.PageFormat.A4,
    margin: 36,
    build: () => new pw.Column({
      children: [
        new pw.Text('Available elements guide', {
          fontSize: 24,
          fontWeight: 'bold',
          color: '#1d4ed8'
        }),
        new pw.SizedBox({ height: 16 }),
        buildReferenceGuide()
      ]
    })
  }));

  return document.save();
}
