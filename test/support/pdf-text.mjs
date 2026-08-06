/*
 * js_pdf test support — reading a generated PDF as text.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Most tests assert on the operators a widget emitted, which means reading the
 * file as latin-1 and matching against it. Streams are deflated by default, so
 * a plain byte-to-string conversion would only ever see compressed noise. This
 * expands every `/FlateDecode` stream in place, leaving the rest of the file
 * exactly as written — the text a test matches against is therefore the content
 * the document logically holds, whether or not compression was on.
 *
 * Input that is not a whole PDF, such as a bare content stream, passes through
 * untouched: with no stream framing to find there is nothing to expand.
 */

import { inflateSync } from 'node:zlib';

/** The port writes `>>` then this, then the raw stream data. */
const STREAM_MARKER = '\nstream\n';

export function latin1(bytes) {
  const buffer = Buffer.from(bytes);
  const raw = buffer.toString('latin1');

  let output = '';
  let cursor = 0;

  for (;;) {
    const marker = raw.indexOf(STREAM_MARKER, cursor);
    if (marker === -1) {
      output += raw.slice(cursor);
      return output;
    }

    const dataStart = marker + STREAM_MARKER.length;

    // `/Length` is the authority on where the data ends — the bytes are binary
    // and may well contain `endstream` by coincidence. It is written last, at
    // the top level of the object, so the search starts at the object header
    // rather than at the nearest `<<`, which could be a nested dictionary.
    const objectStart = raw.lastIndexOf(' obj\n', marker);
    const header = raw.slice(objectStart === -1 ? 0 : objectStart, marker);
    const declared = /\/Length (\d+)/.exec(header);

    if (declared === null) {
      output += raw.slice(cursor, dataStart);
      cursor = dataStart;
      continue;
    }

    const dataEnd = dataStart + Number(declared[1]);
    output += raw.slice(cursor, dataStart);
    const data = buffer.subarray(dataStart, dataEnd);
    output += header.includes('/FlateDecode')
      ? inflateSync(data).toString('latin1')
      : data.toString('latin1');
    cursor = dataEnd;
  }
}
