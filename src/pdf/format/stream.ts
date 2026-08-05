/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/pdf/format/stream.dart
 *   - pdf/lib/src/pdf/format/base.dart
 *
 * Upstream `PdfStream` is a growable byte buffer. The port keeps the byte
 * helpers free-standing because content is assembled as strings and encoded
 * once, which avoids depending on any host byte-buffer or text-encoding API.
 */

/**
 * Encode a string where every code unit is already a byte value (0..255).
 * PDF syntax and content streams are Latin-1 by construction.
 */
export function encodeLatin1(value: string): Uint8Array {
  const result = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index++) {
    result[index] = value.charCodeAt(index) & 0xff;
  }
  return result;
}

export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}
