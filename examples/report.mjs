/*
 * js_pdf port of demo/lib/examples/report.dart from dart_pdf.
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';
import { customData, requireFeatures } from './upstream-example-helpers.mjs';

export function generateReport(pageFormat = pw.PageFormat.A4, _data = customData, resources = {}) {
  requireFeatures(pw, 'report', [
    'BarDataSet', 'CartesianGrid', 'Chart', 'ChartLegend', 'Divider', 'FixedAxis',
    'Font', 'LineDataSet', 'PieDataSet', 'PieGrid', 'PointChartValue',
    'SizedBox', 'TextStyle', 'ThemeData'
  ]);

  const tableHeaders = ['Category', 'Budget', 'Expense', 'Result'];
  const dataTable = [
    ['Phone', 80, 95], ['Internet', 250, 230], ['Electricity', 300, 375],
    ['Movies', 85, 80], ['Food', 300, 350], ['Fuel', 650, 550],
    ['Insurance', 250, 310]
  ];
  const budget = dataTable.reduce((sum, row) => sum + row[1], 0);
  const expense = dataTable.reduce((sum, row) => sum + row[2], 0);
  const baseColor = '#00bcd4';
  const document = new pw.Document();
  const theme = pw.ThemeData.withFont({
    base: pw.Font.ttf(resources.openSans),
    bold: pw.Font.ttf(resources.openSansBold)
  });

  const chart1 = new pw.Chart({
    left: new pw.Container({
      alignment: 'topCenter',
      margin: { right: 5, top: 10 },
      child: new pw.Transform({ rotateBox: Math.PI / 2, child: new pw.Text('Amount') })
    }),
    overlay: new pw.ChartLegend({
      position: [-0.7, 1],
      decoration: { color: '#ffffff', border: { color: '#000000', width: 0.5 } }
    }),
    grid: new pw.CartesianGrid({
      xAxis: pw.FixedAxis.fromStrings(dataTable.map(row => row[0]), { marginStart: 30, marginEnd: 30, ticks: true }),
      yAxis: new pw.FixedAxis([0, 100, 200, 300, 400, 500, 600, 700], { format: value => `$${value}`, divisions: true })
    }),
    datasets: [
      new pw.BarDataSet({
        color: '#bbdefb', legend: tableHeaders[2], width: 15, offset: -10, borderColor: baseColor,
        data: dataTable.map((row, index) => new pw.PointChartValue(index, row[2]))
      }),
      new pw.BarDataSet({
        color: '#ffecb3', legend: tableHeaders[1], width: 15, offset: 10, borderColor: '#ffc107',
        data: dataTable.map((row, index) => new pw.PointChartValue(index, row[1]))
      })
    ]
  });

  const chart2 = new pw.Chart({
    right: new pw.ChartLegend(),
    grid: new pw.CartesianGrid({
      xAxis: new pw.FixedAxis([0, 1, 2, 3, 4, 5, 6]),
      yAxis: new pw.FixedAxis([0, 200, 400, 600], { divisions: true })
    }),
    datasets: [
      new pw.LineDataSet({
        legend: 'Expense', drawSurface: true, isCurved: true, drawPoints: false, color: baseColor,
        data: dataTable.map((row, index) => new pw.PointChartValue(index, row[2]))
      })
    ]
  });

  const table = pw.TableHelper.fromTextArray({
    border: null,
    headers: tableHeaders,
    data: dataTable.map(row => [row[0], row[1], row[2], row[1] - row[2]]),
    headerStyle: new pw.TextStyle({ color: '#ffffff', fontWeight: 'bold' }),
    headerDecoration: { color: baseColor },
    rowDecoration: { border: { bottom: { color: baseColor, width: 0.5 } } },
    cellAlignment: 'centerRight',
    cellAlignments: { 0: 'centerLeft' }
  });

  document.addPage(
    new pw.Page({
      pageFormat,
      theme,
      build: () => new pw.Column({
        children: [
          new pw.Text('Budget Report', { style: new pw.TextStyle({ color: baseColor, fontSize: 40 }) }),
          new pw.Divider({ thickness: 4 }),
          new pw.Expanded({ flex: 3, child: chart1 }),
          new pw.Divider(),
          new pw.Expanded({ flex: 2, child: chart2 }),
          new pw.SizedBox({ height: 10 }),
          new pw.Row({
            crossAxisAlignment: 'start',
            children: [
              new pw.Expanded({
                child: new pw.Column({
                  children: [
                    new pw.Container({
                      alignment: 'centerLeft', padding: { bottom: 10 },
                      child: new pw.Text('Expense By Sub-Categories', { style: new pw.TextStyle({ color: baseColor, fontSize: 16 }) })
                    }),
                    new pw.Text('Total expenses are broken into different categories for closer look into where the money was spent.', { align: 'justify' })
                  ]
                })
              }),
              new pw.SizedBox({ width: 10 }),
              new pw.Expanded({
                child: new pw.Column({
                  children: [
                    new pw.Container({
                      alignment: 'centerLeft', padding: { bottom: 10 },
                      child: new pw.Text('Spent vs. Saved', { style: new pw.TextStyle({ color: baseColor, fontSize: 16 }) })
                    }),
                    new pw.Text(`Budget was originally $${budget}. A total of $${expense} was spent on the month of January which exceeded the overall budget by $${expense - budget}`, { align: 'justify' })
                  ]
                })
              })
            ]
          })
        ]
      })
    })
  );

  const chartColors = ['#64b5f6', '#81c784', '#ffd54f', '#f06292', '#4dd0e1', '#ba68c8', '#dce775'];
  document.addPage(
    new pw.Page({
      pageFormat,
      theme,
      build: () => new pw.Column({
        children: [
          new pw.Flexible({
            child: new pw.Chart({
              title: new pw.Text('Expense breakdown', { style: new pw.TextStyle({ color: baseColor, fontSize: 20 }) }),
              grid: new pw.PieGrid(),
              datasets: dataTable.map((row, index) => new pw.PieDataSet({
                legend: `${row[0]}\n${Math.round(row[2] / expense * 100)}%`,
                value: row[2],
                color: chartColors[index % chartColors.length],
                legendStyle: new pw.TextStyle({ fontSize: 10 })
              }))
            })
          }),
          table
        ]
      })
    })
  );

  return document.save();
}
