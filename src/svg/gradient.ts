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
 *   - pdf/lib/src/svg/gradient.dart
 *
 * SVG linear and radial paint resolved into PDF shading patterns.
 *
 * PORT GAP: varying stop opacity still needs a gradient-specific alpha ramp
 * composed with the luminosity-mask primitive. Uniform stop opacity is applied
 * normally. Repeat and reflect spread modes currently extend the edge colour,
 * matching upstream's effective output; true repeated shading needs a tiling
 * pattern.
 */

import type { Rgb } from '../pdf/color.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import { multiplyMatrix, scaleMatrix, translationMatrix } from '../pdf/matrix.ts';
import { PdfBaseFunction } from '../pdf/obj/function.ts';
import { PdfShadingPattern } from '../pdf/obj/pattern.ts';
import { PdfShading } from '../pdf/obj/shading.ts';
import { SvgColor } from './color.ts';
import type { SvgOperation } from './operation.ts';
import { convertStyle, getDouble, getNumeric } from './parser.ts';
import type { SvgParser } from './parser.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';

export type SvgGradientUnits = 'objectBoundingBox' | 'userSpaceOnUse';
export type SvgSpreadMethod = 'pad' | 'reflect' | 'repeat';

interface GradientStops {
  readonly colors: readonly Rgb[];
  readonly stops: readonly number[];
  readonly opacities: readonly number[];
}

function readStops(element: XmlElement, parser: SvgParser): GradientStops {
  const colors: Rgb[] = [];
  const stops: number[] = [];
  const opacities: number[] = [];
  let previous = 0;

  for (const child of element.elements) {
    if (child.name.local !== 'stop') {
      continue;
    }
    convertStyle(child);
    const color = SvgColor.fromXml(child.getAttribute('stop-color') ?? 'black', parser);
    const offset = Math.min(1, Math.max(
      previous,
      getNumeric(child, 'offset', null, { defaultValue: 0 })!.sizeValue
    ));
    previous = offset;
    colors.push(color.color ?? [0, 0, 0]);
    stops.push(offset);
    opacities.push(
      Math.min(1, Math.max(0, getDouble(child, 'stop-opacity', { defaultValue: 1 }) ?? 1))
      * color.opacity
    );
  }

  return { colors, stops, opacities };
}

function hrefElement(element: XmlElement, parser: SvgParser): XmlElement | null {
  const xlink = ['http:', '', 'www.w3.org', '1999', 'xlink'].join('/');
  const href = element.getAttribute('href') ?? element.getAttribute('href', xlink);
  return href?.startsWith('#') === true ? parser.findById(href.slice(1)) : null;
}

export abstract class SvgGradient extends SvgColor {
  readonly gradientUnits: SvgGradientUnits | null;
  readonly transform: SvgTransform;
  readonly colors: readonly Rgb[];
  readonly stops: readonly number[];
  readonly opacityList: readonly number[];
  readonly spreadMethod: SvgSpreadMethod;
  protected readonly hasSpreadMethod: boolean;

  constructor(
    gradientUnits: SvgGradientUnits | null,
    transform: SvgTransform,
    colors: readonly Rgb[],
    stops: readonly number[],
    opacityList: readonly number[],
    spreadMethod: SvgSpreadMethod | null
  ) {
    const uniformOpacity = opacityList.length > 0 && opacityList.every(value => value === opacityList[0])
      ? opacityList[0]!
      : 1;
    super(null, false, uniformOpacity);
    this.gradientUnits = gradientUnits;
    this.transform = transform;
    this.colors = colors;
    this.stops = stops;
    this.opacityList = opacityList;
    this.spreadMethod = spreadMethod ?? 'pad';
    this.hasSpreadMethod = spreadMethod !== null;
  }

  override get isEmpty(): boolean {
    return this.colors.length === 0;
  }

  override get isNotEmpty(): boolean {
    return !this.isEmpty;
  }

  protected patternMatrix(operation: SvgOperation, canvas: PdfCanvas) {
    let matrix = canvas.getTransform();
    if (this.gradientUnits !== 'userSpaceOnUse') {
      const box = operation.boundingBox();
      matrix = multiplyMatrix(matrix, translationMatrix(box.x, box.y));
      matrix = multiplyMatrix(matrix, scaleMatrix(box.width, box.height));
    }
    if (this.transform.matrix !== null) {
      matrix = multiplyMatrix(matrix, this.transform.matrix);
    }
    return matrix;
  }

  protected abstract buildGradient(operation: SvgOperation, canvas: PdfCanvas): PdfShadingPattern;

  override setFillColor(operation: SvgOperation, canvas: PdfCanvas): void {
    if (this.isNotEmpty) {
      canvas.setFillPattern(this.buildGradient(operation, canvas));
    }
  }

  override setStrokeColor(operation: SvgOperation, canvas: PdfCanvas): void {
    if (this.isNotEmpty) {
      canvas.setStrokePattern(this.buildGradient(operation, canvas));
    }
  }

  static fromReference(value: string, parser: SvgParser): SvgGradient | null {
    const match = /^url\(\s*#([^)\s]+)\s*\)$/.exec(value.trim());
    if (match === null) {
      return null;
    }
    const element = parser.findById(match[1]!);
    if (element?.name.local === 'linearGradient') {
      return SvgLinearGradient.fromElement(element, parser);
    }
    if (element?.name.local === 'radialGradient') {
      return SvgRadialGradient.fromElement(element, parser);
    }
    return null;
  }
}

export class SvgLinearGradient extends SvgGradient {
  readonly x1: number | null;
  readonly y1: number | null;
  readonly x2: number | null;
  readonly y2: number | null;

  constructor(
    gradientUnits: SvgGradientUnits | null,
    x1: number | null,
    y1: number | null,
    x2: number | null,
    y2: number | null,
    transform: SvgTransform,
    colors: readonly Rgb[],
    stops: readonly number[],
    opacities: readonly number[],
    spreadMethod: SvgSpreadMethod | null
  ) {
    super(gradientUnits, transform, colors, stops, opacities, spreadMethod);
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
  }

  static fromElement(
    element: XmlElement,
    parser: SvgParser,
    seen: readonly string[] = []
  ): SvgLinearGradient {
    const id = element.getAttribute('id');
    if (id !== null && seen.includes(id)) {
      throw new SyntaxError(`Circular gradient reference: ${id}`);
    }
    const nextSeen = id === null ? seen : [...seen, id];
    const stopData = readStops(element, parser);
    const local = new SvgLinearGradient(
      SvgLinearGradient.units(element),
      getNumeric(element, 'x1', null)?.sizeValue ?? null,
      getNumeric(element, 'y1', null)?.sizeValue ?? null,
      getNumeric(element, 'x2', null)?.sizeValue ?? null,
      getNumeric(element, 'y2', null)?.sizeValue ?? null,
      SvgTransform.fromString(element.getAttribute('gradientTransform')),
      stopData.colors,
      stopData.stops,
      stopData.opacities,
      SvgLinearGradient.spread(element)
    );
    const inherited = hrefElement(element, parser);
    return inherited?.name.local === 'linearGradient'
      ? SvgLinearGradient.fromElement(inherited, parser, nextSeen).mergeWith(local)
      : local;
  }

  private static units(element: XmlElement): SvgGradientUnits | null {
    const value = element.getAttribute('gradientUnits');
    return value === 'userSpaceOnUse' || value === 'objectBoundingBox' ? value : null;
  }

  private static spread(element: XmlElement): SvgSpreadMethod | null {
    const value = element.getAttribute('spreadMethod');
    return value === 'pad' || value === 'reflect' || value === 'repeat' ? value : null;
  }

  mergeWith(other: SvgLinearGradient): SvgLinearGradient {
    return new SvgLinearGradient(
      other.gradientUnits ?? this.gradientUnits,
      other.x1 ?? this.x1,
      other.y1 ?? this.y1,
      other.x2 ?? this.x2,
      other.y2 ?? this.y2,
      other.transform.isNotEmpty ? other.transform : this.transform,
      other.colors.length > 0 ? other.colors : this.colors,
      other.stops.length > 0 ? other.stops : this.stops,
      other.opacityList.length > 0 ? other.opacityList : this.opacityList,
      other.hasSpreadMethod ? other.spreadMethod : this.spreadMethod
    );
  }

  protected override buildGradient(operation: SvgOperation, canvas: PdfCanvas): PdfShadingPattern {
    return new PdfShadingPattern({
      shading: new PdfShading({
        type: 'axial',
        fn: PdfBaseFunction.colorsAndStops(this.colors, this.stops),
        start: { x: this.x1 ?? 0, y: this.y1 ?? 0 },
        end: { x: this.x2 ?? 1, y: this.y2 ?? 0 },
        extendStart: true,
        extendEnd: true
      }),
      matrix: this.patternMatrix(operation, canvas)
    });
  }
}

export class SvgRadialGradient extends SvgGradient {
  readonly r: number | null;
  readonly cx: number | null;
  readonly cy: number | null;
  readonly fr: number | null;
  readonly fx: number | null;
  readonly fy: number | null;

  constructor(
    gradientUnits: SvgGradientUnits | null,
    r: number | null,
    cx: number | null,
    cy: number | null,
    fr: number | null,
    fx: number | null,
    fy: number | null,
    transform: SvgTransform,
    colors: readonly Rgb[],
    stops: readonly number[],
    opacities: readonly number[],
    spreadMethod: SvgSpreadMethod | null
  ) {
    super(gradientUnits, transform, colors, stops, opacities, spreadMethod);
    this.r = r;
    this.cx = cx;
    this.cy = cy;
    this.fr = fr;
    this.fx = fx;
    this.fy = fy;
  }

  static fromElement(
    element: XmlElement,
    parser: SvgParser,
    seen: readonly string[] = []
  ): SvgRadialGradient {
    const id = element.getAttribute('id');
    if (id !== null && seen.includes(id)) {
      throw new SyntaxError(`Circular gradient reference: ${id}`);
    }
    const nextSeen = id === null ? seen : [...seen, id];
    const stopData = readStops(element, parser);
    const unitsValue = element.getAttribute('gradientUnits');
    const spreadValue = element.getAttribute('spreadMethod');
    const local = new SvgRadialGradient(
      unitsValue === 'userSpaceOnUse' || unitsValue === 'objectBoundingBox' ? unitsValue : null,
      getNumeric(element, 'r', null)?.sizeValue ?? null,
      getNumeric(element, 'cx', null)?.sizeValue ?? null,
      getNumeric(element, 'cy', null)?.sizeValue ?? null,
      getNumeric(element, 'fr', null)?.sizeValue ?? null,
      getNumeric(element, 'fx', null)?.sizeValue ?? null,
      getNumeric(element, 'fy', null)?.sizeValue ?? null,
      SvgTransform.fromString(element.getAttribute('gradientTransform')),
      stopData.colors,
      stopData.stops,
      stopData.opacities,
      spreadValue === 'pad' || spreadValue === 'reflect' || spreadValue === 'repeat'
        ? spreadValue
        : null
    );
    const inherited = hrefElement(element, parser);
    return inherited?.name.local === 'radialGradient'
      ? SvgRadialGradient.fromElement(inherited, parser, nextSeen).mergeWith(local)
      : local;
  }

  mergeWith(other: SvgRadialGradient): SvgRadialGradient {
    return new SvgRadialGradient(
      other.gradientUnits ?? this.gradientUnits,
      other.r ?? this.r,
      other.cx ?? this.cx,
      other.cy ?? this.cy,
      other.fr ?? this.fr,
      other.fx ?? this.fx,
      other.fy ?? this.fy,
      other.transform.isNotEmpty ? other.transform : this.transform,
      other.colors.length > 0 ? other.colors : this.colors,
      other.stops.length > 0 ? other.stops : this.stops,
      other.opacityList.length > 0 ? other.opacityList : this.opacityList,
      other.hasSpreadMethod ? other.spreadMethod : this.spreadMethod
    );
  }

  protected override buildGradient(operation: SvgOperation, canvas: PdfCanvas): PdfShadingPattern {
    const cx = this.cx ?? 0.5;
    const cy = this.cy ?? 0.5;
    return new PdfShadingPattern({
      shading: new PdfShading({
        type: 'radial',
        fn: PdfBaseFunction.colorsAndStops(this.colors, this.stops),
        start: { x: this.fx ?? cx, y: this.fy ?? cy },
        end: { x: cx, y: cy },
        radius0: this.fr ?? 0,
        radius1: this.r ?? 0.5,
        extendStart: true,
        extendEnd: true
      }),
      matrix: this.patternMatrix(operation, canvas)
    });
  }
}
