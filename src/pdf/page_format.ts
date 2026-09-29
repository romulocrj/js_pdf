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
 *   - pdf/lib/src/pdf/page_format.dart
 */

/**
 * Page dimensions in PDF points (1/72 inch), and the margins the format brings
 * with it — upstream `PdfPageFormat` carries both, and a page with no margin of
 * its own takes the format's.
 */
export interface PageSize {
  readonly width: number;
  readonly height: number;
  readonly marginTop?: number;
  readonly marginRight?: number;
  readonly marginBottom?: number;
  readonly marginLeft?: number;
}

const CM = 72 / 2.54;
const MM = 72 / 25.4;

/** Upstream paper presets, in points, including their default margins. */
function paper(width: number, height: number, margin: number): PageSize {
  return Object.freeze({
    width, height,
    marginTop: margin, marginRight: margin, marginBottom: margin, marginLeft: margin
  });
}

// Preserve the port's historical rounded A4 dimensions for existing callers.
const A4 = paper(595.28, 841.89, 2 * CM);

/** Infinite dimensions are fitted to the body by Page; MultiPage needs finite paper. */
export const PageFormat = Object.freeze({
  A3: paper(29.7 * CM, 42 * CM, 2 * CM),
  A4,
  A5: paper(14.8 * CM, 21 * CM, 2 * CM),
  A6: paper(105 * MM, 148 * MM, CM),
  LETTER: paper(612, 792, 72),
  LEGAL: paper(612, 1008, 72),
  ROLL57: paper(57 * MM, Infinity, 5 * MM),
  ROLL80: paper(80 * MM, Infinity, 5 * MM),
  UNDEFINED: paper(Infinity, Infinity, 0),
  STANDARD: A4
});

/**
 * The margin a page falls back to when neither it nor its format states one.
 * Upstream has no such value — a `PdfPageFormat` always carries margins — so
 * this covers the port's bare `{ width, height }` formats alone.
 */
export const DEFAULT_MARGIN = 40;

/** The margins a format declares, or `null` when it declares none. */
export function formatMargin(format: PageSize): {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
} | null {
  const { marginTop, marginRight, marginBottom, marginLeft } = format;
  if (
    marginTop === undefined
    && marginRight === undefined
    && marginBottom === undefined
    && marginLeft === undefined
  ) {
    return null;
  }

  return {
    top: marginTop ?? 0,
    right: marginRight ?? 0,
    bottom: marginBottom ?? 0,
    left: marginLeft ?? 0
  };
}

/**
 * One physical unit in PDF points. Upstream holds these as statics on
 * `PdfPageFormat`; SVG needs them because a length may be written `10mm`.
 */
export const PageUnit = Object.freeze({
  point: 1,
  inch: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  pica: 12,
  dp: 72 / 150
});

/** Upstream value-class spelling; existing PageFormat objects remain supported. */
export class PdfPageFormat implements PageSize {
  readonly width: number;
  readonly height: number;
  readonly marginTop: number;
  readonly marginRight: number;
  readonly marginBottom: number;
  readonly marginLeft: number;
  constructor(width: number, height: number, options: Omit<PageSize, 'width' | 'height'> & { readonly marginAll?: number } = {}) {
    if (!(width > 0) || !(height > 0)) throw new RangeError('Page dimensions must be positive');
    this.width = width; this.height = height;
    this.marginTop = options.marginAll ?? options.marginTop ?? 0;
    this.marginRight = options.marginAll ?? options.marginRight ?? 0;
    this.marginBottom = options.marginAll ?? options.marginBottom ?? 0;
    this.marginLeft = options.marginAll ?? options.marginLeft ?? 0;
  }
  static readonly a3 = new PdfPageFormat(PageFormat.A3.width, PageFormat.A3.height, PageFormat.A3);
  static readonly a4 = new PdfPageFormat(PageFormat.A4.width, PageFormat.A4.height, PageFormat.A4);
  static readonly a5 = new PdfPageFormat(PageFormat.A5.width, PageFormat.A5.height, PageFormat.A5);
  static readonly a6 = new PdfPageFormat(PageFormat.A6.width, PageFormat.A6.height, PageFormat.A6);
  static readonly letter = new PdfPageFormat(PageFormat.LETTER.width, PageFormat.LETTER.height, PageFormat.LETTER);
  static readonly legal = new PdfPageFormat(PageFormat.LEGAL.width, PageFormat.LEGAL.height, PageFormat.LEGAL);
  static readonly roll57 = new PdfPageFormat(PageFormat.ROLL57.width, Infinity, PageFormat.ROLL57);
  static readonly roll80 = new PdfPageFormat(PageFormat.ROLL80.width, Infinity, PageFormat.ROLL80);
  static readonly undefined = new PdfPageFormat(Infinity, Infinity);
  static readonly standard = PdfPageFormat.a4;
  static readonly point = PageUnit.point;
  static readonly inch = PageUnit.inch;
  static readonly cm = PageUnit.cm;
  static readonly mm = PageUnit.mm;
  static readonly dp = PageUnit.dp;
  copyWith(values: Partial<PageSize> = {}): PdfPageFormat {
    return new PdfPageFormat(values.width ?? this.width, values.height ?? this.height, {
      marginTop: values.marginTop ?? this.marginTop, marginRight: values.marginRight ?? this.marginRight,
      marginBottom: values.marginBottom ?? this.marginBottom, marginLeft: values.marginLeft ?? this.marginLeft
    });
  }
  get dimension(): { x: number; y: number } { return { x: this.width, y: this.height }; }
  get availableWidth(): number { return this.width - this.marginLeft - this.marginRight; }
  get availableHeight(): number { return this.height - this.marginTop - this.marginBottom; }
  get availableDimension(): { x: number; y: number } { return { x: this.availableWidth, y: this.availableHeight }; }
  get landscape(): PdfPageFormat { return this.width >= this.height ? this : this.copyWith({ width: this.height, height: this.width }); }
  get portrait(): PdfPageFormat { return this.height >= this.width ? this : this.copyWith({ width: this.height, height: this.width }); }
  applyMargin({ left, top, right, bottom }: { left: number; top: number; right: number; bottom: number }): PdfPageFormat {
    return this.copyWith({ marginLeft: Math.max(this.marginLeft, left), marginTop: Math.max(this.marginTop, top),
      marginRight: Math.max(this.marginRight, right), marginBottom: Math.max(this.marginBottom, bottom) });
  }
  equals(other: unknown): boolean {
    return other instanceof PdfPageFormat && this.width === other.width && this.height === other.height
      && this.marginLeft === other.marginLeft && this.marginTop === other.marginTop
      && this.marginRight === other.marginRight && this.marginBottom === other.marginBottom;
  }
  get hashCode(): number {
    let hash = 0;
    for (const character of this.toString()) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
    return hash;
  }
  toString(): string { return `PdfPageFormat ${this.width}x${this.height} margins:${this.marginLeft}, ${this.marginTop}, ${this.marginRight}, ${this.marginBottom}`; }
}
