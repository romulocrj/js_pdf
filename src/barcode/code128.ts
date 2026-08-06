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
 *   - barcode/lib/src/code128.dart
 */

import { codeUnits, utf8Decode } from '../base/utf8.ts';
import { Barcode1D } from './barcode_1d.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeMaps } from './barcode_maps.ts';
import type { BarcodeElement } from './barcode_operations.ts';

/** The function codes Code 128 defines for application-specific meaning. */
export const BarcodeCode128Fnc = {
  /** FNC1 at the start of a symbol marks it as GS1-128. */
  fnc1: BarcodeMaps.code128FNC1String,
  /** Function 2, available in tables A and B. */
  fnc2: BarcodeMaps.code128FNC2String,
  /** Function 3, available in tables A and B. */
  fnc3: BarcodeMaps.code128FNC3String,
  /** Function 4, available in tables A and B. */
  fnc4: BarcodeMaps.code128FNC4String
} as const;

/** Construction options for [BarcodeCode128]. */
export interface BarcodeCode128Options {
  readonly useCode128A: boolean;
  readonly useCode128B: boolean;
  readonly useCode128C: boolean;
  readonly isGS1: boolean;
  readonly escapes: boolean;
  readonly keepParenthesis: boolean;
  readonly addSpaceAfterParenthesis: boolean;
}

/**
 * Code 128 barcode, and its GS1-128 application standard.
 *
 * A high-density linear symbology covering all 128 ASCII characters, defined
 * in ISO/IEC 15417:2007. Three code tables encode the same data at different
 * densities; the encoder mixes them to produce the shortest symbol.
 */
export class BarcodeCode128 extends Barcode1D {
  readonly useCode128A: boolean;
  readonly useCode128B: boolean;
  readonly useCode128C: boolean;
  readonly escapes: boolean;
  readonly isGS1: boolean;
  readonly keepParenthesis: boolean;
  readonly addSpaceAfterParenthesis: boolean;

  constructor(options: BarcodeCode128Options) {
    super();
    if (!options.useCode128A && !options.useCode128B && !options.useCode128C) {
      throw new BarcodeException('Enable at least one of the CODE 128 tables');
    }
    this.useCode128A = options.useCode128A;
    this.useCode128B = options.useCode128B;
    this.useCode128C = options.useCode128C;
    this.isGS1 = options.isGS1;
    this.escapes = options.escapes;
    this.keepParenthesis = options.keepParenthesis;
    this.addSpaceAfterParenthesis = options.addSpaceAfterParenthesis;
  }

  override get charSet(): Iterable<number> {
    const set = new Set<number>();

    if (this.useCode128B) {
      for (const key of BarcodeMaps.code128B.keys()) if (key >= 0) set.add(key);
    }
    if (this.useCode128A) {
      for (const key of BarcodeMaps.code128A.keys()) if (key >= 0) set.add(key);
    }
    if (this.useCode128C) {
      for (let index = 0; index < 10; index++) set.add(index + 0x30);
    }

    set.add(BarcodeMaps.code128FNC1);
    if (this.useCode128A || this.useCode128B) {
      set.add(BarcodeMaps.code128FNC2);
      set.add(BarcodeMaps.code128FNC3);
      set.add(BarcodeMaps.code128FNC4);
    }
    if (this.isGS1) {
      set.add(40);
      set.add(41);
    }

    return set;
  }

  override get name(): string {
    return this.isGS1 ? 'GS1 128' : 'CODE 128';
  }

  /**
   * Find the shortest encoding using a mix of tables A, B and C.
   *
   * The walk is backwards, because a switch to table C only pays for itself
   * once four digits are known to follow.
   */
  shortestCode(data: Uint16Array): number[] {
    // table is a bit set: 1 = table A, 2 = table B, 4 = table C.
    let table = 0;
    // the last table emitted: 0 none, 1 A, 2 B, 3 C.
    let lastTable = 0;
    // the number of characters accumulated for the current table.
    let length = 0;
    let digitCount = 0;

    const result: number[] = [];

    const addFrom = (start: number): void => {
      let t: Map<number, number> | null = null;

      if ((table & 4) !== 0 && (digitCount & 1) === 0) {
        // New data from table C
        t = BarcodeMaps.code128C;
        if (lastTable === 1) {
          result.push(t.get(BarcodeMaps.code128CodeA) as number);
        } else if (lastTable === 2) {
          result.push(t.get(BarcodeMaps.code128CodeB) as number);
        }
        lastTable = 3;
      } else if ((table & 1) !== 0) {
        // New data from table A
        t = BarcodeMaps.code128A;
        if (lastTable === 2) {
          result.push(t.get(BarcodeMaps.code128CodeB) as number);
        } else if (lastTable === 3) {
          result.push(t.get(BarcodeMaps.code128CodeC) as number);
        }
        lastTable = 1;
      } else if ((table & 2) !== 0) {
        // New data from table B
        t = BarcodeMaps.code128B;
        if (lastTable === 1) {
          result.push(t.get(BarcodeMaps.code128CodeA) as number);
        } else if (lastTable === 3) {
          result.push(t.get(BarcodeMaps.code128CodeC) as number);
        }
        lastTable = 2;
      }

      if (t === null) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(...data)}" to ${this.name} Barcode`
        );
      }

      if (lastTable === 3) {
        // Table C encodes two digits per symbol.
        for (let i = start + length - 1; i >= start; i--) {
          if (data[i] === BarcodeMaps.code128FNC1) {
            result.push(t.get(BarcodeMaps.code128FNC1) as number);
          } else {
            const digit = (data[i] as number) - 0x30 + ((data[i - 1] as number) - 0x30) * 10;
            result.push(t.get(digit) as number);
            i--;
          }
        }
      } else {
        for (const c of data.slice(start, start + length).reverse()) {
          result.push(t.get(c) as number);
        }
      }
    };

    for (let index = data.length - 1; index >= 0; index--) {
      const code = data[index] as number;

      const codeA = this.useCode128A && BarcodeMaps.code128A.has(code);
      const codeB = this.useCode128B && BarcodeMaps.code128B.has(code);
      const isFnc1 = code === BarcodeMaps.code128FNC1;
      const codeC = this.useCode128C && code >= 0x30 && code <= 0x39;

      let available = 0;
      if (codeA) available = 1;
      if (codeB) available |= 2;
      if (codeC || isFnc1) available |= 4;

      if (available === 0) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`
        );
      }

      if (codeC) {
        digitCount++;
      } else if (isFnc1) {
        length++;
        addFrom(index);
        length = 0;
        digitCount = 0;
        continue;
      } else {
        if (digitCount >= 4) {
          // Four digits or more are worth a switch to table C.
          if ((digitCount & 1) !== 0) {
            // Odd count: leave the first digit to the alphanumeric table.
            digitCount--;
          }
          if (length > digitCount) {
            length -= digitCount;
            // First, the characters that stay in table A or B.
            table &= 3;
            if (table === 0) {
              throw new BarcodeException(
                `Unable to encode "${String.fromCharCode(...data)}" to ${this.name} Barcode`
              );
            }
            addFrom(index + digitCount + 1);
            length = digitCount;
          }
          // Then the digits, in table C.
          table = 4;
          addFrom(index + 1);
          table = 0;
          length = 0;
        }
        digitCount = 0;
      }

      if (table === 0) {
        table = available;
        length++;
      } else {
        const newTable = table & available;
        if (newTable === 0) {
          addFrom(index + 1);
          length = 0;
          table = available;
        } else {
          table = newTable;
        }
        length++;
      }
    }

    if (digitCount >= 2) {
      if ((digitCount & 1) !== 0) {
        // Odd number of digits: emit the leading one on its own.
        length -= digitCount - 1;
        addFrom(digitCount - 1);
        digitCount--;
      } else if (length > digitCount) {
        length -= digitCount;
        addFrom(digitCount);
      }
      table = 4;
      length = digitCount;
    }
    if (length > 0) {
      addFrom(0);
    }

    // The start code, which the backwards walk leaves for last.
    if (lastTable === 1) {
      result.push(BarcodeMaps.code128StartCodeA);
    } else if (lastTable === 2) {
      result.push(BarcodeMaps.code128StartCodeB);
    } else if (lastTable === 3) {
      result.push(BarcodeMaps.code128StartCodeC);
    }

    return result.reverse();
  }

  /** Rewrite the data, inserting FNC1 where GS1 parentheses or escapes ask. */
  adaptData(data: string, text = false): string {
    if (this.isGS1) {
      let result = '';
      let start = 0;
      for (const match of data.matchAll(/\(.+?\)/g)) {
        const from = match.index;
        const to = from + match[0].length;
        result += data.substring(start, from);
        result += BarcodeMaps.code128FNC1String;
        if (text && this.keepParenthesis) result += '(';
        result += data.substring(from + 1, to - 1);
        if (text && this.keepParenthesis) result += ')';
        if (text && this.addSpaceAfterParenthesis) result += ' ';
        start = to;
      }
      result += data.substring(start);
      data = result;
    }

    if (this.escapes) {
      let result = '';
      let start = 0;
      for (const match of data.matchAll(/\{\d\}/g)) {
        const from = match.index;
        const to = from + match[0].length;
        result += data.substring(start, from);
        switch (match[0]) {
          case '{1}': result += BarcodeMaps.code128FNC1String; break;
          case '{2}': result += BarcodeMaps.code128FNC2String; break;
          case '{3}': result += BarcodeMaps.code128FNC3String; break;
          case '{4}': result += BarcodeMaps.code128FNC4String; break;
          default: result += match[0];
        }
        start = to;
      }
      result += data.substring(start);
      data = result;
    }

    return data;
  }

  override convert(data: string): boolean[] {
    const bits: boolean[] = [];
    const adapted = this.adaptData(data);

    const checksum: number[] = [];

    for (const codeIndex of this.shortestCode(codeUnits(adapted))) {
      const codeValue = BarcodeMaps.code128.get(codeIndex) as number;
      bits.push(...this.add(codeValue, BarcodeMaps.code128Len));
      checksum.push(codeIndex);
    }

    // Checksum
    let sum = 0;
    for (let index = 0; index < checksum.length; index++) {
      const code = checksum[index] as number;
      const mul = index === 0 ? 1 : index;
      sum += code * mul;
    }
    sum = sum % 103;
    bits.push(...this.add(BarcodeMaps.code128.get(sum) as number, BarcodeMaps.code128Len));

    // Stop
    bits.push(...this.add(
      BarcodeMaps.code128.get(BarcodeMaps.code128Stop) as number,
      BarcodeMaps.code128Len
    ));

    // Termination bars
    bits.push(true, true);

    return bits;
  }

  override makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[] {
    // The function codes have no printable form; they become spaces, which the
    // trim then removes from the ends.
    const text = this.adaptData(data, true).replace(/[^ -\u007f]/g, ' ').trim();
    return super.makeText(text, params, lineWidth);
  }

  override verifyBytes(data: Uint8Array): void {
    const adapted = this.adaptData(utf8Decode(data));
    const units = codeUnits(adapted);
    this.shortestCode(units);
    super.verifyBytes(Uint8Array.from(units.map(unit => unit & 0xff)));
  }
}
