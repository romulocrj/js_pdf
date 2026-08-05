/*
 * js_pdf port of demo/lib/examples/server.dart from dart_pdf.
 * Copyright (C) 2017, David PHAM-VAN
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';
import { customData, requireFeatures } from './upstream-example-helpers.mjs';

const primaryMid = '#37474f';
const accent = '#ffa000';
const accentLight = '#ffecb3';
const success = '#388e3c';
const bgLight = '#fafafa';

function parsePlans(pricingJson) {
  const groups = JSON.parse(pricingJson);
  const linux = groups.find(group => group.group_name === 'Linux VPS');
  return linux.products.map(product => ({
    name: product.product_name,
    orderLink: product.order_link,
    vcpu: product.specs.vcpu,
    memoryGb: product.specs.memory_gb,
    storageGb: product.specs.storage_gb,
    uplinkGbps: product.specs.uplink_gbps,
    trafficTb: product.specs.traffic_tb,
    monthlyPrice: product.pricing_usd.monthly,
    addons: product.options
      .filter(option => option.type === 'checkbox' || option.type === 'quantity')
      .map(option => ({
        name: option.name,
        unit: option.unit ?? '',
        qtyMax: option.qty_max,
        monthlyPrice: option.pricing_usd?.monthly ?? 0
      }))
  }));
}

export function generateServer(pageFormat = pw.PageFormat.A4, _data = customData, resources = {}) {
  requireFeatures(pw, 'server', [
    'AnnotationUrl', 'BarDataSet', 'Border', 'BorderRadius', 'BoxDecoration',
    'CartesianGrid', 'Chart', 'EdgeInsets', 'Expanded', 'FixedAxis', 'Font', 'FullPage',
    'PageTheme', 'PointChartValue', 'RichText', 'SizedBox', 'SvgImage',
    'TableHelper', 'TextSpan', 'TextStyle', 'ThemeData', 'UrlLink'
  ]);

  const allPlans = parsePlans(resources.pricingJson);
  const plan = allPlans.find(item => item.name === 'Linux12GB');
  const chartPlans = allPlans
    .filter(item => item.memoryGb >= 4 && item.memoryGb <= 30)
    .sort((a, b) => a.memoryGb - b.memoryGb);
  const pdf = new pw.Document();

  pdf.addPage(
    new pw.Page({
      pageTheme: new pw.PageTheme({
        pageFormat,
        margin: new pw.EdgeInsets({ all: 40 }),
        theme: pw.ThemeData.withFont({
          base: pw.Font.ttf(resources.metrophobic),
          bold: pw.Font.ttf(resources.metrophobic)
        }),
        buildBackground: () => new pw.FullPage({
          ignoreMargins: true,
          child: new pw.Column({
            children: [new pw.SvgImage({ svg: resources.bannerSvg, height: 190, fit: 'fitWidth', alignment: 'bottomLeft' })]
          })
        })
      }),
      build: () => new pw.Column({
        crossAxisAlignment: 'stretch',
        children: [
          buildHeader(plan, resources),
          new pw.SizedBox({ height: 16 }),
          buildSpecsRow(plan, resources),
          new pw.SizedBox({ height: 20 }),
          new pw.Text('Price Comparison', { style: new pw.TextStyle({ color: primaryMid, fontSize: 16, fontWeight: 'bold' }) }),
          new pw.SizedBox({ height: 6 }),
          new pw.Expanded({ flex: 4, child: buildPriceChart(chartPlans) }),
          new pw.SizedBox({ height: 14 }),
          new pw.Text('Key Features', { style: new pw.TextStyle({ color: primaryMid, fontSize: 16, fontWeight: 'bold' }) }),
          new pw.SizedBox({ height: 6 }),
          buildFeaturesRow(resources),
          new pw.SizedBox({ height: 14 }),
          new pw.Text('Available Addons', { style: new pw.TextStyle({ color: primaryMid, fontSize: 16, fontWeight: 'bold' }) }),
          new pw.SizedBox({ height: 6 }),
          buildAddonTable(plan.addons),
          new pw.SizedBox({ height: 14 }),
          buildFooter(plan)
        ]
      })
    })
  );

  return pdf.save();
}

function buildHeader(plan, resources) {
  return new pw.Column({
    children: [
      new pw.Align({ alignment: 'centerLeft', child: new pw.SvgImage({ svg: resources.logoSvg, height: 20 }) }),
      new pw.Container({
        padding: new pw.EdgeInsets({ left: 20, right: 20, top: 10, bottom: 40 }),
        child: new pw.Row({
          mainAxisAlignment: 'spaceBetween',
          crossAxisAlignment: 'center',
          children: [
            new pw.Column({
              crossAxisAlignment: 'start',
              children: [
                new pw.Text(plan.name, { style: new pw.TextStyle({ color: '#ffffff', fontSize: 26, fontWeight: 'bold' }) }),
                new pw.SizedBox({ height: 2 }),
                new pw.Text('High Memory Linux VPS', { style: new pw.TextStyle({ color: '#cfd8dc', fontSize: 11 }) })
              ]
            }),
            new pw.Container({
              padding: new pw.EdgeInsets({ vertical: 12, horizontal: 12 }),
              decoration: new pw.BoxDecoration({ color: '#ffffff', borderRadius: pw.BorderRadius.all(20) }),
              child: new pw.Column({
                crossAxisAlignment: 'end',
                children: [
                  new pw.Text(`$${Math.trunc(plan.monthlyPrice)}`, { style: new pw.TextStyle({ color: accent, fontSize: 32, fontWeight: 'bold' }) }),
                  new pw.Text('per month', { style: new pw.TextStyle({ color: primaryMid, fontSize: 10 }) })
                ]
              })
            })
          ]
        })
      })
    ]
  });
}

function buildSpecsRow(plan, resources) {
  const specs = [
    [resources.cpuSvg, 'vCPU', `${plan.vcpu} Cores`],
    [resources.ramSvg, 'RAM', `${plan.memoryGb} GB ECC`],
    [resources.ssdSvg, 'Storage', `${plan.storageGb} GB NVMe SSD`],
    [resources.trafficSvg, 'Traffic', `${plan.trafficTb} TB/mo`],
    [resources.ssdSvg, 'Uplink', `${plan.uplinkGbps} Gbps`]
  ];
  return new pw.Row({
    children: specs.map(([svg, label, value]) => new pw.Expanded({
      child: new pw.Container({
        margin: new pw.EdgeInsets({ horizontal: 3 }),
        padding: new pw.EdgeInsets({ vertical: 10, horizontal: 4 }),
        decoration: new pw.BoxDecoration({ color: '#ffffff', borderRadius: pw.BorderRadius.all(4), border: pw.Border.all({ color: '#e0e0e0', width: 0.5 }) }),
        child: new pw.Column({
          mainAxisSize: 'min',
          children: [
            new pw.SvgImage({ svg, width: 22, height: 22, colorFilter: '#7cac60' }),
            new pw.SizedBox({ height: 4 }),
            new pw.Text(label, { style: new pw.TextStyle({ fontSize: 8, color: '#757575' }) }),
            new pw.Text(value, { style: new pw.TextStyle({ fontSize: 10, fontWeight: 'bold', color: primaryMid }) })
          ]
        })
      })
    }))
  });
}

function buildPriceChart(plans) {
  return new pw.Chart({
    grid: new pw.CartesianGrid({
      xAxis: pw.FixedAxis.fromStrings(plans.map(plan => `${plan.memoryGb}GB`), { marginStart: 20, marginEnd: 20, ticks: true }),
      yAxis: new pw.FixedAxis([0, 10, 20, 30, 40], { format: value => `$${Math.trunc(value)}`, divisions: true })
    }),
    datasets: [
      new pw.BarDataSet({
        color: accentLight,
        borderColor: accent,
        legend: 'Monthly price',
        width: 20,
        data: plans.map((plan, index) => new pw.PointChartValue(index, plan.monthlyPrice))
      })
    ]
  });
}

function buildFeaturesRow(resources) {
  const features = [
    [resources.bangSvg, 'Best Bang for Buck', 'High performance at the lowest price point in the market.'],
    [resources.ssdSvg, 'Enterprise NVMe SSD', 'Lightning-fast enterprise NVMe solid state drives on every plan.'],
    [resources.overSvg, 'No Overselling', 'Dedicated resources with consistent performance 24/7.']
  ];
  return new pw.Row({
    children: features.map(([svg, title, description]) => new pw.Expanded({
      child: new pw.Container({
        margin: new pw.EdgeInsets({ horizontal: 3 }),
        padding: new pw.EdgeInsets({ all: 10 }),
        decoration: new pw.BoxDecoration({ color: bgLight, borderRadius: pw.BorderRadius.all(4), border: pw.Border.all({ color: '#eeeeee', width: 0.5 }) }),
        child: new pw.Column({
          mainAxisSize: 'min',
          crossAxisAlignment: 'start',
          children: [
            new pw.Row({
              children: [
                new pw.SvgImage({ svg, width: 20, height: 20 }),
                new pw.SizedBox({ width: 6 }),
                new pw.Expanded({ child: new pw.Text(title, { style: new pw.TextStyle({ fontSize: 10, fontWeight: 'bold', color: primaryMid }) }) })
              ]
            }),
            new pw.SizedBox({ height: 4 }),
            new pw.Text(description, { style: new pw.TextStyle({ fontSize: 8, color: '#616161' }) })
          ]
        })
      })
    }))
  });
}

function buildAddonTable(addons) {
  const rows = addons.map(addon => [
    addon.name,
    addon.unit ? `${addon.unit} × up to ${addon.qtyMax}` : '',
    addon.monthlyPrice > 0 ? `$${Number.isInteger(addon.monthlyPrice) ? addon.monthlyPrice.toFixed(0) : addon.monthlyPrice.toFixed(2)}/mo` : 'Free'
  ]);
  return new pw.Container({
    decoration: new pw.BoxDecoration({ border: pw.Border.all({ color: '#e0e0e0', width: 0.5 }), borderRadius: pw.BorderRadius.all(4) }),
    child: pw.TableHelper.fromTextArray({
      border: { horizontalInside: { color: '#eeeeee', width: 0.5 } },
      headerCount: 0,
      cellAlignment: 'centerLeft',
      cellStyle: new pw.TextStyle({ fontSize: 9 }),
      headerStyle: new pw.TextStyle({ fontSize: 10, fontWeight: 'bold', color: '#ffffff' }),
      headerDecoration: new pw.BoxDecoration({ color: primaryMid }),
      data: rows,
      headers: ['Addon', 'Details', 'Price']
    })
  });
}

function buildFooter(plan) {
  return new pw.Container({
    padding: new pw.EdgeInsets({ vertical: 10 }),
    decoration: new pw.BoxDecoration({ border: new pw.Border({ top: new pw.BorderSide({ color: '#e0e0e0', width: 0.5 }) }) }),
    child: new pw.Row({
      mainAxisAlignment: 'spaceBetween',
      crossAxisAlignment: 'center',
      children: [
        new pw.RichText({
          text: new pw.TextSpan({
            style: new pw.TextStyle({ fontSize: 7, color: '#9e9e9e' }),
            children: [
              new pw.TextSpan({ text: 'Data sourced from ' }),
              new pw.TextSpan({ text: 'vpsdime.com', style: new pw.TextStyle({ decoration: 'underline', color: '#7cac60' }), annotation: new pw.AnnotationUrl('https://vpsdime.com') }),
              new pw.TextSpan({ text: ' · Prices subject to change' })
            ]
          })
        }),
        new pw.RichText({
          text: new pw.TextSpan({
            style: new pw.TextStyle({ fontSize: 7 }),
            children: [
              new pw.TextSpan({ text: 'Order Now', style: new pw.TextStyle({ fontSize: 11, fontWeight: 'bold', color: success, decoration: 'underline' }), annotation: new pw.AnnotationUrl(plan.orderLink) })
            ]
          })
        })
      ]
    })
  });
}
