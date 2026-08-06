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
 *
 * `Uint16Array` and not `Uint8Array`, per AGENTS.md §3: a code unit is sixteen
 * bits, and narrowing it to eight would silently truncate every character above
 * U+00FF into a different one — which is exactly the case the symbologies call
 * this to detect and reject.
 */
export function codeUnits(text: string): Uint16Array {
  const units = new Uint16Array(text.length);
  for (let i = 0; i < text.length; i++) units[i] = text.charCodeAt(i);
  return units;
}

/**
 * Encode a string to UTF-8 bytes. Unpaired surrogates become U+FFFD.
 *
 * Written straight into a `Uint8Array` rather than collected and converted, per
 * AGENTS.md §3. Three bytes per UTF-16 code unit is an exact ceiling and not an
 * estimate: the only four-byte sequences come from surrogate pairs, which are
 * two units, so nothing costs more per unit than a three-byte character does.
 */
export function utf8Encode(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 3);
  let length = 0;

  for (const character of text) {
    let point = character.codePointAt(0) ?? 0xfffd;
    if (point >= 0xd800 && point <= 0xdfff) point = 0xfffd;

    if (point < 0x80) {
      bytes[length++] = point;
    } else if (point < 0x800) {
      bytes[length++] = 0xc0 | (point >> 6);
      bytes[length++] = 0x80 | (point & 0x3f);
    } else if (point < 0x10000) {
      bytes[length++] = 0xe0 | (point >> 12);
      bytes[length++] = 0x80 | ((point >> 6) & 0x3f);
      bytes[length++] = 0x80 | (point & 0x3f);
    } else {
      bytes[length++] = 0xf0 | (point >> 18);
      bytes[length++] = 0x80 | ((point >> 12) & 0x3f);
      bytes[length++] = 0x80 | ((point >> 6) & 0x3f);
      bytes[length++] = 0x80 | (point & 0x3f);
    }
  }

  return bytes.subarray(0, length).slice();
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
