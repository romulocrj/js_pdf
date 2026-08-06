/*
 * js_pdf phase 5.2 barcodes example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

const ink = '#0f172a';
const muted = '#475569';
const border = '#cbd5e1';
const panel = '#f8fafc';

const headingStyle = new pw.TextStyle({
  fontSize: 11,
  fontWeight: 'bold',
  color: ink
});

function card(title, subtitle, barcode) {
  return new pw.Expanded({
    child: new pw.Container({
      padding: 12,
      decoration: new pw.BoxDecoration({
        color: panel,
        border: pw.Border.all({ color: border, width: 1 }),
        borderRadius: pw.BorderRadius.circular(8)
      }),
      child: new pw.Column({
        crossAxisAlignment: 'start',
        gap: 4,
        children: [
          new pw.Text(title, { style: headingStyle }),
          new pw.Text(subtitle, {
            style: new pw.TextStyle({ fontSize: 8, color: muted })
          }),
          new pw.SizedBox({ height: 6 }),
          new pw.Center({ child: barcode })
        ]
      })
    })
  });
}

function linearBarcode(factory, data) {
  return new pw.BarcodeWidget({
    barcode: factory,
    data,
    width: 205,
    height: 62,
    drawText: true,
    textPadding: 3
  });
}

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generateBarcodePhase52() {
  const document = new pw.Document();

  document.addPage(new pw.Page({
    margin: 36,
    build: () => new pw.Column({
      crossAxisAlignment: 'stretch',
      gap: 12,
      children: [
        new pw.Text('Phase 5.2 — barcodes', {
          style: new pw.TextStyle({ fontSize: 24, fontWeight: 'bold', color: ink })
        }),
        new pw.Text(
          'Independent QR encoding, invoice PDF417 and representative one-dimensional generators.',
          { style: new pw.TextStyle({ fontSize: 11, color: muted }) }
        ),
        new pw.Row({
          crossAxisAlignment: 'stretch',
          gap: 12,
          children: [
            card(
              'QR Code',
              'Independent js_pdf byte-mode encoder',
              new pw.BarcodeWidget({
                barcode: pw.Barcode.qrCode(),
                data: 'https://github.com/DavBfr/dart_pdf',
                width: 132,
                height: 132,
                drawText: false
              })
            ),
            card(
              'PDF417',
              'The two-dimensional symbol used by invoice.mjs',
              new pw.BarcodeWidget({
                barcode: pw.Barcode.pdf417(),
                data: 'Invoice# 982347',
                width: 220,
                height: 88,
                drawText: false
              })
            )
          ]
        }),
        new pw.Row({
          gap: 12,
          children: [
            card('Code 128', 'Full ASCII payload', linearBarcode(pw.Barcode.code128(), 'JS-PDF-2026')),
            card('EAN-13', 'Retail article number', linearBarcode(pw.Barcode.ean13(), '590123412345'))
          ]
        }),
        new pw.Row({
          gap: 12,
          children: [
            card('Code 39', 'Uppercase alphanumeric', linearBarcode(pw.Barcode.code39(), 'PHASE-52')),
            card('ITF-14', 'Shipping container code', linearBarcode(pw.Barcode.itf14(), '1234567890123'))
          ]
        })
      ]
    })
  }));

  return document.save();
}
