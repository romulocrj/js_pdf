/*
 * js_pdf forms, page labels and metadata phase 5.6 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';

const source = bytes => Buffer.from(bytes).toString('latin1');

test('document metadata attributes the producer without claiming a default creator', () => {
  const defaultDocument = new Pdf.Document();
  defaultDocument.addPage(new Pdf.Page({ build: () => new Pdf.Text('Default metadata') }));
  const defaultPdf = source(defaultDocument.save());

  assert.equal(defaultDocument.metadata.creator, null);
  assert.equal(defaultDocument.metadata.producer, null);
  assert.doesNotMatch(defaultPdf, /\/Creator/);
  assert.match(defaultPdf, /\/Producer \(https:\/\/github\.com\/romulocrj\/js_pdf\)/);
  assert.match(defaultPdf, /\/CreationDate \(D:\d{14}Z\)/);

  const customDocument = new Pdf.Document({
    creator: 'Report application',
    producer: 'Acme PDF service'
  });
  customDocument.addPage(new Pdf.Page({ build: () => new Pdf.Text('Custom metadata') }));
  const customPdf = source(customDocument.save());

  assert.match(customPdf, /\/Creator \(Report application\)/);
  assert.match(
    customPdf,
    /\/Producer \(Acme PDF service \\\(https:\/\/github\.com\/romulocrj\/js_pdf\\\)\)/
  );
  assert.match(customPdf, /\/CreationDate \(D:\d{14}Z\)/);
});

test('phase 5.6 form widgets are public and serialize one AcroForm field each', () => {
  for (const name of ['Checkbox', 'ChoiceField', 'FlatButton', 'TextField']) {
    assert.equal(typeof Pdf[name], 'function', name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }

  const pdf = source(Pdf.createPdf({}, api => new api.Page({
    margin: 0,
    build: () => new api.Column({
      children: [
        new api.TextField({ name: 'person', value: 'Ada', maxLength: 40 }),
        new api.ChoiceField({ name: 'role', items: ['Engineer', 'Writer'], value: 'Engineer' }),
        new api.Checkbox({ name: 'accepted', value: true }),
        new api.FlatButton({ name: 'submit', child: new api.Text('Submit') })
      ]
    })
  })));

  assert.match(pdf, /\/AcroForm << \/Fields \[(?:\d+ 0 R ?){4}\]/);
  assert.match(pdf, /\/NeedAppearances false/);
  assert.match(pdf, /\/FT \/Tx \/T \(person\).*\/MaxLen 40/);
  assert.match(pdf, /\/FT \/Ch \/T \(role\).*\/Opt \[\(Engineer\) \(Writer\)\]/);
  assert.match(pdf, /\/FT \/Btn \/T \(accepted\).*\/V \/Yes.*\/AS \/Yes/);
  assert.match(pdf, /\/FT \/Btn \/T \(submit\) \/Ff 65536/);
  assert.match(pdf, /\/DR << \/Font << \/FForm1 \d+ 0 R >> >>/);
  assert.match(pdf, /\/Subtype \/Form \/FormType 1 \/BBox \[0 0 120 13\]/);
  assert.match(pdf, /\/AP << \/N << \/Yes \d+ 0 R \/Off \d+ 0 R >> >>/);
  assert.match(pdf, /\/AP << \/N \d+ 0 R \/D \d+ 0 R \/R \d+ 0 R >>/);
});

test('phase 5.6 writes keywords, an UTF-8 XMP stream and page labels', () => {
  const labels = [];
  const document = new Pdf.Document({
    title: 'Metadata proof',
    keywords: 'forms, labels, xmp',
    xmpMetadata: '<?xpacket begin="id"?><x:xmpmeta xmlns:x="adobe:ns:meta/">ação 5.6</x:xmpmeta><?xpacket end="w"?>'
  });
  document
    .setPageLabel(0, new Pdf.PdfPageLabel({ prefix: 'Cover' }))
    .setPageLabel(1, Pdf.PdfPageLabel.romanLower());
  for (let index = 0; index < 2; index++) {
    document.addPage(new Pdf.Page({
      build: context => {
        labels.push(context.pageLabel);
        return new Pdf.Text(context.pageLabel);
      }
    }));
  }

  const bytes = document.save();
  const pdf = source(bytes);
  assert.deepEqual(labels, ['Cover', 'i']);
  assert.ok(Buffer.from(bytes).includes(Buffer.from('ação 5.6', 'utf8')));
  assert.match(pdf, /\/Keywords \(forms, labels, xmp\)/);
  assert.match(pdf, /\/Type \/Metadata \/Subtype \/XML \/Length \d+ >>\nstream\n<\?xpacket/);
  assert.match(pdf, /\/Metadata \d+ 0 R/);
  assert.match(pdf, /\/PageLabels \d+ 0 R/);
  assert.match(pdf, /\/Nums \[0 << \/P \(Cover\) >> 1 << \/S \/r >>\]/);
});

test('page-label formatting covers all styles and fixes upstream roman 400 typo', () => {
  assert.equal(Pdf.PdfPageLabel.arabic().asString(0), '1');
  assert.equal(Pdf.PdfPageLabel.romanUpper().asString(399), 'CD');
  assert.equal(Pdf.PdfPageLabel.romanLower().asString(3), 'iv');
  assert.equal(Pdf.PdfPageLabel.lettersUpper().asString(26), 'AA');
  assert.equal(Pdf.PdfPageLabel.lettersLower({ prefix: 'A-' }).asString(27), 'A-bb');
  assert.equal(Pdf.PdfPageLabel.arabic({ subsequent: 5 }).asString(0), '5');
});
