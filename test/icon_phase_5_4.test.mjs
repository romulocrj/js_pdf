/*
 * js_pdf icon phase 5.4 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Pdf from '../src/index.ts';

const MATERIAL_ICONS = new Uint8Array(
  readFileSync(new URL('../examples/assets/MaterialIcons.ttf', import.meta.url))
);

function latin1(bytes) {
  let result = '';
  for (const byte of bytes) result += String.fromCharCode(byte);
  return result;
}

function iconTheme(options = {}) {
  return Pdf.ThemeData.withFont({ icons: Pdf.Font.ttf(MATERIAL_ICONS), ...options });
}

test('phase 5.4 icon APIs are named, namespaced and callback-visible', () => {
  let callbackApi = null;
  for (const name of ['Icon', 'IconData', 'IconThemeData']) {
    assert.equal(typeof Pdf[name], 'function', name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }

  const pdf = latin1(Pdf.createPdf({ theme: iconTheme() }, api => new api.Page({
    build: () => {
      callbackApi = api;
      return new api.Icon(new api.IconData(0xe530));
    }
  })));
  for (const name of ['Icon', 'IconData', 'IconThemeData']) {
    assert.equal(callbackApi[name], Pdf[name], `callback ${name}`);
  }
  assert.match(pdf, /\/BaseFont \/MaterialIcons-Regular/);
});

test('IconData validates scalar values and retains direction matching', () => {
  const icon = new Pdf.IconData(0xe530, { matchTextDirection: true });
  assert.equal(icon.codePoint, 0xe530);
  assert.equal(icon.matchTextDirection, true);
  assert.throws(() => new Pdf.IconData(-1), /Unicode scalar/);
  assert.throws(() => new Pdf.IconData(0xd800), /Unicode scalar/);
  assert.throws(() => new Pdf.IconData(0x110000), /Unicode scalar/);
});

test('ThemeData.withFont installs the upstream icon defaults and copyWith overrides them', () => {
  const font = Pdf.Font.ttf(MATERIAL_ICONS);
  const theme = Pdf.ThemeData.withFont({ icons: font });
  assert.deepEqual(theme.iconTheme.color, [0, 0, 0]);
  assert.equal(theme.iconTheme.opacity, 1);
  assert.equal(theme.iconTheme.size, 24);
  assert.equal(theme.iconTheme.font, font);

  const document = new Pdf.Document({ theme });
  const context = {
    document,
    canvas: null,
    pageFormat: { width: 100, height: 100 },
    pageNumber: 1,
    theme
  };
  const icon = new Pdf.Icon(new Pdf.IconData(0xe530));
  const first = icon.layout(context, { maxWidth: 100, maxHeight: 100 });
  const second = icon.layout(context, { maxWidth: 100, maxHeight: 100 });
  assert.deepEqual([first.width, first.height], [24, 24]);
  assert.deepEqual([second.width, second.height], [24, 24]);

  const changed = theme.copyWith({
    iconTheme: theme.iconTheme.copyWith({ color: '#ff0000', opacity: 0.4, size: 30 })
  });
  assert.deepEqual(changed.iconTheme.color, [1, 0, 0]);
  assert.equal(changed.iconTheme.opacity, 0.4);
  assert.equal(changed.iconTheme.size, 30);
  assert.equal(changed.iconTheme.font, font);
});

test('Icon embeds only the requested private-use glyph at the themed size', () => {
  const pdf = latin1(Pdf.createPdf({ theme: iconTheme() }, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.Icon(new Pdf.IconData(0xe530))
  })));

  assert.match(pdf, /BT \/F1 24 Tf 0 0 0 rg .* <0001> Tj ET/);
  assert.match(pdf, /<0001> <E530>/);
  const subsetLength = Number(pdf.match(/\/Length1 (\d+)/)?.[1]);
  assert.ok(subsetLength > 0 && subsetLength < MATERIAL_ICONS.length / 10);
});

test('icon theme opacity and RTL mirroring scope the glyph paint', () => {
  const font = Pdf.Font.ttf(MATERIAL_ICONS);
  const theme = Pdf.ThemeData.withFont({ icons: font }).copyWith({
    iconTheme: new Pdf.IconThemeData({ font, color: '#ff0000', opacity: 0.4, size: 30 })
  });
  const pdf = latin1(Pdf.createPdf({ theme }, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.Icon(
      new Pdf.IconData(0xe530, { matchTextDirection: true }),
      { textDirection: 'rtl' }
    )
  })));

  assert.match(pdf, /\/ExtGState << \/g1 << \/CA 0\.4 \/ca 0\.4 >> >>/);
  assert.match(pdf, /-1 0 0 1 30 0 cm/);
  assert.match(pdf, /BT \/F1 30 Tf 1 0 0 rg/);
});

test('Icon fails clearly when neither it nor the theme supplies a font', () => {
  assert.throws(
    () => Pdf.createPdf({}, () => new Pdf.Page({
      build: () => new Pdf.Icon(new Pdf.IconData(0xe530))
    })),
    /ThemeData\.withFont\(\{ icons \}\)/
  );
});
