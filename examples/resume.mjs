/*
 * js_pdf port of demo/lib/examples/resume.dart from dart_pdf.
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';
import { customData, requireFeatures } from './upstream-example-helpers.mjs';

const green = '#9ce5d0';
const lightGreen = '#cdf1e7';
const separatorWidth = 120;

export function generateResume(format = pw.PageFormat.A4, _data = customData, resources = {}) {
  requireFeatures(pw, 'resume', [
    'Barcode', 'BarcodeWidget', 'Border', 'BorderRadius', 'BoxDecoration',
    'CircularProgressIndicator', 'ClipOval', 'EdgeInsets', 'Font', 'FullPage', 'Icon',
    'IconData', 'Image', 'Lorem', 'MemoryImage', 'PageTheme', 'Padding',
    'Partition', 'Partitions', 'Positioned', 'SizedBox', 'Stack',
    'StatelessWidget', 'SvgImage', 'TextStyle', 'Theme', 'ThemeData',
    'Transform', 'UrlLink'
  ]);

  class UrlText extends pw.StatelessWidget {
    constructor(text, url) {
      super();
      this.text = text;
      this.url = url;
    }

    build() {
      return new pw.UrlLink({
        destination: this.url,
        child: new pw.Text(this.text, { style: new pw.TextStyle({ decoration: 'underline', color: '#2196f3' }) })
      });
    }
  }

  class Block extends pw.StatelessWidget {
    constructor({ title, icon = null }) {
      super();
      this.title = title;
      this.icon = icon;
    }

    build(context) {
      return new pw.Column({
        crossAxisAlignment: 'start',
        children: [
          new pw.Row({
            crossAxisAlignment: 'start',
            children: [
              new pw.Container({
                width: 6, height: 6,
                margin: new pw.EdgeInsets({ top: 5.5, left: 2, right: 5 }),
                decoration: new pw.BoxDecoration({ color: green, shape: 'circle' })
              }),
              new pw.Text(this.title, { style: pw.Theme.of(context).defaultTextStyle.copyWith({ fontWeight: 'bold' }) }),
              new pw.Spacer(),
              ...(this.icon ? [new pw.Icon(this.icon, { color: lightGreen, size: 18 })] : [])
            ]
          }),
          new pw.Container({
            decoration: new pw.BoxDecoration({ border: new pw.Border({ left: new pw.BorderSide({ color: green, width: 2 }) }) }),
            padding: new pw.EdgeInsets({ left: 10, top: 5, bottom: 5 }),
            margin: new pw.EdgeInsets({ left: 5 }),
            child: new pw.Column({ crossAxisAlignment: 'start', children: [new pw.Lorem({ length: 20 })] })
          })
        ]
      });
    }
  }

  class Category extends pw.StatelessWidget {
    constructor(title) {
      super();
      this.title = title;
    }

    build() {
      return new pw.Container({
        decoration: new pw.BoxDecoration({ color: lightGreen, borderRadius: pw.BorderRadius.all(6) }),
        margin: new pw.EdgeInsets({ bottom: 10, top: 20 }),
        padding: new pw.EdgeInsets({ left: 10, top: 4, right: 10, bottom: 4 }),
        child: new pw.Text(this.title, { textScaleFactor: 1.5 })
      });
    }
  }

  class Percent extends pw.StatelessWidget {
    constructor({ size, value, title }) {
      super();
      Object.assign(this, { size, value, title });
    }

    build() {
      return new pw.Column({
        children: [
          new pw.Container({
            width: this.size,
            height: this.size,
            child: new pw.Stack({
              alignment: 'center',
              fit: 'expand',
              children: [
                new pw.Center({ child: new pw.Text(`${Math.round(this.value * 100)}%`, { textScaleFactor: 1.2 }) }),
                new pw.CircularProgressIndicator({ value: this.value, backgroundColor: '#e0e0e0', color: green, strokeWidth: 5 })
              ]
            })
          }),
          this.title
        ]
      });
    }
  }

  const doc = new pw.Document({ title: 'My Résumé', author: 'David PHAM-VAN' });
  const profileImage = new pw.MemoryImage(resources.profileJpg);
  const pageTheme = new pw.PageTheme({
    pageFormat: { ...format, marginLeft: 56.69, marginTop: 113.39, marginRight: 56.69, marginBottom: 56.69 },
    theme: pw.ThemeData.withFont({
      base: pw.Font.ttf(resources.openSans),
      bold: pw.Font.ttf(resources.openSansBold),
      icons: pw.Font.ttf(resources.materialIcons)
    }),
    buildBackground: () => new pw.FullPage({
      ignoreMargins: true,
      child: new pw.Stack({
        children: [
          new pw.Positioned({ left: 0, top: 0, child: new pw.SvgImage({ svg: resources.resumeSvg }) }),
          new pw.Positioned({
            right: 0, bottom: 0,
            child: new pw.Transform({ rotate: Math.PI, child: new pw.SvgImage({ svg: resources.resumeSvg }) })
          })
        ]
      })
    })
  });

  doc.addPage(
    new pw.MultiPage({
      pageTheme,
      build: context => [
        new pw.Partitions({
          children: [
            new pw.Partition({
              child: new pw.Column({
                crossAxisAlignment: 'start',
                children: [
                  new pw.Container({
                    padding: new pw.EdgeInsets({ left: 30, bottom: 20 }),
                    child: new pw.Column({
                      crossAxisAlignment: 'start',
                      children: [
                        new pw.Text('Parnella Charlesbois', { textScaleFactor: 2, style: pw.Theme.of(context).defaultTextStyle.copyWith({ fontWeight: 'bold' }) }),
                        new pw.Padding({ padding: new pw.EdgeInsets({ top: 10 }) }),
                        new pw.Text('Electrotyper', { textScaleFactor: 1.2, style: pw.Theme.of(context).defaultTextStyle.copyWith({ fontWeight: 'bold', color: green }) }),
                        new pw.Padding({ padding: new pw.EdgeInsets({ top: 20 }) }),
                        new pw.Row({
                          crossAxisAlignment: 'start',
                          mainAxisAlignment: 'spaceBetween',
                          children: [
                            new pw.Column({ crossAxisAlignment: 'start', children: [new pw.Text('568 Port Washington Road'), new pw.Text('Nordegg, AB T0M 2H0'), new pw.Text('Canada, ON')] }),
                            new pw.Column({ crossAxisAlignment: 'start', children: [new pw.Text('+1 403-721-6898'), new UrlText('p.charlesbois@yahoo.com', 'mailto:p.charlesbois@yahoo.com'), new UrlText('wholeprices.ca', 'https://wholeprices.ca')] }),
                            new pw.Padding({ padding: pw.EdgeInsets.zero })
                          ]
                        })
                      ]
                    })
                  }),
                  new Category('Work Experience'),
                  new Block({ title: 'Tour bus driver', icon: new pw.IconData(0xe530) }),
                  new Block({ title: 'Logging equipment operator', icon: new pw.IconData(0xe30d) }),
                  new Block({ title: 'Foot doctor', icon: new pw.IconData(0xe3f3) }),
                  new Block({ title: 'Unicorn trainer', icon: new pw.IconData(0xf0cf) }),
                  new Block({ title: 'Chief chatter', icon: new pw.IconData(0xe0ca) }),
                  new pw.SizedBox({ height: 20 }),
                  new Category('Education'),
                  new Block({ title: 'Bachelor Of Commerce' }),
                  new Block({ title: 'Bachelor Interior Design' })
                ]
              })
            }),
            new pw.Partition({
              width: separatorWidth,
              child: new pw.Column({
                children: [
                  new pw.Container({
                    height: pageTheme.pageFormat.availableHeight,
                    child: new pw.Column({
                      crossAxisAlignment: 'center',
                      mainAxisAlignment: 'spaceBetween',
                      children: [
                        new pw.ClipOval({ child: new pw.Container({ width: 100, height: 100, color: lightGreen, child: new pw.Image(profileImage) }) }),
                        new pw.Column({ children: [new Percent({ size: 60, value: 0.7, title: new pw.Text('Word') }), new Percent({ size: 60, value: 0.4, title: new pw.Text('Excel') })] }),
                        new pw.BarcodeWidget({ data: 'Parnella Charlesbois', width: 60, height: 60, barcode: pw.Barcode.qrCode(), drawText: false })
                      ]
                    })
                  })
                ]
              })
            })
          ]
        })
      ]
    })
  );

  return doc.save();
}
