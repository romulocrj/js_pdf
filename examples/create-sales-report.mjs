/*
 * js_pdf example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Uses no host APIs: it imports the bundle and returns a Uint8Array
 * synchronously, so the same file runs under Node, a browser importmap and
 * ClearScript.
 */

import { Column, Container, Document, MultiPage, Row, Text, Vector } from '../dist/js_pdf.mjs';

export function createSalesReport(model) {
  const document = new Document({
    title: 'Relatório de vendas',
    author: model.author ?? 'Blunana',
    subject: 'Dashboard executivo'
  });

  document.addPage(
    new MultiPage({
      margin: 32,
      gap: 10,

      header: context => new Row({
        widths: [3, 1],
        children: [
          new Text('RELATÓRIO DE VENDAS', {
            fontSize: 16,
            color: '#172554'
          }),
          new Text(`Página ${context.pageNumber}`, {
            align: 'right',
            color: '#64748b'
          })
        ]
      }),

      footer: () => new Text('Gerado por js_pdf', {
        fontSize: 9,
        color: '#64748b',
        align: 'center'
      }),

      build: () => [
        new Text(model.period, {
          fontSize: 11,
          color: '#64748b'
        }),

        new Row({
          gap: 8,
          children: [
            metricCard('Faturamento', formatMoney(model.revenue)),
            metricCard('Pedidos', String(model.orders)),
            metricCard('Ticket médio', formatMoney(model.averageTicket))
          ]
        }),

        new Container({
          padding: 12,
          borderColor: '#dbeafe',
          background: '#eff6ff',
          child: new Column({
            gap: 8,
            children: [
              new Text('Faturamento por mês', {
                fontSize: 14,
                color: '#1e3a8a'
              }),
              createBarChart(model.months)
            ]
          })
        }),

        new Text('Detalhamento', {
          fontSize: 15,
          color: '#172554',
          margin: { top: 6, bottom: 2 }
        }),

        createTableHeader(),

        ...model.sales.map((sale, index) => createTableRow(sale, index))
      ]
    })
  );

  return document.save();
}

function metricCard(label, value) {
  return new Container({
    padding: 10,
    background: '#f8fafc',
    borderColor: '#cbd5e1',
    child: new Column({
      gap: 4,
      children: [
        new Text(label, {
          fontSize: 9,
          color: '#64748b'
        }),
        new Text(value, {
          fontSize: 17,
          color: '#0f172a'
        })
      ]
    })
  });
}

function createBarChart(items) {
  const width = 470;
  const height = 180;
  const padding = 28;
  const chartWidth = width - padding * 2;
  const chartHeight = height - 48;
  const maxValue = Math.max(1, ...items.map(item => Number(item.value) || 0));
  const slot = chartWidth / Math.max(1, items.length);

  return new Vector({
    width,
    height,
    draw: canvas => {
      canvas.line({
        x1: padding,
        y1: padding + chartHeight,
        x2: width - padding,
        y2: padding + chartHeight,
        color: '#94a3b8'
      });

      items.forEach((item, index) => {
        const barHeight = chartHeight * item.value / maxValue;
        const barWidth = slot * 0.58;
        const x = padding + index * slot + (slot - barWidth) / 2;
        const y = padding + chartHeight - barHeight;

        canvas.rect({
          x,
          y,
          width: barWidth,
          height: barHeight,
          fill: '#2563eb'
        });

        canvas.text({
          value: item.label,
          x: x + 1,
          y: padding + chartHeight + 18,
          fontSize: 8,
          color: '#475569'
        });
      });
    }
  });
}

function createTableHeader() {
  return new Container({
    padding: 7,
    background: '#1e3a8a',
    child: new Row({
      widths: [1, 3, 1, 1],
      children: [
        cell('Data', '#ffffff'),
        cell('Cliente', '#ffffff'),
        cell('Status', '#ffffff'),
        cell('Valor', '#ffffff', 'right')
      ]
    })
  });
}

function createTableRow(sale, index) {
  return new Container({
    padding: 7,
    background: index % 2 === 0 ? '#f8fafc' : '#ffffff',
    borderColor: '#e2e8f0',
    child: new Row({
      widths: [1, 3, 1, 1],
      children: [
        cell(sale.date),
        cell(sale.customer),
        cell(sale.status, sale.status === 'Pago' ? '#15803d' : '#b45309'),
        cell(formatMoney(sale.value), '#0f172a', 'right')
      ]
    })
  });
}

function cell(value, color = '#334155', align = 'left') {
  return new Text(value, {
    fontSize: 9,
    color,
    align
  });
}

function formatMoney(value) {
  const fixed = Number(value).toFixed(2).replace('.', ',');
  return `R$ ${fixed}`;
}
