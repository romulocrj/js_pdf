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
 *   - pdf/lib/src/pdf/format/string.dart
 */

/**
 * Unicode code point to CP1252 (WinAnsiEncoding) byte, for the 0x80..0x9F
 * range where CP1252 diverges from Latin-1.
 */
const CP1252: Readonly<Record<number, number>> = Object.freeze({
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f
});

export function toWinAnsiByte(codePoint: number): number {
  if (codePoint <= 0xff) return codePoint;
  return CP1252[codePoint] ?? 0x3f;
}

/**
 * A PDF literal string `(...)`, escaped and down-converted to WinAnsi.
 *
 * Text outside WinAnsi becomes `?` until TTF embedding lands and strings can
 * be emitted as hex-encoded CID glyph indices instead.
 */
export function pdfLiteral(value: string): string {
  let output = '';

  for (const character of String(value)) {
    const byte = toWinAnsiByte(character.codePointAt(0) ?? 0x3f);

    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      output += `\\${String.fromCharCode(byte)}`;
    } else if (byte === 0x0a) {
      output += '\\n';
    } else if (byte === 0x0d) {
      output += '\\r';
    } else if (byte < 0x20 || byte > 0x7e) {
      output += `\\${byte.toString(8).padStart(3, '0')}`;
    } else {
      output += String.fromCharCode(byte);
    }
  }

  return `(${output})`;
}
