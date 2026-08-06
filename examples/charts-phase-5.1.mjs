/*
 * js_pdf phase 5.1 charts example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

/*
 * Four landscape pages, one per chart family, four variations each, so every
 * grid, data set and legend option the port exposes is exercised somewhere.
 * Host-free and synchronous: the V8 harness runs this same file.
 */

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
const expense = [95, 230, 375, 80, 350, 550, 310];
const budget = [80, 250, 300, 85, 300, 650, 250];
const forecast = [120, 200, 340, 140, 300, 480, 360];

const ink = '#0f172a';
const cyan = '#06b6d4';
const amber = '#f59e0b';
const violet = '#8b5cf6';
const rose = '#f43f5e';
const sky = '#bae6fd';
const sand = '#fde68a';

const titleStyle = new pw.TextStyle({ fontSize: 11, color: ink, fontWeight: 'bold' });
const captionStyle = new pw.TextStyle({ fontSize: 7.5, color: '#64748b' });
const tickStyle = new pw.TextStyle({ fontSize: 7, color: '#475569' });
const legendStyle = new pw.TextStyle({ fontSize: 7 });
const valueStyle = new pw.TextStyle({ fontSize: 6.5, color: ink });

const points = values => values.map((value, index) => new pw.PointChartValue(index, value));
const transposed = values => values.map((value, index) => new pw.PointChartValue(value, index));

function monthAxis(options = {}) {
  return pw.FixedAxis.fromStrings(months, { textStyle: tickStyle, ...options });
}

function amountAxis(max, options = {}) {
  const step = max / 4;
  return new pw.FixedAxis([0, step, step * 2, step * 3, max], {
    textStyle: tickStyle,
    divisions: true,
    ...options
  });
}

/** One titled chart taking an equal share of its row. */
function cell(title, caption, chart) {
  return new pw.Expanded({
    child: new pw.Column({
      crossAxisAlignment: 'start',
      children: [
        new pw.Text(title, { style: titleStyle }),
        new pw.Text(caption, { style: captionStyle }),
        new pw.SizedBox({ height: 6 }),
        new pw.Expanded({ child: chart })
      ]
    })
  });
}

/** A landscape page holding four charts, two by two. */
function quadPage(heading, cells) {
  return new pw.Page({
    pageFormat: pw.PageFormat.A4,
    orientation: 'landscape',
    margin: 28,
    build: () => new pw.Column({
      crossAxisAlignment: 'start',
      children: [
        new pw.Text(heading, { style: new pw.TextStyle({ fontSize: 18, color: cyan }) }),
        new pw.Divider({ thickness: 1 }),
        new pw.SizedBox({ height: 4 }),
        new pw.Expanded({
          child: new pw.Row({
            crossAxisAlignment: 'start',
            children: [cells[0], new pw.SizedBox({ width: 20 }), cells[1]]
          })
        }),
        new pw.SizedBox({ height: 14 }),
        new pw.Expanded({
          child: new pw.Row({
            crossAxisAlignment: 'start',
            children: [cells[2], new pw.SizedBox({ width: 20 }), cells[3]]
          })
        })
      ]
    })
  });
}

function barPage() {
  const grouped = new pw.Chart({
    overlay: new pw.ChartLegend({
      position: [-0.85, 1],
      textStyle: legendStyle,
      decoration: { color: '#ffffff', border: { color: '#94a3b8', width: 0.5 } }
    }),
    grid: new pw.CartesianGrid({
      xAxis: monthAxis({ marginStart: 22, marginEnd: 22, ticks: true }),
      yAxis: amountAxis(700, { format: value => `$${value}` })
    }),
    datasets: [
      new pw.BarDataSet({
        legend: 'Expense', color: sky, borderColor: cyan, width: 9, offset: -6, data: points(expense)
      }),
      new pw.BarDataSet({
        legend: 'Budget', color: sand, borderColor: amber, width: 9, offset: 6, data: points(budget)
      })
    ]
  });

  const horizontal = new pw.Chart({
    grid: new pw.CartesianGrid({
      xAxis: new pw.FixedAxis([0, 200, 400, 600], { textStyle: tickStyle, divisions: true }),
      yAxis: monthAxis({ marginStart: 16, marginEnd: 16, ticks: true })
    }),
    datasets: [
      new pw.BarDataSet({
        legend: 'Expense', axis: 'vertical', color: violet, width: 10, data: transposed(expense)
      })
    ]
  });

  const labelled = new pw.Chart({
    grid: new pw.CartesianGrid({
      xAxis: monthAxis({ marginStart: 20, marginEnd: 20 }),
      yAxis: amountAxis(700)
    }),
    datasets: [
      new pw.BarDataSet({
        legend: 'Expense',
        color: cyan,
        drawBorder: false,
        surfaceOpacity: 0.55,
        width: 14,
        data: points(expense),
        buildValue: (context, value) => new pw.Text(`${value.y}`, { style: valueStyle })
      })
    ]
  });

  const mixed = new pw.Chart({
    right: new pw.ChartLegend({ textStyle: legendStyle }),
    grid: new pw.CartesianGrid({
      xAxis: monthAxis({ marginStart: 20, marginEnd: 20 }),
      yAxis: amountAxis(700, { divisionsDashed: true })
    }),
    datasets: [
      new pw.BarDataSet({
        legend: 'Budget', color: sand, borderColor: amber, width: 12, data: points(budget)
      }),
      new pw.LineDataSet({
        legend: 'Expense', color: rose, lineWidth: 1.5, pointSize: 2.5, data: points(expense)
      })
    ]
  });

  return quadPage('Bar charts', [
    cell('Grouped', 'two series offset apart, boxed overlay legend', grouped),
    cell('Horizontal', 'axis: vertical, categories down the left', horizontal),
    cell('Values on top', 'buildValue labels, translucent surface, no border', labelled),
    cell('Bars and a line', 'two data set types sharing one grid', mixed)
  ]);
}

function linePage() {
  const straight = new pw.Chart({
    right: new pw.ChartLegend({ textStyle: legendStyle }),
    grid: new pw.CartesianGrid({
      xAxis: monthAxis({ marginStart: 10, marginEnd: 10 }),
      yAxis: amountAxis(700)
    }),
    datasets: [
      new pw.LineDataSet({ legend: 'Expense', color: cyan, data: points(expense) }),
      new pw.LineDataSet({ legend: 'Budget', color: amber, data: points(budget) })
    ]
  });

  const curved = new pw.Chart({
    grid: new pw.CartesianGrid({
      xAxis: monthAxis({ marginStart: 10, marginEnd: 10 }),
      yAxis: amountAxis(700)
    }),
    datasets: [
      new pw.LineDataSet({
        legend: 'Expense',
        color: cyan,
        isCurved: true,
        drawPoints: false,
        drawSurface: true,
        surfaceOpacity: 0.25,
        data: points(expense)
      })
    ]
  });

  const labelled = new pw.Chart({
    grid: new pw.CartesianGrid({
      xAxis: monthAxis({ marginStart: 14, marginEnd: 14 }),
      yAxis: amountAxis(700, { divisionsDashed: true })
    }),
    datasets: [
      new pw.LineDataSet({
        legend: 'Forecast',
        color: violet,
        lineWidth: 1.5,
        pointSize: 2.5,
        data: points(forecast),
        buildValue: (context, value) => new pw.Text(`${value.y}`, { style: valueStyle })
      })
    ]
  });

  const layered = new pw.Chart({
    bottom: new pw.ChartLegend({
      direction: 'horizontal',
      position: 'bottomCenter',
      textStyle: legendStyle
    }),
    grid: new pw.CartesianGrid({
      xAxis: monthAxis({ marginStart: 10, marginEnd: 10 }),
      yAxis: amountAxis(700)
    }),
    datasets: [
      new pw.LineDataSet({
        legend: 'Expense', color: cyan, isCurved: true, drawPoints: false, drawSurface: true, data: points(expense)
      }),
      new pw.LineDataSet({
        legend: 'Budget', color: amber, isCurved: true, drawPoints: false, drawSurface: true, data: points(budget)
      }),
      new pw.LineDataSet({
        legend: 'Forecast', color: rose, isCurved: true, drawPoints: false, data: points(forecast)
      })
    ]
  });

  return quadPage('Line charts', [
    cell('Straight', 'two series, a point drawn at every value', straight),
    cell('Curved with surface', 'isCurved and drawSurface, points off', curved),
    cell('Labelled points', 'buildValue labels over dashed divisions', labelled),
    cell('Three series', 'stacked surfaces, horizontal legend below', layered)
  ]);
}

const sliceColors = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#a78bfa', '#fb923c'];
const sliceStyle = new pw.TextStyle({ fontSize: 7 });

function slices(options = {}) {
  return months.map((month, index) => new pw.PieDataSet({
    legend: `${month}\n${expense[index]}`,
    value: expense[index],
    color: sliceColors[index % sliceColors.length],
    legendStyle: sliceStyle,
    ...options
  }));
}

function piePage() {
  const plain = new pw.Chart({ grid: new pw.PieGrid(), datasets: slices() });

  const donut = new pw.Chart({ grid: new pw.PieGrid(), datasets: slices({ innerRadius: 40 }) });

  const exploded = new pw.Chart({
    grid: new pw.PieGrid({ startAngle: Math.PI / 6 }),
    datasets: slices({ offset: 6 })
  });

  const outside = new pw.Chart({
    grid: new pw.PieGrid(),
    datasets: months.map((month, index) => new pw.PieDataSet({
      legend: `${month} ${expense[index]}`,
      value: expense[index],
      color: sliceColors[index % sliceColors.length],
      legendStyle: sliceStyle,
      legendPosition: 'outside',
      legendOffset: 14
    }))
  });

  return quadPage('Pie charts', [
    cell('Pie', 'labels inside, colour picked against the slice', plain),
    cell('Donut', 'innerRadius carves the middle out', donut),
    cell('Exploded', 'offset pushes every slice out, start angle rotated', exploded),
    cell('Outside labels', 'legendPosition: outside, with leader lines', outside)
  ]);
}

function pointPage() {
  const scatter = new pw.Chart({
    right: new pw.ChartLegend({ textStyle: legendStyle }),
    grid: new pw.CartesianGrid({
      xAxis: monthAxis({ marginStart: 12, marginEnd: 12 }),
      yAxis: amountAxis(700)
    }),
    datasets: [
      new pw.PointDataSet({ legend: 'Expense', color: cyan, pointSize: 3.5, data: points(expense) }),
      new pw.PointDataSet({ legend: 'Budget', color: amber, pointSize: 3.5, data: points(budget) })
    ]
  });

  const shaped = new pw.Chart({
    grid: new pw.CartesianGrid({
      xAxis: monthAxis({ marginStart: 12, marginEnd: 12 }),
      yAxis: amountAxis(700)
    }),
    datasets: [
      new pw.PointDataSet({
        legend: 'Forecast',
        color: violet,
        pointSize: 3.5,
        data: points(forecast),
        shape: () => new pw.Transform({
          rotate: Math.PI / 4,
          child: new pw.Container({ decoration: { color: violet } })
        })
      })
    ]
  });

  const labelled = new pw.Chart({
    grid: new pw.CartesianGrid({
      xAxis: monthAxis({ marginStart: 16, marginEnd: 16, ticks: true }),
      yAxis: amountAxis(700)
    }),
    datasets: [
      new pw.PointDataSet({
        legend: 'Expense',
        color: rose,
        pointSize: 3,
        data: points(expense),
        valuePosition: 'top',
        buildValue: (context, value) => new pw.Text(`${value.y}`, { style: valueStyle })
      })
    ]
  });

  const radial = new pw.Chart({
    right: new pw.ChartLegend({ textStyle: legendStyle }),
    grid: new pw.RadialGrid(),
    datasets: [
      new pw.LineDataSet({
        legend: 'Expense',
        color: cyan,
        drawSurface: true,
        surfaceOpacity: 0.3,
        pointSize: 2.5,
        // RadialGrid scales its input by a fixed factor of three, so the series
        // is divided down to keep the polygon inside the cell.
        data: points([...expense, expense[0]].map(value => value / 22))
      })
    ]
  });

  return quadPage('Point charts', [
    cell('Scatter', 'PointDataSet on its own, two series', scatter),
    cell('Custom marker', 'shape builds the widget drawn at each point', shaped),
    cell('Labelled', 'valuePosition: top, with axis ticks', labelled),
    cell('Radial grid', 'the experimental polar coordinate system', radial)
  ]);
}

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generateChartsPhase51() {
  const document = new pw.Document();
  document.addPage(barPage());
  document.addPage(linePage());
  document.addPage(piePage());
  document.addPage(pointPage());
  return document.save();
}
