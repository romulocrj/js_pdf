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
 *   - pdf/lib/src/pdf/obj/page_label.dart
 */

import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum } from '../format/num.ts';
import { PdfString } from '../format/string.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';

export type PdfPageLabelStyle =
  | 'arabic'
  | 'romanUpper'
  | 'romanLower'
  | 'lettersUpper'
  | 'lettersLower';

export interface PdfPageLabelOptions {
  readonly prefix?: string | null;
  readonly style?: PdfPageLabelStyle | null;
  readonly subsequent?: number | null;
}

/** The numbering style beginning at one zero-based physical page index. */
export class PdfPageLabel {
  readonly prefix: string | null;
  readonly style: PdfPageLabelStyle | null;
  readonly subsequent: number | null;

  constructor({ prefix = null, style = null, subsequent = null }: PdfPageLabelOptions = {}) {
    const styles: readonly PdfPageLabelStyle[] = [
      'arabic', 'romanUpper', 'romanLower', 'lettersUpper', 'lettersLower'
    ];
    if (style !== null && !styles.includes(style)) {
      throw new TypeError(`Unknown page label style: ${String(style)}`);
    }
    this.prefix = prefix === null ? null : String(prefix);
    this.style = style;
    this.subsequent = subsequent === null ? null : Number(subsequent);
    if (this.subsequent !== null && (!Number.isInteger(this.subsequent) || this.subsequent < 1)) {
      throw new RangeError('Page label subsequent must be a positive integer');
    }
  }

  static arabic(options: Omit<PdfPageLabelOptions, 'style'> = {}): PdfPageLabel {
    return new PdfPageLabel({ ...options, style: 'arabic' });
  }

  static romanUpper(options: Omit<PdfPageLabelOptions, 'style'> = {}): PdfPageLabel {
    return new PdfPageLabel({ ...options, style: 'romanUpper' });
  }

  static romanLower(options: Omit<PdfPageLabelOptions, 'style'> = {}): PdfPageLabel {
    return new PdfPageLabel({ ...options, style: 'romanLower' });
  }

  static lettersUpper(options: Omit<PdfPageLabelOptions, 'style'> = {}): PdfPageLabel {
    return new PdfPageLabel({ ...options, style: 'lettersUpper' });
  }

  static lettersLower(options: Omit<PdfPageLabelOptions, 'style'> = {}): PdfPageLabel {
    return new PdfPageLabel({ ...options, style: 'lettersLower' });
  }

  toDict(): PdfDict {
    const result = new PdfDict();
    const styleNames: Readonly<Record<PdfPageLabelStyle, string>> = {
      arabic: '/D',
      romanUpper: '/R',
      romanLower: '/r',
      lettersUpper: '/A',
      lettersLower: '/a'
    };
    if (this.style !== null) result.set('/S', new PdfName(styleNames[this.style]));
    if (this.prefix !== null && this.prefix.length > 0) result.set('/P', new PdfString(this.prefix));
    if (this.subsequent !== null) result.set('/St', new PdfNum(this.subsequent));
    return result;
  }

  private toRoman(decimal: number): string {
    if (decimal < 1 || decimal > 3999) {
      throw new RangeError('Roman page labels are limited to 1 through 3999');
    }
    const dictionary: readonly (readonly [number, string])[] = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'],
      [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'],
      [5, 'V'], [4, 'IV'], [1, 'I']
    ];
    let value = decimal;
    let result = '';
    for (const [number, numeral] of dictionary) {
      while (value >= number) {
        value -= number;
        result += numeral;
      }
    }
    return result;
  }

  private toLetters(decimal: number): string {
    const letter = String.fromCharCode(0x41 + decimal % 26);
    return letter.repeat(Math.floor(decimal / 26) + 1);
  }

  asString(index = 0): string {
    const number = index + (this.subsequent === null ? 0 : this.subsequent - 1);
    let suffix = '';
    switch (this.style) {
      case 'arabic': suffix = String(number + 1); break;
      case 'romanUpper': suffix = this.toRoman(number + 1); break;
      case 'romanLower': suffix = this.toRoman(number + 1).toLowerCase(); break;
      case 'lettersUpper': suffix = this.toLetters(number); break;
      case 'lettersLower': suffix = this.toLetters(number).toLowerCase(); break;
      case null: break;
    }
    return `${this.prefix ?? ''}${suffix}`;
  }
}

/** The catalog number tree behind `/PageLabels`. */
export class PdfPageLabels extends PdfObject<PdfDict> {
  readonly labels = new Map<number, PdfPageLabel>();

  constructor(document: PdfObjectRegistry) {
    super(document, new PdfDict());
  }

  pageLabel(index: number): string {
    const keys = [...this.labels.keys()].sort((a, b) => a - b);
    let current = PdfPageLabel.arabic();
    let start = 0;
    for (const key of keys) {
      if (index < key) break;
      current = this.labels.get(key) ?? current;
      start = key;
    }
    return current.asString(index - start);
  }

  override prepare(): void {
    const nums = new PdfArray();
    for (const key of [...this.labels.keys()].sort((a, b) => a - b)) {
      const label = this.labels.get(key);
      if (label === undefined) continue;
      nums.add(new PdfNum(key));
      nums.add(label.toDict());
    }
    this.params.set('/Nums', nums);
  }
}
