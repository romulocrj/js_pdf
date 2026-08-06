/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - barcode/lib/src/barcode_exception.dart
 *
 * Raised when the library cannot generate the requested barcode.
 */

/** Raised when a [Barcode] cannot encode the data it was given. */
export class BarcodeException extends Error {
  constructor(message: string) {
    super(message);
    // Upstream's is a plain `Exception`; extending `Error` is what makes the
    // message survive a rethrow and keeps `isValid`'s catch honest.
    this.name = 'BarcodeException';
  }
}
