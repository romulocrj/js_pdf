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
 * SVG linear and radial paint resolved into PDF shading patterns. Stop alpha
 * uses the same luminosity-mask composition as upstream. Repeat and reflect
 * extend only across the finite painted bounds, keeping allocation independent
 * of raster dimensions and explicitly limiting pathological period counts.
 */

import type { Rgb } from '../pdf/color.ts';
import { PdfCanvas } from '../pdf/graphics.ts';
import {
  identityMatrix,
  invertMatrix,
  multiplyMatrix,
  scaleMatrix,
  transformPoint,
  translationMatrix
} from '../pdf/matrix.ts';
import type { PdfMatrix } from '../pdf/matrix.ts';
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
  private readonly hasVariableOpacity: boolean;

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
    this.hasVariableOpacity = opacityList.length > 1
      && opacityList.some(value => value !== opacityList[0]);
  }

  override get isEmpty(): boolean {
    return this.colors.length === 0;
  }

  override get isNotEmpty(): boolean {
    return !this.isEmpty;
  }

  protected localMatrix(operation: SvgOperation): PdfMatrix {
    let matrix = identityMatrix;
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

  protected patternMatrix(operation: SvgOperation, canvas: PdfCanvas): PdfMatrix {
    return multiplyMatrix(canvas.getTransform(), this.localMatrix(operation));
  }

  protected operationCorners(operation: SvgOperation): readonly { readonly x: number; readonly y: number }[] {
    const box = operation.boundingBox();
    const inverse = invertMatrix(this.localMatrix(operation));
    if (inverse === null) return [];
    return [
      transformPoint(inverse, box.x, box.y),
      transformPoint(inverse, box.x + box.width, box.y),
      transformPoint(inverse, box.x, box.y + box.height),
      transformPoint(inverse, box.x + box.width, box.y + box.height)
    ];
  }

  protected gradientFunction(
    colors: readonly Rgb[],
    start: number,
    end: number
  ) {
    const fn = PdfBaseFunction.colorsAndStops(colors, this.stops);
    return this.spreadMethod === 'pad'
      ? fn
      : PdfBaseFunction.spread(fn, start, end, this.spreadMethod);
  }

  protected abstract buildGradient(
    operation: SvgOperation,
    canvas: PdfCanvas,
    colors?: readonly Rgb[]
  ): PdfShadingPattern;

  private applyOpacityMask(operation: SvgOperation, canvas: PdfCanvas): void {
    const maskCanvas = new PdfCanvas(canvas.pageHeight);
    const colors = this.opacityList.map(value => [value, value, value] as Rgb);
    const existingMask = canvas.getSoftMask();
    if (existingMask !== null) maskCanvas.setSoftMask(existingMask);
    maskCanvas.drawBox(operation.boundingBox());
    maskCanvas.setFillPattern(this.buildGradient(operation, maskCanvas, colors));
    maskCanvas.fillPath();
    canvas.setSoftMask({
      content: maskCanvas.takeOutputBytes(),
      boundingBox: operation.boundingBox(),
      fonts: maskCanvas.fonts,
      graphicStates: maskCanvas.graphicStates,
      patterns: maskCanvas.patterns,
      images: maskCanvas.images
    });
  }

  override setFillColor(operation: SvgOperation, canvas: PdfCanvas): void {
    if (this.isNotEmpty) {
      if (this.hasVariableOpacity) this.applyOpacityMask(operation, canvas);
      canvas.setFillPattern(this.buildGradient(operation, canvas));
    }
  }

  override setStrokeColor(operation: SvgOperation, canvas: PdfCanvas): void {
    if (this.isNotEmpty) {
      if (this.hasVariableOpacity) this.applyOpacityMask(operation, canvas);
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

  protected override buildGradient(
    operation: SvgOperation,
    canvas: PdfCanvas,
    colors: readonly Rgb[] = this.colors
  ): PdfShadingPattern {
    const start = { x: this.x1 ?? 0, y: this.y1 ?? 0 };
    const end = { x: this.x2 ?? 1, y: this.y2 ?? 0 };
    let rangeStart = 0;
    let rangeEnd = 1;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (this.spreadMethod !== 'pad' && lengthSquared > 0) {
      const parameters = this.operationCorners(operation).map(point => (
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
      ));
      if (parameters.length > 0) {
        rangeStart = Math.min(...parameters);
        rangeEnd = Math.max(...parameters);
      }
      if (rangeEnd <= rangeStart) rangeEnd = rangeStart + 1;
    }
    const shadingStart = this.spreadMethod === 'pad'
      ? start
      : { x: start.x + dx * rangeStart, y: start.y + dy * rangeStart };
    const shadingEnd = this.spreadMethod === 'pad'
      ? end
      : { x: start.x + dx * rangeEnd, y: start.y + dy * rangeEnd };
    return new PdfShadingPattern({
      shading: new PdfShading({
        type: 'axial',
        fn: this.gradientFunction(colors, rangeStart, rangeEnd),
        start: shadingStart,
        end: shadingEnd,
        extendStart: this.spreadMethod === 'pad',
        extendEnd: this.spreadMethod === 'pad'
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

  protected override buildGradient(
    operation: SvgOperation,
    canvas: PdfCanvas,
    colors: readonly Rgb[] = this.colors
  ): PdfShadingPattern {
    const cx = this.cx ?? 0.5;
    const cy = this.cy ?? 0.5;
    const fx = this.fx ?? cx;
    const fy = this.fy ?? cy;
    const radius0 = this.fr ?? 0;
    const radius1 = this.r ?? 0.5;
    const dcx = cx - fx;
    const dcy = cy - fy;
    const dr = radius1 - radius0;
    let rangeStart = 0;
    let rangeEnd = 1;

    if (this.spreadMethod !== 'pad' && dr > 0) {
      rangeStart = Math.min(0, -radius0 / dr);
      const corners = this.operationCorners(operation);
      const covers = (parameter: number): boolean => {
        const centerX = fx + dcx * parameter;
        const centerY = fy + dcy * parameter;
        const radius = radius0 + dr * parameter;
        return radius >= 0 && corners.every(point => (
          Math.hypot(point.x - centerX, point.y - centerY) <= radius
        ));
      };
      while (!covers(rangeEnd)) {
        rangeEnd += 1;
        if (rangeEnd - rangeStart > 4096) {
          throw new RangeError('SVG radial gradient spread exceeds 4096 visible periods');
        }
      }
    }

    return new PdfShadingPattern({
      shading: new PdfShading({
        type: 'radial',
        fn: this.gradientFunction(colors, rangeStart, rangeEnd),
        start: { x: fx + dcx * rangeStart, y: fy + dcy * rangeStart },
        end: { x: fx + dcx * rangeEnd, y: fy + dcy * rangeEnd },
        radius0: radius0 + dr * rangeStart,
        radius1: radius0 + dr * rangeEnd,
        extendStart: this.spreadMethod === 'pad',
        extendEnd: this.spreadMethod === 'pad'
      }),
      matrix: this.patternMatrix(operation, canvas)
    });
  }
}
