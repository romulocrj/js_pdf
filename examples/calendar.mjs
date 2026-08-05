/*
 * js_pdf port of demo/lib/examples/calendar.dart from dart_pdf.
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';
import { requireFeatures } from './upstream-example-helpers.mjs';

const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function generateCalendar(pageFormat = pw.PageFormat.A4, resources = {}) {
  requireFeatures(pw, 'calendar', [
    'EdgeInsets', 'Font', 'Padding', 'PageTheme', 'StatelessWidget',
    'SvgImage', 'TextStyle', 'ThemeData'
  ]);

  class Calendar extends pw.StatelessWidget {
    constructor({ date = null, month = null, year = null } = {}) {
      super();
      this.date = date;
      this.month = month;
      this.year = year;
    }

    title(_context, date) {
      return new pw.Container({
        width: Infinity,
        margin: new pw.EdgeInsets({ bottom: 8 }),
        child: new pw.Text(`${months[date.getMonth()]} ${date.getFullYear()}`, {
          style: new pw.TextStyle({ color: '#673ab7', fontSize: 40 })
        })
      });
    }

    header(_context, date) {
      return new pw.Container({
        background: '#90caf9',
        padding: new pw.EdgeInsets({ top: 8, left: 8, bottom: 8 }),
        child: new pw.Text(weekDays[(date.getDay() + 6) % 7], {
          style: new pw.TextStyle({ fontSize: 15 }),
          maxLines: 1,
          overflow: 'clip'
        })
      });
    }

    day(_context, date, currentMonth, currentDay) {
      let text = `${date.getDate()}`;
      let style = new pw.TextStyle();
      let color = '#e0e0e0';

      if (currentDay) {
        style = new pw.TextStyle({ color: '#f44336' });
        color = '#e1f5fe';
      }

      if (!currentMonth) {
        style = new pw.TextStyle({ color: '#9e9e9e' });
        color = '#f5f5f5';
      }

      if (date.getDate() === 1) text += ` ${months[date.getMonth()].slice(0, 3)}`;

      return new pw.Container({
        padding: new pw.EdgeInsets({ all: 4 }),
        background: color,
        child: new pw.Text(text, { align: 'right', style })
      });
    }

    build(context) {
      const localDate = this.date ?? new Date();
      const localYear = this.year ?? localDate.getFullYear();
      const localMonth = this.month ?? localDate.getMonth();
      const start = new Date(localYear, localMonth, 1, 12);
      const startId = (start.getDay() + 6) % 7;

      const head = new pw.Row({
        mainAxisSize: 'max',
        children: Array.from({ length: 7 }, (_, index) => {
          const date = new Date(localYear, localMonth, index - startId + 1, 12);
          return new pw.Expanded({
            child: new pw.Container({
              foregroundDecoration: new pw.BoxDecoration({
                border: new pw.Border({
                  top: new pw.BorderSide({ color: '#9e9e9e' }),
                  left: new pw.BorderSide({ color: '#9e9e9e' }),
                  right: index % 7 === 6 ? new pw.BorderSide({ color: '#9e9e9e' }) : pw.BorderSide.none,
                  bottom: new pw.BorderSide({ color: '#9e9e9e' })
                })
              }),
              child: this.header(context, date)
            })
          });
        })
      });

      const body = new pw.GridView({
        crossAxisCount: 7,
        children: Array.from({ length: 42 }, (_, index) => {
          const date = new Date(localYear, localMonth, index - startId + 1, 12);
          const currentMonth = date.getMonth() === localMonth;
          const currentDay = date.toDateString() === localDate.toDateString();
          return new pw.Container({
            foregroundDecoration: new pw.BoxDecoration({
              border: new pw.Border({
                left: new pw.BorderSide({ color: '#9e9e9e' }),
                right: index % 7 === 6 ? new pw.BorderSide({ color: '#9e9e9e' }) : pw.BorderSide.none,
                bottom: new pw.BorderSide({ color: '#9e9e9e' })
              })
            }),
            child: this.day(context, date, currentMonth, currentDay)
          });
        })
      });

      return new pw.Container({
        child: new pw.Column({
          mainAxisAlignment: 'start',
          mainAxisSize: 'min',
          children: [this.title(context, start), head, new pw.Expanded({ child: body })]
        })
      });
    }
  }

  const document = new pw.Document();
  const date = new Date();
  const background = date.getMonth() === 11 ? resources.calendarSvg : null;
  const theme = pw.ThemeData.withFont({
    base: pw.Font.ttf(resources.openSans),
    bold: pw.Font.ttf(resources.openSansBold)
  });

  document.addPage(
    new pw.Page({
      pageTheme: new pw.PageTheme({
        pageFormat,
        orientation: 'landscape',
        theme,
        buildForeground: background == null
          ? null
          : () => new pw.FullPage({ ignoreMargins: true, child: new pw.SvgImage({ svg: background }) })
      }),
      build: context => new pw.Padding({
        padding: new pw.EdgeInsets({ right: 20 }),
        child: new Calendar({ date })
      })
    })
  );

  return document.save();
}
