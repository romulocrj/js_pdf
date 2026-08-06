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
 *   - pdf/lib/src/svg/parser.dart
 *
 * How an SVG attribute becomes a number, and how a document reports its own
 * size.
 *
 * The numeric half landed in phase 2.4 because transforms needed it. The
 * `SvgParser` class — intrinsic size, viewBox and `findById` — followed in 2.5
 * rather than 2.7 as the roadmap had it, because no paint module can be written
 * without `findById` and `colorFilter`. The `SvgImage` widget that drives this
 * followed in phase 2.7.
 *
 * PORT GAP: `sizeValue` returns `value / 100` for a percentage, which is
 * upstream's behaviour and is wrong in the general case — a percentage is
 * relative to the viewport, or to the diagonal for a length with no axis. It is
 * kept because changing it would silently move every SVG that has one, and
 * because nothing in the port's corpus relies on the correct reading. Fixing it
 * needs the viewport threaded down to every attribute lookup.
 */

import type { Rgb } from '../pdf/color.ts';
import { PageUnit } from '../pdf/page_format.ts';
import { PdfRect } from '../pdf/rect.ts';
import type { XmlDocument, XmlElement } from './xml.ts';

export type SvgUnit =
  | 'pixels'
  | 'millimeters'
  | 'centimeters'
  | 'inch'
  | 'em'
  | 'percent'
  | 'points'
  | 'direct';

const UNIT_SUFFIXES: Readonly<Record<string, SvgUnit>> = Object.freeze({
  px: 'pixels',
  mm: 'millimeters',
  cm: 'centimeters',
  in: 'inch',
  em: 'em',
  '%': 'percent',
  pt: 'points',
  '': 'direct'
});

/**
 * What an `em` length needs to resolve against. Declared structurally rather
 * than importing `SvgBrush`, which is what carries it: the brush is built out
 * of numerics, so importing it here would be a cycle.
 */
export interface SvgFontSizeContext {
  readonly fontSize: SvgNumeric | null;
}

/** A length or a colour component, with the unit it was written in. */
export class SvgNumeric {
  readonly value: number;
  readonly unit: SvgUnit;
  readonly brush: SvgFontSizeContext | null;

  constructor(value: number, brush: SvgFontSizeContext | null, unit: SvgUnit = 'direct') {
    this.value = value;
    this.unit = unit;
    this.brush = brush;
  }

  /** `12`, `1.5em`, `-3.5%`. Upstream's `SvgNumeric(String, SvgBrush?)`. */
  static parse(text: string, brush: SvgFontSizeContext | null): SvgNumeric {
    const match = /([-+]?[\d.]+)\s*(px|pt|em|cm|mm|in|%|)/.exec(text);
    if (match === null) {
      throw new SyntaxError(`Not a number: "${text}"`);
    }

    const value = Number.parseFloat(match[1]!);
    if (!Number.isFinite(value)) {
      throw new SyntaxError(`Not a number: "${text}"`);
    }

    return new SvgNumeric(value, brush, UNIT_SUFFIXES[match[2] ?? ''] ?? 'direct');
  }

  /** A colour component in 0..1: `128` is a byte, `50%` is a half. */
  get colorValue(): number {
    if (this.unit === 'percent') {
      return this.value / 100;
    }
    if (this.unit === 'direct') {
      return this.value / 255;
    }
    throw new SyntaxError(`Invalid color value ${this.value} (${this.unit})`);
  }

  /** A length in PDF points. */
  get sizeValue(): number {
    switch (this.unit) {
      case 'percent':
        return this.value / 100;
      case 'direct':
      case 'pixels':
      case 'points':
        return this.value;
      case 'millimeters':
        return this.value * PageUnit.mm;
      case 'centimeters':
        return this.value * PageUnit.cm;
      case 'inch':
        return this.value * PageUnit.inch;
      case 'em': {
        const fontSize = this.brush?.fontSize;
        if (fontSize === null || fontSize === undefined) {
          throw new SyntaxError('An em length needs a font size in scope');
        }
        return this.value * fontSize.sizeValue;
      }
    }
  }
}

/**
 * Upstream's `_transformParameterRegExp`. It matches word characters, dots and
 * hyphens, so a leading `+` is dropped and a unit suffix rides along inside the
 * match — which is what `SvgNumeric.parse` then splits off.
 */
const PARAMETER = /[\w.-]+(px|pt|em|cm|mm|in|%|)/g;

export function splitNumeric(parameters: string, brush: SvgFontSizeContext | null): SvgNumeric[] {
  return [...parameters.matchAll(PARAMETER)].map(match => SvgNumeric.parse(match[0], brush));
}

export function splitDoubles(parameters: string): number[] {
  return [...parameters.matchAll(PARAMETER)].map(match => {
    const value = Number.parseFloat(match[0]);
    if (!Number.isFinite(value)) {
      throw new SyntaxError(`Not a number: "${match[0]}"`);
    }
    return value;
  });
}

export interface GetDoubleOptions {
  readonly namespace?: string;
  readonly defaultValue?: number | null;
}

export function getDouble(
  element: XmlElement,
  name: string,
  { namespace, defaultValue = 0 }: GetDoubleOptions = {}
): number | null {
  const attribute = element.getAttribute(name, namespace);
  if (attribute === null) {
    return defaultValue;
  }

  const value = Number.parseFloat(attribute);
  if (!Number.isFinite(value)) {
    throw new SyntaxError(`Attribute ${name}="${attribute}" is not a number`);
  }
  return value;
}

export interface GetNumericOptions {
  readonly namespace?: string;
  readonly defaultValue?: number | null;
}

export function getNumeric(
  element: XmlElement,
  name: string,
  brush: SvgFontSizeContext | null,
  { namespace, defaultValue = null }: GetNumericOptions = {}
): SvgNumeric | null {
  const attribute = element.getAttribute(name, namespace);
  if (attribute === null) {
    return defaultValue === null ? null : new SvgNumeric(defaultValue, null);
  }
  return SvgNumeric.parse(attribute, brush);
}

const STYLE_DECLARATION = /([\w-]+)\s*:\s*(.*)/;

/**
 * Flatten a `style` attribute into real attributes on the same element, so
 * every later lookup can ignore CSS entirely.
 *
 * This mutates the tree, which is why the XML reader has `setAttribute`.
 * Upstream does the same, and with the same consequence: a declaration in
 * `style` **overwrites** the presentation attribute of the same name, which is
 * what CSS specificity requires.
 */
export function convertStyle(element: XmlElement): void {
  const style = element.getAttribute('style')?.trim();
  if (style === undefined || style === null || style.length === 0) {
    return;
  }

  for (const declaration of style.split(';')) {
    if (declaration.trim().length === 0) {
      continue;
    }
    const match = STYLE_DECLARATION.exec(declaration);
    if (match === null) {
      continue;
    }
    element.setAttribute(match[1]!, match[2]!.trim());
  }
}

export interface SvgParserOptions {
  readonly xml: XmlDocument;

  /**
   * Overrides every colour in the document. Upstream's way of tinting a
   * monochrome icon without editing its markup.
   */
  readonly colorFilter?: Rgb | null;
}

/**
 * The document as a whole: its intrinsic size, its viewBox and the lookup by
 * `id` that `<use>`, `clip-path` and gradient references all need.
 *
 * Landed in phase 2.5 rather than 2.7 as the roadmap had it, because the paint
 * modules could not be written without `findById` and `colorFilter`. The public
 * `SvgImage` driver followed in phase 2.7.
 */
export class SvgParser {
  readonly viewBox: PdfRect;
  readonly width: number | null;
  readonly height: number | null;
  readonly root: XmlElement;
  readonly colorFilter: Rgb | null;

  private constructor(
    width: number | null,
    height: number | null,
    viewBox: PdfRect,
    root: XmlElement,
    colorFilter: Rgb | null
  ) {
    this.width = width;
    this.height = height;
    this.viewBox = viewBox;
    this.root = root;
    this.colorFilter = colorFilter;
  }

  static fromXml({ xml, colorFilter = null }: SvgParserOptions): SvgParser {
    const root = xml.rootElement;
    const viewBoxAttribute = root.getAttribute('viewBox');

    const width = getNumeric(root, 'width', null)?.sizeValue ?? null;
    const height = getNumeric(root, 'height', null)?.sizeValue ?? null;

    // With no viewBox the document's own size is the coordinate system, and
    // 1000 is upstream's stand-in when it states neither.
    const parsed = viewBoxAttribute === null
      ? [0, 0, width ?? 1000, height ?? 1000]
      : splitDoubles(viewBoxAttribute);

    if (parsed.length === 0 || parsed.length > 4) {
      throw new SyntaxError('viewBox must contain 1..4 parameters');
    }

    // A short viewBox is left-padded with zeros, which is upstream's reading of
    // an under-specified attribute rather than the specification's.
    const box = [...new Array<number>(4 - parsed.length).fill(0), ...parsed];

    return new SvgParser(
      width,
      height,
      { x: box[0]!, y: box[1]!, width: box[2]!, height: box[3]! },
      root,
      colorFilter
    );
  }

  /** The first element anywhere in the document carrying `id`, or null. */
  findById(id: string): XmlElement | null {
    for (const element of this.root.descendants) {
      if (element.getAttribute('id') === id) {
        return element;
      }
    }
    return this.root.getAttribute('id') === id ? this.root : null;
  }
}
