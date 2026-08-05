/*
 * js_pdf port of pdf/example/main.dart from dart_pdf.
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

export function generateHelloWorld() {
  const pdf = new pw.Document();

  pdf.addPage(
    new pw.Page({
      build: () => new pw.Text('Hello World!', { align: 'center' })
    })
  );

  return pdf.save();
}
