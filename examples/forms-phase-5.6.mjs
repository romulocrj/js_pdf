/*
 * js_pdf forms phase 5.6 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as Pdf from '../dist/js_pdf.mjs';

const ink = '#172554';
const muted = '#64748b';
const blue = '#2563eb';
const border = '#cbd5e1';
const panel = '#f8fafc';

function label(text, required = false) {
  return new Pdf.Text(`${text}${required ? ' *' : ''}`, {
    style: new Pdf.TextStyle({ fontSize: 9, fontWeight: 'bold', color: ink })
  });
}

function field(labelText, child, required = false) {
  return new Pdf.Column({
    crossAxisAlignment: 'stretch',
    gap: 5,
    children: [label(labelText, required), child]
  });
}

function card(title, description, child) {
  return new Pdf.Container({
    padding: 16,
    decoration: new Pdf.BoxDecoration({
      color: panel,
      border: Pdf.Border.all({ color: border, width: 1 }),
      borderRadius: Pdf.BorderRadius.circular(8)
    }),
    child: new Pdf.Column({
      crossAxisAlignment: 'stretch',
      gap: 12,
      children: [
        new Pdf.Text(title, {
          style: new Pdf.TextStyle({ fontSize: 13, fontWeight: 'bold', color: ink })
        }),
        new Pdf.Text(description, {
          style: new Pdf.TextStyle({ fontSize: 8, color: muted })
        }),
        child
      ]
    })
  });
}

/** Synchronous visual proof of every non-signature form widget. */
export function generateFormsPhase56() {
  const document = new Pdf.Document({
    title: 'Phase 5.6 - interactive forms',
    keywords: 'AcroForm, text field, choice field, checkbox, button',
    xmpMetadata: '<x:xmpmeta xmlns:x="adobe:ns:meta/"><phase>5.6</phase></x:xmpmeta>'
  });
  document.setPageLabel(0, Pdf.PdfPageLabel.arabic({ prefix: 'Form-' }));

  document.addPage(new Pdf.Page({
    margin: 40,
    build: context => new Pdf.Column({
      crossAxisAlignment: 'stretch',
      gap: 16,
      children: [
        new Pdf.Row({
          mainAxisAlignment: 'spaceBetween',
          crossAxisAlignment: 'end',
          children: [
            new Pdf.Column({
              gap: 5,
              children: [
                new Pdf.Text('Phase 5.6 - interactive forms', {
                  style: new Pdf.TextStyle({ fontSize: 24, fontWeight: 'bold', color: ink })
                }),
                new Pdf.Text('Editable AcroForm controls with deterministic printed appearances.', {
                  style: new Pdf.TextStyle({ fontSize: 9, color: muted })
                })
              ]
            }),
            new Pdf.Text(context.pageLabel, {
              style: new Pdf.TextStyle({ fontSize: 9, fontWeight: 'bold', color: blue })
            })
          ]
        }),
        card(
          'TextField',
          'Values, maximum length, tooltips, required and multiline flags are written to the field dictionary.',
          new Pdf.Column({
            crossAxisAlignment: 'stretch',
            gap: 12,
            children: [
              new Pdf.Row({
                gap: 12,
                children: [
                  new Pdf.Expanded({
                    child: field('Full name', new Pdf.TextField({
                      name: 'full-name',
                      value: 'Ada Lovelace',
                      maxLength: 60,
                      alternateName: 'Full legal name',
                      fieldFlags: ['mandatory'],
                      width: 220,
                      height: 26
                    }), true)
                  }),
                  new Pdf.Expanded({
                    child: field('Reference', new Pdf.TextField({
                      name: 'reference',
                      value: 'JS-PDF-0056',
                      fieldFlags: ['readOnly'],
                      width: 180,
                      height: 26,
                      backgroundColor: '#e2e8f0'
                    }))
                  })
                ]
              }),
              field('Notes', new Pdf.TextField({
                name: 'notes',
                value: 'This field accepts multiple lines when edited.',
                fieldFlags: ['multiline'],
                height: 48
              }))
            ]
          })
        ),
        new Pdf.Row({
          gap: 14,
          crossAxisAlignment: 'stretch',
          children: [
            new Pdf.Expanded({
              child: card(
                'ChoiceField',
                'The selected value and every available option are embedded.',
                field('Role', new Pdf.ChoiceField({
                  name: 'role',
                  items: ['Engineer', 'Designer', 'Writer'],
                  value: 'Engineer',
                  height: 26
                }))
              )
            }),
            new Pdf.Expanded({
              child: card(
                'Checkbox',
                'On and off states remain visible when printed.',
                new Pdf.Column({
                  gap: 10,
                  children: [
                    new Pdf.Row({
                      gap: 8,
                      children: [
                        new Pdf.Checkbox({ name: 'updates', value: true, width: 16, height: 16 }),
                        new Pdf.Text('Receive release updates', { fontSize: 9 })
                      ]
                    }),
                    new Pdf.Row({
                      gap: 8,
                      children: [
                        new Pdf.Checkbox({ name: 'beta', value: false, width: 16, height: 16 }),
                        new Pdf.Text('Join beta program', { fontSize: 9 })
                      ]
                    })
                  ]
                })
              )
            })
          ]
        }),
        card(
          'FlatButton',
          'A push-button annotation covers the complete blue action surface.',
          new Pdf.Row({
            mainAxisAlignment: 'end',
            children: [
              new Pdf.FlatButton({
                name: 'submit',
                color: blue,
                child: new Pdf.Text('Submit form', {
                  style: new Pdf.TextStyle({ color: '#ffffff', fontWeight: 'bold', fontSize: 10 })
                })
              })
            ]
          })
        )
      ]
    })
  }));

  return document.save();
}
