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
 *   - pdf/lib/src/base/exceptions.dart
 *
 * There is no upstream file for this. Dart reaches for `dart:convert`'s UTF-8
 * codec, and the runtime this port targets provides no equivalent — the
 * standard pair of encoder/decoder globals is a host API, not a language one.
 * `widgets/barcode.dart` and everything under `barcode/` need one, so the codec
 * is written here, in the layer nothing else depends on.
 */

/**
 * The UTF-16 code units of a string, which is what Dart's `String.codeUnits`
 * yields. Not code *points*: a symbology that rejects anything above U+00FF
 * has to see the surrogate pair, not the character it forms.
 */
export function codeUnits(text: string): number[] {
  const units: number[] = [];
  for (let i = 0; i < text.length; i++) units.push(text.charCodeAt(i));
  return units;
}

/** Encode a string to UTF-8 bytes. Unpaired surrogates become U+FFFD. */
export function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];

  for (const character of text) {
    let point = character.codePointAt(0) ?? 0xfffd;
    if (point >= 0xd800 && point <= 0xdfff) point = 0xfffd;

    if (point < 0x80) {
      bytes.push(point);
    } else if (point < 0x800) {
      bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    } else if (point < 0x10000) {
      bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f)
      );
    }
  }

  return Uint8Array.from(bytes);
}

/** Decode UTF-8 bytes back to a string. Malformed sequences become U+FFFD. */
export function utf8Decode(bytes: Uint8Array): string {
  let text = '';

  for (let i = 0; i < bytes.length;) {
    const first = bytes[i] as number;
    let point: number;
    let length: number;

    if (first < 0x80) {
      point = first;
      length = 1;
    } else if ((first & 0xe0) === 0xc0) {
      point = first & 0x1f;
      length = 2;
    } else if ((first & 0xf0) === 0xe0) {
      point = first & 0x0f;
      length = 3;
    } else if ((first & 0xf8) === 0xf0) {
      point = first & 0x07;
      length = 4;
    } else {
      text += '�';
      i++;
      continue;
    }

    if (i + length > bytes.length) {
      text += '�';
      break;
    }

    let valid = true;
    for (let n = 1; n < length; n++) {
      const byte = bytes[i + n] as number;
      if ((byte & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      point = (point << 6) | (byte & 0x3f);
    }

    if (!valid || point > 0x10ffff) {
      text += '�';
      i++;
      continue;
    }

    text += String.fromCodePoint(point);
    i += length;
  }

  return text;
}
