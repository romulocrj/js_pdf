/*
 * js_pdf phase 3.7 rich-text example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generateRichTextPhase37() {
  const document = new pw.Document();
  document.addPage(new pw.Page({
    margin: 42,
    build: () => new pw.Column({
      crossAxisAlignment: 'stretch',
      gap: 18,
      children: [
        new pw.RichText({
          text: new pw.TextSpan({
            style: new pw.TextStyle({ fontSize: 24, color: '#172554' }),
            children: [
              new pw.TextSpan({ text: 'Phase 3.7 — ' }),
              new pw.TextSpan({
                text: 'RichText',
                style: new pw.TextStyle({
                  fontWeight: 'bold',
                  color: '#7c3aed',
                  decoration: ['underline', 'overline'],
                  decorationStyle: 'double'
                })
              })
            ]
          })
        }),
        new pw.RichText({
          textAlign: 'justify',
          text: new pw.TextSpan({
            style: new pw.TextStyle({ fontSize: 13, height: 1.35 }),
            children: [
              new pw.TextSpan({ text: 'Cada trecho mantém seu próprio ' }),
              new pw.TextSpan({
                text: 'estilo, cor e fundo',
                style: new pw.TextStyle({
                  fontWeight: 'bold',
                  color: '#9f1239',
                  background: new pw.BoxDecoration({ color: '#ffe4e6' })
                })
              }),
              new pw.TextSpan({
                text: ', enquanto o alinhamento justificado distribui somente o espaço disponível entre palavras reais.'
              })
            ]
          })
        }),
        new pw.Container({
          padding: 12,
          decoration: new pw.BoxDecoration({
            color: '#f0fdfa',
            border: pw.Border.all({ color: '#0f766e', width: 0.8 }),
            borderRadius: pw.BorderRadius.all(8)
          }),
          child: new pw.RichText({
            text: new pw.TextSpan({
              children: [
                new pw.TextSpan({ text: 'Um widget inline ' }),
                new pw.WidgetSpan({
                  baseline: -2,
                  child: new pw.Container({
                    width: 48,
                    height: 15,
                    decoration: new pw.BoxDecoration({
                      color: '#0f766e',
                      borderRadius: pw.BorderRadius.all(4)
                    })
                  })
                }),
                new pw.TextSpan({ text: ' participa da mesma linha e da mesma quebra.' })
              ]
            })
          })
        }),
        new pw.RichText({
          textDirection: 'rtl',
          textAlign: 'start',
          text: new pw.TextSpan({
            text: 'explicit RTL direction mirrors runs and resolves start/end alignment',
            style: new pw.TextStyle({ fontStyle: 'italic', color: '#334155' })
          })
        }),
        new pw.RichText({
          text: new pw.TextSpan({
            text: 'underline + line-through',
            style: new pw.TextStyle({
              color: '#1d4ed8',
              decoration: ['underline', 'lineThrough'],
              decorationColor: '#dc2626',
              decorationThickness: 1.5
            })
          })
        })
      ]
    })
  }));
  return document.save();
}

