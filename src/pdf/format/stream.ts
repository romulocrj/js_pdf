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
 *   - pdf/lib/src/pdf/format/stream.dart
 *
 * `putString` masks each code unit to a byte rather than asserting the string
 * is 7-bit as upstream does. The port needs it for the binary marker comment in
 * the file header, and PDF syntax is Latin-1 by construction everywhere else.
 */

/** Initial capacity of the geometrically growing byte buffer. */
const GROW = 65536;

/**
 * Growable byte buffer, the sink every `PdfDataType` writes into.
 *
 * `offset` is the running length and is what the cross-reference table records
 * as an object's position, so it must never be rewound.
 */
export class PdfStream {
  private buffer: Uint8Array = new Uint8Array(GROW);
  private length = 0;

  /** Bytes written so far — an object's offset in the file. */
  get offset(): number {
    return this.length;
  }

  private ensure(size: number): void {
    if (this.buffer.length - this.length >= size) {
      return;
    }

    const required = this.length + size;
    let capacity = this.buffer.length === 0 ? GROW : this.buffer.length;
    while (capacity < required) {
      capacity *= 2;
    }

    const grown = new Uint8Array(capacity);
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
  }

  putByte(byte: number): void {
    this.ensure(1);
    this.buffer[this.length++] = byte;
  }

  putBytes(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.buffer.set(bytes, this.length);
    this.length += bytes.length;
  }

  /** Append a string whose code units are all byte values. */
  putString(value: string): void {
    this.ensure(value.length);
    for (let index = 0; index < value.length; index++) {
      this.buffer[this.length++] = value.charCodeAt(index) & 0xff;
    }
  }

  /** The bytes written, as a copy the caller owns. */
  output(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }

  /** Copy the filled prefix and release the growable backing allocation. */
  take(finalByte?: number): Uint8Array {
    const result = new Uint8Array(this.length + (finalByte === undefined ? 0 : 1));
    result.set(this.buffer.subarray(0, this.length));
    if (finalByte !== undefined) result[this.length] = finalByte;
    this.buffer = new Uint8Array(0);
    this.length = 0;
    return result;
  }

  /** Read-only view used internally while the stream remains alive. */
  view(): Uint8Array {
    return this.buffer.subarray(0, this.length);
  }
}

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
