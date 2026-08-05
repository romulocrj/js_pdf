/*
 * js_pdf port of demo/lib/examples/invoice.dart from dart_pdf.
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';
import { customData, requireFeatures } from './upstream-example-helpers.mjs';

class Product {
  constructor(sku, productName, price, quantity) {
    this.sku = sku;
    this.productName = productName;
    this.price = price;
    this.quantity = quantity;
  }

  get total() {
    return this.price * this.quantity;
  }

  getIndex(index) {
    return [this.sku, this.productName, formatCurrency(this.price), String(this.quantity), formatCurrency(this.total)][index] ?? '';
  }
}

class Invoice {
  constructor({ products, customerName, customerAddress, invoiceNumber, tax, paymentInfo, baseColor, accentColor, resources }) {
    Object.assign(this, { products, customerName, customerAddress, invoiceNumber, tax, paymentInfo, baseColor, accentColor, resources });
  }

  get total() {
    return this.products.reduce((sum, product) => sum + product.total, 0);
  }

  get grandTotal() {
    return this.total * (1 + this.tax);
  }

  buildPdf(pageFormat) {
    const doc = new pw.Document();
    doc.addPage(
      new pw.MultiPage({
        pageTheme: this.buildTheme(pageFormat),
        header: context => this.buildHeader(context),
        footer: context => this.buildFooter(context),
        build: context => [
          this.contentHeader(context),
          this.contentTable(context),
          new pw.SizedBox({ height: 20 }),
          this.contentFooter(context),
          new pw.SizedBox({ height: 20 }),
          this.termsAndConditions(context)
        ]
      })
    );
    return doc.save();
  }

  buildHeader(context) {
    return new pw.Column({
      children: [
        new pw.Row({
          crossAxisAlignment: 'start',
          children: [
            new pw.Expanded({
              child: new pw.Column({
                children: [
                  new pw.Container({
                    height: 50,
                    padding: new pw.EdgeInsets({ left: 20 }),
                    alignment: 'centerLeft',
                    child: new pw.Text('INVOICE', { style: new pw.TextStyle({ color: this.baseColor, fontWeight: 'bold', fontSize: 40 }) })
                  }),
                  new pw.Container({
                    decoration: new pw.BoxDecoration({ borderRadius: pw.BorderRadius.all(2), color: this.accentColor }),
                    padding: new pw.EdgeInsets({ left: 40, top: 10, bottom: 10, right: 20 }),
                    alignment: 'centerLeft',
                    height: 50,
                    child: new pw.DefaultTextStyle({
                      style: new pw.TextStyle({ color: '#ffffff', fontSize: 12 }),
                      child: new pw.GridView({
                        crossAxisCount: 2,
                        children: [
                          new pw.Text('Invoice #'), new pw.Text(this.invoiceNumber),
                          new pw.Text('Date:'), new pw.Text(formatDate(new Date()))
                        ]
                      })
                    })
                  })
                ]
              })
            }),
            new pw.Expanded({
              child: new pw.Column({
                mainAxisSize: 'min',
                children: [
                  new pw.Container({
                    alignment: 'topRight',
                    padding: new pw.EdgeInsets({ bottom: 8, left: 30 }),
                    height: 72,
                    child: this.resources.logoSvg
                      ? new pw.SvgImage({ svg: this.resources.logoSvg })
                      : new pw.PdfLogo()
                  })
                ]
              })
            })
          ]
        }),
        ...(context.pageNumber > 1 ? [new pw.SizedBox({ height: 20 })] : [])
      ]
    });
  }

  buildFooter(context) {
    return new pw.Row({
      mainAxisAlignment: 'spaceBetween',
      crossAxisAlignment: 'end',
      children: [
        new pw.Container({
          height: 20,
          width: 100,
          child: new pw.BarcodeWidget({ barcode: pw.Barcode.pdf417(), data: `Invoice# ${this.invoiceNumber}`, drawText: false })
        }),
        new pw.Text(`Page ${context.pageNumber}/${context.pagesCount}`, { style: new pw.TextStyle({ fontSize: 12, color: '#ffffff' }) })
      ]
    });
  }

  buildTheme(pageFormat) {
    return new pw.PageTheme({
      pageFormat,
      theme: pw.ThemeData.withFont({
        base: pw.Font.ttf(this.resources.roboto),
        bold: pw.Font.ttf(this.resources.robotoBold),
        italic: pw.Font.ttf(this.resources.robotoItalic)
      }),
      buildBackground: () => new pw.FullPage({
        ignoreMargins: true,
        child: new pw.SvgImage({ svg: this.resources.invoiceSvg })
      })
    });
  }

  contentHeader() {
    return new pw.Row({
      crossAxisAlignment: 'start',
      children: [
        new pw.Expanded({
          child: new pw.Container({
            margin: new pw.EdgeInsets({ horizontal: 20 }),
            height: 70,
            child: new pw.FittedBox({
              child: new pw.Text(`Total: ${formatCurrency(this.grandTotal)}`, {
                style: new pw.TextStyle({ color: this.baseColor, fontStyle: 'italic' })
              })
            })
          })
        }),
        new pw.Expanded({
          child: new pw.Row({
            children: [
              new pw.Container({
                margin: new pw.EdgeInsets({ left: 10, right: 10 }),
                height: 70,
                child: new pw.Text('Invoice to:', { style: new pw.TextStyle({ color: '#37474f', fontWeight: 'bold', fontSize: 12 }) })
              }),
              new pw.Expanded({
                child: new pw.Container({
                  height: 70,
                  child: new pw.RichText({
                    text: new pw.TextSpan({
                      text: `${this.customerName}\n`,
                      style: new pw.TextStyle({ color: '#37474f', fontWeight: 'bold', fontSize: 12 }),
                      children: [
                        new pw.TextSpan({ text: '\n', style: new pw.TextStyle({ fontSize: 5 }) }),
                        new pw.TextSpan({ text: this.customerAddress, style: new pw.TextStyle({ fontWeight: 'normal', fontSize: 10 }) })
                      ]
                    })
                  })
                })
              })
            ]
          })
        })
      ]
    });
  }

  contentFooter() {
    return new pw.Row({
      crossAxisAlignment: 'start',
      children: [
        new pw.Expanded({
          flex: 2,
          child: new pw.Column({
            crossAxisAlignment: 'start',
            children: [
              new pw.Text('Thank you for your business', { style: new pw.TextStyle({ color: '#37474f', fontWeight: 'bold' }) }),
              new pw.Container({
                margin: new pw.EdgeInsets({ top: 20, bottom: 8 }),
                child: new pw.Text('Payment Info:', { style: new pw.TextStyle({ color: this.baseColor, fontWeight: 'bold' }) })
              }),
              new pw.Text(this.paymentInfo, { style: new pw.TextStyle({ fontSize: 8, lineSpacing: 5, color: '#37474f' }) })
            ]
          })
        }),
        new pw.Expanded({
          flex: 1,
          child: new pw.DefaultTextStyle({
            style: new pw.TextStyle({ fontSize: 10, color: '#37474f' }),
            child: new pw.Column({
              crossAxisAlignment: 'start',
              children: [
                new pw.Row({ mainAxisAlignment: 'spaceBetween', children: [new pw.Text('Sub Total:'), new pw.Text(formatCurrency(this.total))] }),
                new pw.SizedBox({ height: 5 }),
                new pw.Row({ mainAxisAlignment: 'spaceBetween', children: [new pw.Text('Tax:'), new pw.Text(`${(this.tax * 100).toFixed(1)}%`)] }),
                new pw.Divider({ color: this.accentColor }),
                new pw.DefaultTextStyle({
                  style: new pw.TextStyle({ color: this.baseColor, fontSize: 14, fontWeight: 'bold' }),
                  child: new pw.Row({ mainAxisAlignment: 'spaceBetween', children: [new pw.Text('Total:'), new pw.Text(formatCurrency(this.grandTotal))] })
                })
              ]
            })
          })
        })
      ]
    });
  }

  termsAndConditions() {
    return new pw.Row({
      crossAxisAlignment: 'end',
      children: [
        new pw.Expanded({
          child: new pw.Column({
            crossAxisAlignment: 'start',
            children: [
              new pw.Container({
                decoration: new pw.BoxDecoration({ border: new pw.Border({ top: new pw.BorderSide({ color: this.accentColor }) }) }),
                padding: new pw.EdgeInsets({ top: 10, bottom: 4 }),
                child: new pw.Text('Terms & Conditions', { style: new pw.TextStyle({ fontSize: 12, color: this.baseColor, fontWeight: 'bold' }) })
              }),
              new pw.Text(new pw.LoremText().paragraph(40), { align: 'justify', style: new pw.TextStyle({ fontSize: 6, lineSpacing: 2, color: '#37474f' }) })
            ]
          })
        }),
        new pw.Expanded({ child: new pw.SizedBox() })
      ]
    });
  }

  contentTable(context) {
    const headers = ['SKU#', 'Item Description', 'Price', 'Quantity', 'Total'];
    return pw.TableHelper.fromTextArray({
      context,
      border: null,
      cellAlignment: 'centerLeft',
      headerDecoration: new pw.BoxDecoration({ borderRadius: pw.BorderRadius.all(2), color: this.baseColor }),
      headerHeight: 25,
      cellHeight: 40,
      cellAlignments: { 0: 'centerLeft', 1: 'centerLeft', 2: 'centerRight', 3: 'center', 4: 'centerRight' },
      headerStyle: new pw.TextStyle({ color: '#ffffff', fontSize: 10, fontWeight: 'bold' }),
      cellStyle: new pw.TextStyle({ color: '#37474f', fontSize: 10 }),
      rowDecoration: new pw.BoxDecoration({ border: new pw.Border({ bottom: new pw.BorderSide({ color: this.accentColor, width: 0.5 }) }) }),
      headers,
      data: this.products.map(product => headers.map((_, column) => product.getIndex(column)))
    });
  }
}

export function generateInvoice(pageFormat = pw.PageFormat.A4, _data = customData, resources = {}) {
  requireFeatures(pw, 'invoice', [
    'Barcode', 'BarcodeWidget', 'DefaultTextStyle', 'Divider', 'EdgeInsets', 'Font', 'GridView',
    'LoremText', 'PageTheme', 'PdfLogo', 'RichText', 'SizedBox',
    'SvgImage', 'TextSpan', 'TextStyle', 'ThemeData'
  ]);

  const lorem = new pw.LoremText();
  const products = [
    new Product('19874', lorem.sentence(4), 3.99, 2), new Product('98452', lorem.sentence(6), 15, 2),
    new Product('28375', lorem.sentence(4), 6.95, 3), new Product('95673', lorem.sentence(3), 49.99, 4),
    new Product('23763', lorem.sentence(2), 560.03, 1), new Product('55209', lorem.sentence(5), 26, 1),
    new Product('09853', lorem.sentence(5), 26, 1), new Product('23463', lorem.sentence(5), 34, 1),
    new Product('56783', lorem.sentence(5), 7, 4), new Product('78256', lorem.sentence(5), 23, 1),
    new Product('23745', lorem.sentence(5), 94, 1), new Product('07834', lorem.sentence(5), 12, 1),
    new Product('23547', lorem.sentence(5), 34, 1), new Product('98387', lorem.sentence(5), 7.99, 2)
  ];

  return new Invoice({
    invoiceNumber: '982347',
    products,
    customerName: 'Abraham Swearegin',
    customerAddress: '54 rue de Rivoli\n75001 Paris, France',
    paymentInfo: '4509 Wiseman Street\nKnoxville, Tennessee(TN), 37929\n865-372-0425',
    tax: 0.15,
    baseColor: '#009688',
    accentColor: '#263238',
    resources
  }).buildPdf(pageFormat);
}

function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
