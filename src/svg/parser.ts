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
 *   - pdf/lib/src/svg/parser.dart
 *
 * How an SVG attribute becomes a number.
 *
 * This is the numeric half of upstream's `parser.dart`, landed in phase 2.4
 * because transforms need it; the `SvgParser` class itself — the document, its
 * viewBox and `findById` — arrives with the rest of the file in 2.7.
 *
 * PORT GAP: `sizeValue` returns `value / 100` for a percentage, which is
 * upstream's behaviour and is wrong in the general case — a percentage is
 * relative to the viewport, or to the diagonal for a length with no axis. It is
 * kept because changing it would silently move every SVG that has one, and
 * because nothing in the port's corpus relies on the correct reading. Fixing it
 * needs the viewport threaded down to every attribute lookup.
 */

import { PageUnit } from '../pdf/page_format.ts';
import type { XmlElement } from './xml.ts';

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
