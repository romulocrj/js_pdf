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
 *   - pdf/lib/src/svg/brush.dart
 *
 * The presentation attributes in force at one element: paint, stroke geometry,
 * font and opacity. Each element merges its own over its parent's, which is how
 * SVG inheritance works without a style engine.
 *
 * Two upstream bugs are fixed here rather than reproduced, because both are
 * plainly typos and both make a correct document render wrong:
 *
 *   - `stroke-linejoin: miter` never matched. Upstream's lookup table spells
 *     the key `'miter '`, with a trailing space, so an element asking for the
 *     default join inherited its parent's instead.
 *   - `mix-blend-mode: color-dodge` and `color-burn` both mapped to the
 *     `color` blend mode.
 *
 * PORT GAP: `mask` is parsed nowhere — a soft mask needs a form XObject, which
 * is phase 4. An element carrying `mask` paints unmasked.
 */

import type { PdfBlendMode } from '../pdf/graphic_state.ts';
import type { PdfLineCap, PdfLineJoin } from '../pdf/graphics.ts';
import { SvgColor } from './color.ts';
import { SvgNumeric, convertStyle, getDouble, getNumeric, splitNumeric } from './parser.ts';
import type { SvgParser } from './parser.ts';
import type { XmlElement } from './xml.ts';

export type SvgTextAnchor = 'start' | 'middle' | 'end';

const BLEND_MODES: Readonly<Record<string, PdfBlendMode>> = Object.freeze({
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'colorDodge',
  'color-burn': 'colorBurn',
  'hard-light': 'hardLight',
  'soft-light': 'softLight',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity'
});

const LINE_CAPS: Readonly<Record<string, PdfLineCap>> = Object.freeze({
  butt: 'butt',
  round: 'round',
  square: 'square'
});

const LINE_JOINS: Readonly<Record<string, PdfLineJoin>> = Object.freeze({
  miter: 'miter',
  bevel: 'bevel',
  round: 'round'
});

const TEXT_ANCHORS: Readonly<Record<string, SvgTextAnchor>> = Object.freeze({
  start: 'start',
  middle: 'middle',
  end: 'end'
});

export interface SvgBrushFields {
  readonly color: SvgColor | null;
  readonly opacity: number | null;
  readonly fill: SvgColor | null;
  readonly fillEvenOdd: boolean | null;
  readonly fillOpacity: number | null;
  readonly stroke: SvgColor | null;
  readonly strokeOpacity: number | null;
  readonly strokeWidth: SvgNumeric | null;
  readonly strokeDashArray: readonly number[] | null;
  readonly strokeDashOffset: number | null;
  readonly strokeLineCap: PdfLineCap | null;
  readonly strokeLineJoin: PdfLineJoin | null;
  readonly strokeMiterLimit: number | null;
  readonly fontSize: SvgNumeric | null;
  readonly fontFamily: string | null;
  readonly fontStyle: string | null;
  readonly fontWeight: string | null;
  readonly textAnchor: SvgTextAnchor | null;
  readonly blendMode: PdfBlendMode | null;
}

export class SvgBrush implements SvgBrushFields {
  readonly color: SvgColor | null;
  readonly opacity: number | null;
  readonly fill: SvgColor | null;
  readonly fillEvenOdd: boolean | null;
  readonly fillOpacity: number | null;
  readonly stroke: SvgColor | null;
  readonly strokeOpacity: number | null;
  readonly strokeWidth: SvgNumeric | null;
  readonly strokeDashArray: readonly number[] | null;
  readonly strokeDashOffset: number | null;
  readonly strokeLineCap: PdfLineCap | null;
  readonly strokeLineJoin: PdfLineJoin | null;
  readonly strokeMiterLimit: number | null;
  readonly fontSize: SvgNumeric | null;
  readonly fontFamily: string | null;
  readonly fontStyle: string | null;
  readonly fontWeight: string | null;
  readonly textAnchor: SvgTextAnchor | null;
  readonly blendMode: PdfBlendMode | null;

  constructor(fields: SvgBrushFields) {
    this.color = fields.color;
    this.opacity = fields.opacity;
    this.fill = fields.fill;
    this.fillEvenOdd = fields.fillEvenOdd;
    this.fillOpacity = fields.fillOpacity;
    this.stroke = fields.stroke;
    this.strokeOpacity = fields.strokeOpacity;
    this.strokeWidth = fields.strokeWidth;
    this.strokeDashArray = fields.strokeDashArray;
    this.strokeDashOffset = fields.strokeDashOffset;
    this.strokeLineCap = fields.strokeLineCap;
    this.strokeLineJoin = fields.strokeLineJoin;
    this.strokeMiterLimit = fields.strokeMiterLimit;
    this.fontSize = fields.fontSize;
    this.fontFamily = fields.fontFamily;
    this.fontStyle = fields.fontStyle;
    this.fontWeight = fields.fontWeight;
    this.textAnchor = fields.textAnchor;
    this.blendMode = fields.blendMode;
  }

  /** What an SVG paints with before any attribute is read. */
  static readonly defaultContext = new SvgBrush({
    color: SvgColor.defaultColor,
    opacity: 1,
    blendMode: null,
    fillOpacity: 1,
    strokeOpacity: 1,
    fill: SvgColor.defaultColor,
    fillEvenOdd: false,
    stroke: SvgColor.none,
    strokeLineCap: 'butt',
    strokeLineJoin: 'miter',
    strokeMiterLimit: 4,
    strokeWidth: new SvgNumeric(1, null, 'pixels'),
    strokeDashArray: [],
    strokeDashOffset: 0,
    fontSize: new SvgNumeric(16, null),
    fontFamily: 'sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAnchor: 'start'
  });

  /**
   * `other` over `this`, following SVG's inheritance rules.
   *
   * `opacity` and `blendMode` are the two that do **not** inherit: an element
   * that states neither is fully opaque and blends normally, whatever its
   * parent does. That is the specification, and it is why they read
   * `other.opacity ?? 1` rather than `?? this.opacity`.
   */
  merge(other: SvgBrush | null): SvgBrush {
    if (other === null) {
      return this;
    }

    let fill = other.fill ?? this.fill;
    if (fill?.inherit === true && this.fill !== null && other.fill !== null) {
      fill = this.fill.merge(other.fill);
    }

    let stroke = other.stroke ?? this.stroke;
    if (stroke?.inherit === true && this.stroke !== null && other.stroke !== null) {
      stroke = this.stroke.merge(other.stroke);
    }

    return new SvgBrush({
      color: other.color?.inherit === true ? this.color : other.color ?? this.color,
      opacity: other.opacity ?? 1,
      blendMode: other.blendMode,
      fillOpacity: other.fillOpacity ?? this.fillOpacity,
      strokeOpacity: other.strokeOpacity ?? this.strokeOpacity,
      fill,
      fillEvenOdd: other.fillEvenOdd ?? this.fillEvenOdd,
      stroke,
      strokeWidth: other.strokeWidth ?? this.strokeWidth,
      strokeDashArray: other.strokeDashArray ?? this.strokeDashArray,
      strokeDashOffset: other.strokeDashOffset ?? this.strokeDashOffset,
      fontSize: other.fontSize ?? this.fontSize,
      fontFamily: other.fontFamily ?? this.fontFamily,
      fontStyle: other.fontStyle ?? this.fontStyle,
      fontWeight: other.fontWeight ?? this.fontWeight,
      textAnchor: other.textAnchor ?? this.textAnchor,
      strokeLineCap: other.strokeLineCap ?? this.strokeLineCap,
      strokeLineJoin: other.strokeLineJoin ?? this.strokeLineJoin,
      strokeMiterLimit: other.strokeMiterLimit ?? this.strokeMiterLimit
    });
  }

  copyWith(fields: Partial<SvgBrushFields>): SvgBrush {
    return new SvgBrush({
      color: fields.color ?? this.color,
      opacity: fields.opacity ?? this.opacity,
      fill: fields.fill ?? this.fill,
      fillEvenOdd: fields.fillEvenOdd ?? this.fillEvenOdd,
      fillOpacity: fields.fillOpacity ?? this.fillOpacity,
      stroke: fields.stroke ?? this.stroke,
      strokeOpacity: fields.strokeOpacity ?? this.strokeOpacity,
      strokeWidth: fields.strokeWidth ?? this.strokeWidth,
      strokeDashArray: fields.strokeDashArray ?? this.strokeDashArray,
      strokeDashOffset: fields.strokeDashOffset ?? this.strokeDashOffset,
      strokeLineCap: fields.strokeLineCap ?? this.strokeLineCap,
      strokeLineJoin: fields.strokeLineJoin ?? this.strokeLineJoin,
      strokeMiterLimit: fields.strokeMiterLimit ?? this.strokeMiterLimit,
      fontSize: fields.fontSize ?? this.fontSize,
      fontFamily: fields.fontFamily ?? this.fontFamily,
      fontStyle: fields.fontStyle ?? this.fontStyle,
      fontWeight: fields.fontWeight ?? this.fontWeight,
      textAnchor: fields.textAnchor ?? this.textAnchor,
      blendMode: fields.blendMode ?? this.blendMode
    });
  }

  /**
   * Read `element`'s presentation attributes over `parent`'s.
   *
   * `convertStyle` runs first and **mutates the element**, flattening its
   * `style` attribute into real attributes so nothing below has to know CSS.
   */
  static fromXml(element: XmlElement, parent: SvgBrush, parser: SvgParser): SvgBrush {
    convertStyle(element);

    const strokeDashArray = element.getAttribute('stroke-dasharray');
    const fillRule = element.getAttribute('fill-rule');
    const strokeLineCap = element.getAttribute('stroke-linecap');
    const strokeLineJoin = element.getAttribute('stroke-linejoin');
    const blendMode = element.getAttribute('mix-blend-mode');

    const color = SvgColor.fromXml(element.getAttribute('color'), parser, parent.color ?? SvgColor.defaultColor);
    const currentColor = color.inherit ? parent.color ?? SvgColor.defaultColor : color;

    return parent.merge(new SvgBrush({
      color,
      opacity: getDouble(element, 'opacity', { defaultValue: null }),
      blendMode: blendMode === null ? null : BLEND_MODES[blendMode] ?? null,
      fillOpacity: getDouble(element, 'fill-opacity', { defaultValue: null }),
      strokeOpacity: getDouble(element, 'stroke-opacity', { defaultValue: null }),
      strokeLineCap: strokeLineCap === null ? null : LINE_CAPS[strokeLineCap] ?? null,
      strokeLineJoin: strokeLineJoin === null ? null : LINE_JOINS[strokeLineJoin] ?? null,
      strokeMiterLimit: getDouble(element, 'stroke-miterlimit', { defaultValue: null }),
      fill: SvgColor.fromXml(element.getAttribute('fill'), parser, currentColor),
      fillEvenOdd: fillRule === null ? null : fillRule === 'evenodd',
      stroke: SvgColor.fromXml(element.getAttribute('stroke'), parser, currentColor),
      strokeWidth: getNumeric(element, 'stroke-width', parent),
      strokeDashArray: strokeDashArray === null
        ? null
        : (strokeDashArray === 'none' ? [] : splitNumeric(strokeDashArray, parent).map(n => n.value)),
      strokeDashOffset: getNumeric(element, 'stroke-dashoffset', parent)?.sizeValue ?? null,
      fontSize: getNumeric(element, 'font-size', parent),
      fontFamily: element.getAttribute('font-family'),
      fontStyle: element.getAttribute('font-style'),
      fontWeight: element.getAttribute('font-weight'),
      textAnchor: TEXT_ANCHORS[element.getAttribute('text-anchor') ?? ''] ?? null
    }));
  }
}
