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
 *   - pdf/lib/src/pdf/graphics.dart
 *   - pdf/lib/src/pdf/graphic_state.dart
 *
 * Two coordinate systems meet in this file, and mixing them is the easiest bug
 * to write here:
 *
 *   - The **path API** — `moveTo`, `lineTo`, `curveTo`, `drawRect`,
 *     `drawEllipse`, `setTransform` and everything else added in phase 2.1 —
 *     takes PDF user space: y grows *upward* from the bottom of the page. These
 *     are direct ports of upstream and the numbers reach the content stream
 *     unchanged, which is what makes an upstream snippet translate literally and
 *     what lets a CTM compose the way SVG expects.
 *   - The **shape helpers** — `fillRect`, `strokeRect`, `line`, `circle`,
 *     `text` — take the widget layer's top-left, y-down coordinates and flip
 *     them. They predate the path API and are what the widgets call today.
 *
 * A widget reaching for the path API converts with `toPdfY`, and a widget
 * setting a transform conjugates it with `flipMatrix` from `matrix.ts`.
 *
 * PORT GAP: no direct shading operator. SVG `drawShape` lives in `svg/path.ts`
 * to preserve the one-way import direction.
 */

import { colorOperator } from './color.ts';
import type { ColorInput } from './color.ts';
import type { PdfFont } from './font/font.ts';
import { defaultPdfFont } from './font/type1_fonts.ts';
import { PdfDict } from './format/dict.ts';
import { formatNumber } from './format/num.ts';
import type { PdfGraphicState } from './graphic_state.ts';
import type { PdfShadingPattern } from './obj/pattern.ts';
import type { PdfImage } from './obj/image.ts';
import type { PdfLinkAnnotation } from './obj/annotation.ts';
import { identityMatrix, multiplyMatrix, transformPoint } from './matrix.ts';
import type { PdfMatrix } from './matrix.ts';
import type { PdfRect } from './rect.ts';

/**
 * What `PdfCanvas.text` needs to write one run of text. Named for the canvas
 * rather than called `TextStyle`, which as of phase 1.4 is the widget-level
 * value type in `widgets/text_style.ts`; this is its resolved, drawable form.
 */
export interface CanvasTextStyle {
  readonly fontSize: number;
  readonly color: ColorInput;
  readonly font?: PdfFont;

  /** `Tc`, extra space per glyph. Omitted from the output when zero. */
  readonly letterSpacing?: number;

  /**
   * `Tw`, extra space per space character. Omitted when zero.
   *
   * PORT GAP: `Tw` applies to single-byte code 32 only, so a reader ignores it
   * for the two-byte CIDs an embedded TrueType font emits. Word spacing has no
   * effect on TTF text until the port measures and inserts the space itself.
   */
  readonly wordSpacing?: number;
}

export interface CircleOptions {
  readonly fill?: ColorInput | null;
  readonly stroke?: ColorInput | null;
  readonly lineWidth?: number;
}

/**
 * The shape drawn at the ends of an open subpath. Upstream is an `enum` whose
 * `index` it writes; an `enum` is not erasable TypeScript, so this is a string
 * union and the operand is looked up.
 */
export type PdfLineCap = 'butt' | 'round' | 'square';

/** The shape drawn where two segments meet. */
export type PdfLineJoin = 'miter' | 'round' | 'bevel';

const LINE_CAP_OPERAND: Readonly<Record<PdfLineCap, number>> = Object.freeze({
  butt: 0,
  round: 1,
  square: 2
});

const LINE_JOIN_OPERAND: Readonly<Record<PdfLineJoin, number>> = Object.freeze({
  miter: 0,
  round: 1,
  bevel: 2
});

/** The ellipse four-spline constant, upstream's `_m4`. */
const M4 = 0.551784;

function operands(values: readonly number[]): string {
  return values.map(formatNumber).join(' ');
}

export interface FillOptions {
  /** Even-odd rather than the nonzero winding rule: `f*` instead of `f`. */
  readonly evenOdd?: boolean;
}

export interface StrokeOptions {
  /** Close the subpath before stroking: `s` instead of `S`. */
  readonly close?: boolean;
}

export interface FillAndStrokeOptions extends FillOptions, StrokeOptions {}

export interface ClipOptions extends FillOptions {
  /**
   * Emit the `n` that ends the path. Upstream's default; pass `false` to paint
   * the same path as well as clip with it.
   */
  readonly end?: boolean;
}

export interface BezierArcOptions {
  readonly large?: boolean;
  readonly sweep?: boolean;
  /** X-axis rotation, in radians. */
  readonly phi?: number;
}

/**
 * Content-stream builder for one page.
 *
 * Like upstream `PdfGraphics`, operators are appended to a buffer and never
 * re-read. Unlike upstream, the buffer is a list of lines rather than a byte
 * stream, because the port assembles the whole content stream as a string
 * before any document exists.
 */
export class PdfCanvas {
  readonly pageHeight: number;
  private readonly commands: string[] = [];
  private readonly fontNames = new Map<PdfFont, string>();
  private readonly stateNames = new Map<string, string>();
  private readonly stateDicts = new Map<string, PdfDict>();
  private readonly patternNames = new Map<string, string>();
  private readonly patternDicts = new Map<string, PdfDict>();
  private readonly imageNames = new Map<PdfImage, string>();
  private readonly linkAnnotations: PdfLinkAnnotation[] = [];

  /**
   * The current transformation matrix, tracked so a widget can ask what space
   * it is drawing in. `q`/`Q` save and restore it, as they do in the reader.
   */
  private currentTransform: PdfMatrix = identityMatrix;
  private readonly transformStack: PdfMatrix[] = [];
  private currentLetterSpacing = 0;
  private currentWordSpacing = 0;
  private readonly textSpacingStack: Array<readonly [number, number]> = [];
  private textSpacingDirty = false;

  constructor(pageHeight: number) {
    this.pageHeight = pageHeight;
  }

  push(command: string): void {
    this.commands.push(command);
  }

  /** Widget-space (top-left, y-down) to PDF user space. */
  toPdfY(top: number): number {
    return this.pageHeight - top;
  }

  /** A widget-space point after the canvas transformation currently in force. */
  transformWidgetPoint(x: number, top: number): { readonly x: number; readonly y: number } {
    return transformPoint(this.currentTransform, x, this.toPdfY(top));
  }

  /**
   * Register `font` on this page and return the name a `Tf` operator should
   * use. Names are allocated in first-use order — `/F1`, `/F2`, … — and repeat
   * for the same font, so a page's `/Font` dictionary has one entry per font.
   *
   * Upstream derives the name from the font object's serial number instead
   * (`/F$objser`), which it can do because its `PdfFont` is an indirect object
   * from the moment it is created. Here a page is rendered to operators before
   * any document exists, so the name has to be page-local; `PdfDocument.addPage`
   * is what binds it to the font object. Consequence: two pages using the same
   * font both call it `/F1` and share one font object.
   */
  addFont(font: PdfFont): string {
    const existing = this.fontNames.get(font);
    if (existing !== undefined) {
      return existing;
    }

    const name = `/F${this.fontNames.size + 1}`;
    this.fontNames.set(font, name);
    return name;
  }

  /** The fonts this page drew with, mapped to the names it wrote for them. */
  get fonts(): ReadonlyMap<PdfFont, string> {
    return this.fontNames;
  }

  /** The `/ExtGState` entries this page selected, by the name it wrote. */
  get graphicStates(): ReadonlyMap<string, PdfDict> {
    return this.stateDicts;
  }

  /** The `/Pattern` entries this page selected, by content-stream name. */
  get patterns(): ReadonlyMap<string, PdfDict> {
    return this.patternDicts;
  }

  /** The images this page drew with, mapped to page-local `/I…` names. */
  get images(): ReadonlyMap<PdfImage, string> {
    return this.imageNames;
  }

  /** Clickable rectangles registered while this page was painted. */
  get annotations(): readonly PdfLinkAnnotation[] {
    return this.linkAnnotations;
  }

  addUrlLink(destination: string, x: number, top: number, width: number, height: number): void {
    this.addLink('url', destination, x, top, width, height);
  }

  addNamedLink(destination: string, x: number, top: number, width: number, height: number): void {
    this.addLink('destination', destination, x, top, width, height);
  }

  private addLink(
    kind: PdfLinkAnnotation['kind'],
    destination: string,
    x: number,
    top: number,
    width: number,
    height: number
  ): void {
    if (width <= 0 || height <= 0) return;
    const points = [
      this.transformWidgetPoint(x, top),
      this.transformWidgetPoint(x + width, top),
      this.transformWidgetPoint(x, top + height),
      this.transformWidgetPoint(x + width, top + height)
    ];
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    this.linkAnnotations.push({
      kind,
      destination,
      rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    });
  }

  private addImage(image: PdfImage): string {
    const existing = this.imageNames.get(image);
    if (existing !== undefined) return existing;
    const name = `/I${this.imageNames.size + 1}`;
    this.imageNames.set(image, name);
    return name;
  }

  // ---------------------------------------------------------------- context

  /**
   * `q`. Upstream calls this `saveContext`; `save` is kept as the name the
   * port's own widgets have used since before the graphics context existed.
   */
  saveContext(): void {
    this.push('q');
    this.transformStack.push(this.currentTransform);
    this.textSpacingStack.push([this.currentLetterSpacing, this.currentWordSpacing]);
  }

  /** `Q`, restoring the CTM this canvas last saved. A no-op if nothing was saved. */
  restoreContext(): void {
    const restored = this.transformStack.pop();
    const spacing = this.textSpacingStack.pop();
    if (restored === undefined) {
      return;
    }
    this.push('Q');
    this.currentTransform = restored;
    if (spacing !== undefined) {
      this.currentLetterSpacing = spacing[0];
      this.currentWordSpacing = spacing[1];
    }
  }

  save(): void {
    this.saveContext();
  }

  restore(): void {
    this.restoreContext();
  }

  /** `cm`, post-multiplied onto the current transform exactly as the reader does. */
  setTransform(matrix: PdfMatrix): void {
    this.push(`${operands(matrix)} cm`);
    this.currentTransform = multiplyMatrix(this.currentTransform, matrix);
  }

  getTransform(): PdfMatrix {
    return this.currentTransform;
  }

  /**
   * `gs`, selecting an `/ExtGState`. States with equal values share one name,
   * so a page that draws fifty half-transparent boxes writes one dictionary.
   */
  setGraphicState(state: PdfGraphicState): string | null {
    if (state.isEmpty) {
      return null;
    }

    const existing = this.stateNames.get(state.key);
    if (existing !== undefined) {
      this.push(`${existing} gs`);
      return existing;
    }

    const name = `/g${this.stateDicts.size + 1}`;
    this.stateNames.set(state.key, name);
    this.stateDicts.set(name, state.output());
    this.push(`${name} gs`);
    return name;
  }

  private addPattern(pattern: PdfShadingPattern): string {
    const existing = this.patternNames.get(pattern.key);
    if (existing !== undefined) {
      return existing;
    }

    const name = `/p${this.patternDicts.size + 1}`;
    this.patternNames.set(pattern.key, name);
    this.patternDicts.set(name, pattern.output());
    return name;
  }

  setFillPattern(pattern: PdfShadingPattern): string {
    const name = this.addPattern(pattern);
    this.push(`/Pattern cs ${name} scn`);
    return name;
  }

  setStrokePattern(pattern: PdfShadingPattern): string {
    const name = this.addPattern(pattern);
    this.push(`/Pattern CS ${name} SCN`);
    return name;
  }

  /** Draw an image in PDF user space, applying its stored EXIF-style orientation. */
  drawImage(image: PdfImage, x: number, y: number, width = image.width, height?: number): void {
    const resolvedHeight = height ?? image.height * width / image.width;
    const name = this.addImage(image);
    let matrix: PdfMatrix;
    switch (image.orientation) {
      case 'topRight':
        matrix = [-width, 0, 0, resolvedHeight, width + x, y];
        break;
      case 'bottomRight':
        matrix = [-width, 0, 0, -resolvedHeight, width + x, resolvedHeight + y];
        break;
      case 'bottomLeft':
        matrix = [width, 0, 0, -resolvedHeight, x, resolvedHeight + y];
        break;
      case 'leftTop':
        matrix = [0, -resolvedHeight, -width, 0, width + x, resolvedHeight + y];
        break;
      case 'rightTop':
        matrix = [0, -resolvedHeight, width, 0, x, resolvedHeight + y];
        break;
      case 'rightBottom':
        matrix = [0, resolvedHeight, width, 0, x, y];
        break;
      case 'leftBottom':
        matrix = [0, resolvedHeight, -width, 0, width + x, y];
        break;
      default:
        matrix = [width, 0, 0, resolvedHeight, x, y];
        break;
    }
    this.push('q');
    this.push(`${operands(matrix)} cm`);
    this.push(`${name} Do`);
    this.push('Q');
  }

  // ------------------------------------------------------------ path building

  moveTo(x: number, y: number): void {
    this.push(`${operands([x, y])} m`);
  }

  lineTo(x: number, y: number): void {
    this.push(`${operands([x, y])} l`);
  }

  /**
   * A cubic Bézier to `(x3, y3)`, with `(x1, y1)` and `(x2, y2)` as the control
   * points at the start and the end.
   */
  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    this.push(`${operands([x1, y1, x2, y2, x3, y3])} c`);
  }

  closePath(): void {
    this.push('h');
  }

  drawLine(x1: number, y1: number, x2: number, y2: number): void {
    this.moveTo(x1, y1);
    this.lineTo(x2, y2);
  }

  drawRect(x: number, y: number, width: number, height: number): void {
    this.push(`${operands([x, y, width, height])} re`);
  }

  drawBox(box: PdfRect): void {
    this.drawRect(box.x, box.y, box.width, box.height);
  }

  /** A rounded rectangle with horizontal radius `rh` and vertical radius `rv`. */
  drawRRect(x: number, y: number, width: number, height: number, rv: number, rh: number): void {
    this.moveTo(x, y + rv);
    this.curveTo(x, y - M4 * rv + rv, x - M4 * rh + rh, y, x + rh, y);
    this.lineTo(x + width - rh, y);
    this.curveTo(x + M4 * rh + width - rh, y, x + width, y - M4 * rv + rv, x + width, y + rv);
    this.lineTo(x + width, y + height - rv);
    this.curveTo(
      x + width,
      y + M4 * rv + height - rv,
      x + M4 * rh + width - rh,
      y + height,
      x + width - rh,
      y + height
    );
    this.lineTo(x + rh, y + height);
    this.curveTo(x - M4 * rh + rh, y + height, x, y + M4 * rv + height - rv, x, y + height - rv);
    this.lineTo(x, y + rv);
  }

  /** Pass `clockwise: false` to wind the other way, which cuts a hole in a fill. */
  drawEllipse(x: number, y: number, r1: number, r2: number, clockwise = true): void {
    this.moveTo(x, y - r2);
    if (clockwise) {
      this.curveTo(x + M4 * r1, y - r2, x + r1, y - M4 * r2, x + r1, y);
      this.curveTo(x + r1, y + M4 * r2, x + M4 * r1, y + r2, x, y + r2);
      this.curveTo(x - M4 * r1, y + r2, x - r1, y + M4 * r2, x - r1, y);
      this.curveTo(x - r1, y - M4 * r2, x - M4 * r1, y - r2, x, y - r2);
    } else {
      this.curveTo(x - M4 * r1, y - r2, x - r1, y - M4 * r2, x - r1, y);
      this.curveTo(x - r1, y + M4 * r2, x - M4 * r1, y + r2, x, y + r2);
      this.curveTo(x + M4 * r1, y + r2, x + r1, y + M4 * r2, x + r1, y);
      this.curveTo(x + r1, y - M4 * r2, x + M4 * r1, y - r2, x, y - r2);
    }
  }

  /**
   * An elliptical arc from the current point to `(x2, y2)` with radii
   * `(rx, ry)`, converted to cubic Béziers. This is SVG's `A` command, and the
   * centre is derived from the endpoints per the SVG implementation notes.
   */
  bezierArc(
    x1: number,
    y1: number,
    rx: number,
    ry: number,
    x2: number,
    y2: number,
    { large = false, sweep = false, phi = 0 }: BezierArcOptions = {}
  ): void {
    if (x1 === x2 && y1 === y2) {
      // Identical endpoints: the SVG spec says to omit the segment entirely.
      return;
    }

    if (Math.abs(rx) <= 1e-10 || Math.abs(ry) <= 1e-10) {
      this.lineTo(x2, y2);
      return;
    }

    if (phi !== 0) {
      // The centre-parameter form cannot express a rotated ellipse, so move the
      // start point to the origin, undo the rotation, and arc there instead.
      const dx = x2 - x1;
      const dy = y2 - y1;
      const cos = Math.cos(-phi);
      const sin = Math.sin(-phi);
      this.endToCenterParameters(0, 0, cos * dx - sin * dy, sin * dx + cos * dy, large, sweep, rx, ry);
    } else {
      this.endToCenterParameters(x1, y1, x2, y2, large, sweep, rx, ry);
    }
  }

  private vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
    const d = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    if (d === 0) {
      return 0;
    }

    let c = (ux * vx + uy * vy) / d;
    if (c < -1) c = -1;
    else if (c > 1) c = 1;

    const s = ux * vy - uy * vx;
    c = Math.acos(c);
    return Math.sign(c) === Math.sign(s) ? c : -c;
  }

  private endToCenterParameters(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    large: boolean,
    sweep: boolean,
    rx: number,
    ry: number
  ): void {
    rx = Math.abs(rx);
    ry = Math.abs(ry);

    const x1d = 0.5 * (x1 - x2);
    const y1d = 0.5 * (y1 - y2);

    let r = (x1d * x1d) / (rx * rx) + (y1d * y1d) / (ry * ry);
    if (r > 1) {
      const rr = Math.sqrt(r);
      rx *= rr;
      ry *= rr;
      r = (x1d * x1d) / (rx * rx) + (y1d * y1d) / (ry * ry);
    } else if (r !== 0) {
      r = 1 / r - 1;
    }

    if (r > -1e-10 && r < 0) {
      r = 0;
    }

    r = Math.sqrt(r);
    if (large === sweep) {
      r = -r;
    }

    const cxd = (r * rx * y1d) / ry;
    const cyd = -(r * ry * x1d) / rx;

    const cx = cxd + 0.5 * (x1 + x2);
    const cy = cyd + 0.5 * (y1 + y2);

    const theta = this.vectorAngle(1, 0, (x1d - cxd) / rx, (y1d - cyd) / ry);
    const tau = Math.PI * 2;
    // Dart's `%` on doubles returns a non-negative remainder; JavaScript's does
    // not, so the sign has to be normalized before the sweep correction below.
    let dTheta =
      this.vectorAngle((x1d - cxd) / rx, (y1d - cyd) / ry, (-x1d - cxd) / rx, (-y1d - cyd) / ry) % tau;
    if (dTheta < 0) {
      dTheta += tau;
    }

    if (!sweep && dTheta > 0) {
      dTheta -= tau;
    } else if (sweep && dTheta < 0) {
      dTheta += tau;
    }

    this.bezierArcFromCentre(cx, cy, rx, ry, -theta, -dTheta);
  }

  private bezierArcFromCentre(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    startAngle: number,
    extent: number
  ): void {
    let fragmentsCount: number;
    let fragmentsAngle: number;

    if (Math.abs(extent) <= Math.PI / 2) {
      fragmentsCount = 1;
      fragmentsAngle = extent;
    } else {
      fragmentsCount = Math.ceil(Math.abs(extent) / (Math.PI / 2));
      fragmentsAngle = extent / fragmentsCount;
    }

    if (fragmentsAngle === 0) {
      return;
    }

    const halfFragment = fragmentsAngle * 0.5;
    let kappa = Math.abs((4 / 3) * (1 - Math.cos(halfFragment)) / Math.sin(halfFragment));
    if (fragmentsAngle < 0) {
      kappa = -kappa;
    }

    let theta = startAngle;
    const startFragment = theta + fragmentsAngle;

    let c1 = Math.cos(theta);
    let s1 = Math.sin(theta);
    for (let i = 0; i < fragmentsCount; i++) {
      const c0 = c1;
      const s0 = s1;
      theta = startFragment + i * fragmentsAngle;
      c1 = Math.cos(theta);
      s1 = Math.sin(theta);
      this.curveTo(
        cx + rx * (c0 - kappa * s0),
        cy - ry * (s0 + kappa * c0),
        cx + rx * (c1 + kappa * s1),
        cy - ry * (s1 - kappa * c1),
        cx + rx * c1,
        cy - ry * s1
      );
    }
  }

  // ----------------------------------------------------------- path painting

  fillPath({ evenOdd = false }: FillOptions = {}): void {
    this.push(evenOdd ? 'f*' : 'f');
  }

  strokePath({ close = false }: StrokeOptions = {}): void {
    this.push(close ? 's' : 'S');
  }

  fillAndStrokePath({ evenOdd = false, close = false }: FillAndStrokeOptions = {}): void {
    this.push(`${close ? 'b' : 'B'}${evenOdd ? '*' : ''}`);
  }

  /** `W`/`W*`, optionally followed by the `n` that consumes the path. */
  clipPath({ evenOdd = false, end = true }: ClipOptions = {}): void {
    this.push(`W${evenOdd ? '*' : ''}${end ? ' n' : ''}`);
  }

  // -------------------------------------------------------------- pen state

  setLineWidth(width: number): void {
    this.push(`${formatNumber(width)} w`);
  }

  setLineCap(cap: PdfLineCap): void {
    this.push(`${LINE_CAP_OPERAND[cap]} J`);
  }

  setLineJoin(join: PdfLineJoin): void {
    this.push(`${LINE_JOIN_OPERAND[join]} j`);
  }

  setMiterLimit(limit: number): void {
    if (limit < 1) {
      throw new RangeError('miter limit must be at least 1');
    }
    this.push(`${formatNumber(limit)} M`);
  }

  /**
   * `[2 1] 0 d` alternates 2 units on, 1 off. An empty array restores a solid
   * line, which is what upstream's default argument does.
   */
  setLineDashPattern(array: readonly number[] = [], phase = 0): void {
    this.push(`[${operands(array)}] ${formatNumber(phase)} d`);
  }

  setFillColor(color: ColorInput): void {
    this.push(colorOperator(color));
  }

  setStrokeColor(color: ColorInput): void {
    this.push(colorOperator(color, true));
  }

  setColor(color: ColorInput): void {
    this.setFillColor(color);
    this.setStrokeColor(color);
  }

  // ---------------------------------------------------- widget-space helpers

  fillRect(x: number, top: number, width: number, height: number, color: ColorInput): void {
    const bottom = this.pageHeight - top - height;
    this.push(`${colorOperator(color)} ${formatNumber(x)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re f`);
  }

  strokeRect(x: number, top: number, width: number, height: number, color: ColorInput, lineWidth = 1): void {
    const bottom = this.pageHeight - top - height;
    this.push(`${colorOperator(color, true)} ${formatNumber(lineWidth)} w ${formatNumber(x)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re S`);
  }

  text(text: string, x: number, baselineFromTop: number, style: CanvasTextStyle): void {
    const baseline = this.pageHeight - baselineFromTop;
    const fontSize = style.fontSize;
    const font = style.font ?? defaultPdfFont;
    const letterSpacing = style.letterSpacing ?? 0;
    const wordSpacing = style.wordSpacing ?? 0;

    const spacingOperators: string[] = [];
    if (letterSpacing === 0 && wordSpacing === 0 && this.textSpacingDirty) {
      spacingOperators.push('0', 'Tc', '0', 'Tw');
      this.currentLetterSpacing = 0;
      this.currentWordSpacing = 0;
      this.textSpacingDirty = false;
    } else {
      if (letterSpacing !== this.currentLetterSpacing) {
        spacingOperators.push(formatNumber(letterSpacing), 'Tc');
        this.currentLetterSpacing = letterSpacing;
      }
      if (wordSpacing !== this.currentWordSpacing) {
        spacingOperators.push(formatNumber(wordSpacing), 'Tw');
        this.currentWordSpacing = wordSpacing;
      }
      if (letterSpacing !== 0 || wordSpacing !== 0) {
        this.textSpacingDirty = true;
      }
    }

    const command = [
      'BT',
      this.addFont(font), formatNumber(fontSize), 'Tf',
      colorOperator(style.color),
      ...spacingOperators,
      '1 0 0 1', formatNumber(x), formatNumber(baseline), 'Tm',
      font.encodeText(text), 'Tj',
      'ET'
    ].join(' ');
    this.push(command);
  }

  line(x1: number, top1: number, x2: number, top2: number, color: ColorInput = '#000000', lineWidth = 1): void {
    const y1 = this.pageHeight - top1;
    const y2 = this.pageHeight - top2;
    this.push(`${colorOperator(color, true)} ${formatNumber(lineWidth)} w ${formatNumber(x1)} ${formatNumber(y1)} m ${formatNumber(x2)} ${formatNumber(y2)} l S`);
  }

  circle(cx: number, topCenter: number, radius: number, { fill = null, stroke = null, lineWidth = 1 }: CircleOptions = {}): void {
    const cy = this.pageHeight - topCenter;
    const k = 0.5522847498;
    const ox = radius * k;
    const oy = radius * k;
    const path = [
      `${formatNumber(cx + radius)} ${formatNumber(cy)} m`,
      `${formatNumber(cx + radius)} ${formatNumber(cy + oy)} ${formatNumber(cx + ox)} ${formatNumber(cy + radius)} ${formatNumber(cx)} ${formatNumber(cy + radius)} c`,
      `${formatNumber(cx - ox)} ${formatNumber(cy + radius)} ${formatNumber(cx - radius)} ${formatNumber(cy + oy)} ${formatNumber(cx - radius)} ${formatNumber(cy)} c`,
      `${formatNumber(cx - radius)} ${formatNumber(cy - oy)} ${formatNumber(cx - ox)} ${formatNumber(cy - radius)} ${formatNumber(cx)} ${formatNumber(cy - radius)} c`,
      `${formatNumber(cx + ox)} ${formatNumber(cy - radius)} ${formatNumber(cx + radius)} ${formatNumber(cy - oy)} ${formatNumber(cx + radius)} ${formatNumber(cy)} c`
    ].join(' ');

    if (fill && stroke) {
      this.push(`${colorOperator(fill)} ${colorOperator(stroke, true)} ${formatNumber(lineWidth)} w ${path} B`);
    } else if (fill) {
      this.push(`${colorOperator(fill)} ${path} f`);
    } else {
      this.push(`${colorOperator(stroke ?? '#000000', true)} ${formatNumber(lineWidth)} w ${path} S`);
    }
  }

  output(): string {
    return `${this.commands.join('\n')}\n`;
  }
}
