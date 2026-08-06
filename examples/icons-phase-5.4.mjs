/*
 * js_pdf icons phase 5.4 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as Pdf from '../dist/js_pdf.mjs';

const ink = '#172554';
const muted = '#475569';
const border = '#cbd5e1';
const panel = '#f8fafc';

const icons = {
  home: new Pdf.IconData(0xe88a),
  favorite: new Pdf.IconData(0xe87d),
  star: new Pdf.IconData(0xe838),
  build: new Pdf.IconData(0xe869),
  arrow: new Pdf.IconData(0xe5c8, { matchTextDirection: true })
};

function card(title, subtitle, child) {
  return new Pdf.Expanded({
    child: new Pdf.Container({
      padding: 14,
      decoration: new Pdf.BoxDecoration({
        color: panel,
        border: Pdf.Border.all({ color: border, width: 1 }),
        borderRadius: Pdf.BorderRadius.circular(8)
      }),
      child: new Pdf.Column({
        crossAxisAlignment: 'start',
        gap: 8,
        children: [
          new Pdf.Text(title, {
            style: new Pdf.TextStyle({ fontSize: 12, fontWeight: 'bold', color: ink })
          }),
          new Pdf.Text(subtitle, { style: new Pdf.TextStyle({ fontSize: 8, color: muted }) }),
          new Pdf.SizedBox({ height: 4 }),
          child
        ]
      })
    })
  });
}

function labeledIcon(label, icon, options = {}) {
  return new Pdf.Column({
    children: [
      new Pdf.Icon(icon, options),
      new Pdf.SizedBox({ height: 4 }),
      new Pdf.Text(label, { style: new Pdf.TextStyle({ fontSize: 8, color: muted }) })
    ]
  });
}

/** Synchronous host-free proof; the caller supplies the retained font bytes. */
export function generateIconsPhase54(materialIcons) {
  if (!(materialIcons instanceof Uint8Array)) {
    throw new TypeError('generateIconsPhase54 expects MaterialIcons.ttf bytes');
  }
  const iconFont = Pdf.Font.ttf(materialIcons);
  const theme = Pdf.ThemeData.withFont({ icons: iconFont });
  const document = new Pdf.Document({ title: 'Phase 5.4 - icons', theme });

  document.addPage(new Pdf.Page({
    margin: 36,
    build: () => new Pdf.Column({
      crossAxisAlignment: 'stretch',
      gap: 14,
      children: [
        new Pdf.Text('Phase 5.4 - font icons', {
          style: new Pdf.TextStyle({ fontSize: 24, fontWeight: 'bold', color: ink })
        }),
        new Pdf.Text(
          'Private-use glyphs from MaterialIcons.ttf, subset through the existing TrueType pipeline.',
          { style: new Pdf.TextStyle({ fontSize: 10, color: muted }) }
        ),
        new Pdf.Row({
          gap: 12,
          crossAxisAlignment: 'stretch',
          children: [
            card(
              'Default theme',
              '24 pt, black, inherited icon font',
              new Pdf.Row({
                mainAxisAlignment: 'spaceAround',
                children: [
                  labeledIcon('home', icons.home),
                  labeledIcon('favorite', icons.favorite),
                  labeledIcon('star', icons.star),
                  labeledIcon('build', icons.build)
                ]
              })
            ),
            card(
              'Explicit sizes',
              'Each glyph keeps a square layout box',
              new Pdf.Row({
                mainAxisAlignment: 'spaceAround',
                crossAxisAlignment: 'end',
                children: [
                  labeledIcon('16', icons.star, { size: 16, color: '#f59e0b' }),
                  labeledIcon('24', icons.star, { size: 24, color: '#f59e0b' }),
                  labeledIcon('36', icons.star, { size: 36, color: '#f59e0b' }),
                  labeledIcon('52', icons.star, { size: 52, color: '#f59e0b' })
                ]
              })
            )
          ]
        }),
        new Pdf.Row({
          gap: 12,
          crossAxisAlignment: 'stretch',
          children: [
            card(
              'Scoped IconThemeData',
              'Color, size and opacity inherited below Theme',
              new Pdf.Theme({
                data: theme.copyWith({
                  iconTheme: new Pdf.IconThemeData({
                    font: iconFont,
                    color: '#7c3aed',
                    opacity: 0.45,
                    size: 42
                  })
                }),
                child: new Pdf.Row({
                  mainAxisAlignment: 'spaceAround',
                  children: [new Pdf.Icon(icons.favorite), new Pdf.Icon(icons.home), new Pdf.Icon(icons.build)]
                })
              })
            ),
            card(
              'Directional mirroring',
              'The same arrow is mirrored only in RTL',
              new Pdf.Row({
                mainAxisAlignment: 'spaceAround',
                children: [
                  labeledIcon('LTR', icons.arrow, { size: 42, color: '#0284c7', textDirection: 'ltr' }),
                  labeledIcon('RTL', icons.arrow, { size: 42, color: '#0284c7', textDirection: 'rtl' })
                ]
              })
            )
          ]
        }),
        new Pdf.Container({
          padding: 14,
          decoration: new Pdf.BoxDecoration({
            color: '#ecfdf5',
            border: Pdf.Border.all({ color: '#16a34a', width: 1 }),
            borderRadius: Pdf.BorderRadius.circular(8)
          }),
          child: new Pdf.Row({
            children: [
              new Pdf.Icon(new Pdf.IconData(0xe530), { size: 30, color: '#166534' }),
              new Pdf.SizedBox({ width: 10 }),
              new Pdf.Expanded({
                child: new Pdf.Text(
                  'The resume code points use the same public Icon and IconData API shown above.',
                  { style: new Pdf.TextStyle({ color: '#166534', fontSize: 10 }) }
                )
              })
            ]
          })
        })
      ]
    })
  }));

  return document.save();
}
