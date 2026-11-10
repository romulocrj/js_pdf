/*
 * Ported to JavaScript from https://github.com/DavBfr/dart_pdf
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port: https://github.com/romulocrj/js_pdf
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/pdf/format/string.dart
 *
 * Text strings are written as a literal only where PDFDocEncoding agrees with
 * Unicode, and as UTF-16BE with a byte-order marker everywhere else. Upstream
 * tries Latin-1; the port used to try CP1252. Both are wrong for a text string:
 * ISO 32000-1 7.9.2.2 reads its bytes as PDFDocEncoding, which puts other
 * characters at 0x80..0xA0 (`€—` written as CP1252 read back as `•Š`).
 * Content-stream text is a different thing and stays WinAnsi: `pdfLiteral`.
 */

import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';

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

/**
 * A PDF hex string `<...>`, written as fixed-width big-endian words.
 *
 * This is how text is emitted for a composite font: with `/Identity-H` the
 * bytes between the angle brackets are two-byte CIDs, not characters, so the
 * literal escaping rules above do not apply at all.
 */
export function pdfHexString(values: readonly number[], digits = 4): string {
  let output = '';

  for (const value of values) {
    output += value.toString(16).padStart(digits, '0');
  }

  return `<${output}>`;
}

/**
 * Whether every code unit is one PDFDocEncoding (ISO 32000-1 Annex D) gives the
 * same meaning as Unicode: tab, line feed, carriage return, 0x20..0x7E, and
 * 0xA1..0xFF except 0xAD. Everything else is either undefined there or a
 * different character - 0x18..0x1F and 0x80..0x9F are other glyphs, and 0xA0
 * is the euro sign - so a literal would read back as something else.
 */
function fitsPdfDocEncoding(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit < 0x20
      ? unit !== 0x09 && unit !== 0x0a && unit !== 0x0d
      : (unit > 0x7e && unit < 0xa1) || unit === 0xad || unit > 0xff) return false;
  }
  return true;
}

/**
 * The bytes `PdfString` writes for `value`, one character per byte. Name-tree
 * keys are ordered by these (ISO 32000-1 7.9.6), not by locale collation.
 */
export function pdfTextBytes(value: string): string {
  if (fitsPdfDocEncoding(value)) return value;
  let bytes = '\u00fe\u00ff';
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    bytes += String.fromCharCode(unit >> 8, unit & 0xff);
  }
  return bytes;
}

/** PDF text string encoded as UTF-16BE, including its required marker. */
export function pdfUnicodeString(value: string): string {
  let output = 'feff';
  for (let index = 0; index < value.length; index++) {
    output += value.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return `<${output}>`;
}

/** A PDF string object. */
export class PdfString extends PdfDataType {
  readonly value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }

  /** A PDF date normalized to UTC, matching upstream's second precision. */
  static fromDate(date: Date): PdfString {
    if (!Number.isFinite(date.getTime())) {
      throw new RangeError('PDF date must be valid');
    }

    const year = String(date.getUTCFullYear()).padStart(4, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    const second = String(date.getUTCSeconds()).padStart(2, '0');

    return new PdfString(`D:${year}${month}${day}${hour}${minute}${second}Z`);
  }

  override output(s: PdfStream): void {
    s.putString(fitsPdfDocEncoding(this.value) ? pdfLiteral(this.value) : pdfUnicodeString(this.value));
  }
}
