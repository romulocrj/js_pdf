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
 *   - pdf/lib/src/svg/path.dart
 *   - pdf/lib/src/pdf/graphics.dart
 *
 * The SVG `d` attribute: a grammar of twenty commands reduced to the four a
 * renderer can draw — move, line, cubic, close.
 *
 * Upstream does not implement this itself. `svg/path.dart` holds the *shapes*
 * (a `<rect>` written out as a `d` string, and so on, landed in phase 2.5 here)
 * and delegates the grammar to `writeSvgPathDataToPath` from the `path_parsing`
 * package, which is in turn a translation of Chromium's SVG path parser. The
 * port has no runtime dependencies, so the grammar is translated here, keeping
 * `path_parsing`'s structure — a string source that yields segments and a
 * normalizer that turns them absolute and emits them — because that is what
 * makes the two comparable when a path renders differently in the two.
 *
 * `drawShape` and `shapeBoundingBox` are `PdfGraphics.drawShape` and
 * `PdfGraphics.shapeBoundingBox` from `graphics.dart`. They live here rather
 * than on `PdfCanvas` because the port's import direction is one-way: `svg/`
 * may reach into `pdf/`, never the reverse. Upstream can put them on the canvas
 * because `path_parsing` is an external package to it.
 */

import { PdfGraphicState } from '../pdf/graphic_state.ts';
import { PdfCanvas } from '../pdf/graphics.ts';
import {
  multiplyMatrix,
  rotationMatrix,
  scaleMatrix,
  transformPoint
} from '../pdf/matrix.ts';
import { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { getNumeric } from './parser.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';

/** Receives the normalized path. Upstream's `PathProxy`. */
export interface PathProxy {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  cubicTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
  close(): void;
}

interface Offset {
  readonly dx: number;
  readonly dy: number;
}

const ZERO: Offset = Object.freeze({ dx: 0, dy: 0 });

/**
 * A path command letter, or `?` for "not a command".
 *
 * Upstream's `path_parsing` has an `SvgPathSegType` enum and a letter-to-enum
 * table. The letter *is* the enum, so the port keeps the letter — one fewer
 * mapping to get wrong, and `enum` is not erasable TypeScript anyway.
 */
type Command =
  | 'M' | 'm' | 'L' | 'l' | 'H' | 'h' | 'V' | 'v'
  | 'C' | 'c' | 'S' | 's' | 'Q' | 'q' | 'T' | 't'
  | 'A' | 'a' | 'Z' | 'z' | '?';

const COMMANDS = 'MmLlHhVvCcSsQqTtAaZz';

function commandOf(character: string): Command {
  return COMMANDS.includes(character) ? (character as Command) : '?';
}

function isCubicCommand(command: Command): boolean {
  return command === 'C' || command === 'c' || command === 'S' || command === 's';
}

function isQuadraticCommand(command: Command): boolean {
  return command === 'Q' || command === 'q' || command === 'T' || command === 't';
}

interface PathSegment {
  command: Command;
  targetPoint: Offset;
  point1: Offset;
  point2: Offset;
  /** Degrees, as the `A` command spells it. */
  arcAngle: number;
  arcLarge: boolean;
  arcSweep: boolean;
}

function newSegment(): PathSegment {
  return {
    command: '?',
    targetPoint: ZERO,
    point1: ZERO,
    point2: ZERO,
    arcAngle: 0,
    arcLarge: false,
    arcSweep: false
  };
}

const SPACE = 0x20;
const NEWLINE = 0x0a;
const TAB = 0x09;
const RETURN = 0x0d;
const FORM_FEED = 0x0c;
const COMMA = 0x2c;
const PLUS = 0x2b;
const MINUS = 0x2d;
const PERIOD = 0x2e;
const DIGIT_0 = 0x30;
const DIGIT_1 = 0x31;
const DIGIT_9 = 0x39;
const LOWER_E = 0x65;
const UPPER_E = 0x45;
const LOWER_X = 0x78;
const LOWER_M = 0x6d;

/**
 * Tokenizer for the `d` grammar.
 *
 * Divergence from upstream: `parseSegments` returns an array instead of a
 * generator. The port stays synchronous and a `d` string is bounded, so nothing
 * is gained by streaming and a plain array is easier to test against.
 */
export class SvgPathStringSource {
  private readonly source: string;
  private readonly length: number;
  private index = 0;
  private previousCommand: Command = '?';

  constructor(source: string) {
    this.source = source;
    this.length = source.length;
    this.skipOptionalSpaces();
  }

  get hasMoreData(): boolean {
    return this.index < this.length;
  }

  parseSegments(): PathSegment[] {
    const segments: PathSegment[] = [];
    while (this.hasMoreData) {
      segments.push(this.parseSegment());
    }
    return segments;
  }

  private isSpace(code: number): boolean {
    return (
      code <= SPACE &&
      (code === SPACE || code === NEWLINE || code === TAB || code === RETURN || code === FORM_FEED)
    );
  }

  /** Advances past whitespace and returns the next code unit, or -1 at the end. */
  private skipOptionalSpaces(): number {
    for (;;) {
      if (this.index >= this.length) {
        return -1;
      }
      const code = this.source.charCodeAt(this.index);
      if (!this.isSpace(code)) {
        return code;
      }
      this.index++;
    }
  }

  private skipOptionalSpacesOrDelimiter(delimiter = COMMA): void {
    if (this.skipOptionalSpaces() === delimiter) {
      this.index++;
      this.skipOptionalSpaces();
    }
  }

  private static isNumberStart(code: number): boolean {
    return (code >= DIGIT_0 && code <= DIGIT_9) || code === PLUS || code === MINUS || code === PERIOD;
  }

  private readCodeUnit(): number {
    if (this.index >= this.length) {
      return -1;
    }
    return this.source.charCodeAt(this.index++);
  }

  /**
   * The implicit-repeat rule: a number where a command letter was expected
   * repeats the previous command, except that a repeated `moveto` is a `lineto`
   * and `close` takes no parameters so cannot repeat at all.
   */
  private maybeImplicitCommand(lookahead: number, next: Command): Command {
    if (!SvgPathStringSource.isNumberStart(lookahead) || this.previousCommand === 'Z' || this.previousCommand === 'z') {
      return next;
    }
    if (this.previousCommand === 'M') return 'L';
    if (this.previousCommand === 'm') return 'l';
    return this.previousCommand;
  }

  /**
   * Ported from Chromium's own number scanner rather than handed to
   * `Number.parseFloat`: the grammar allows `.5.5` to mean two numbers, and
   * `1e2` to be followed immediately by a command letter. A regular expression
   * that accepts those and nothing else is harder to read than the scanner.
   */
  private parseNumber(): number {
    this.skipOptionalSpaces();

    let sign = 1;
    let c = this.readCodeUnit();
    if (c === PLUS) {
      c = this.readCodeUnit();
    } else if (c === MINUS) {
      sign = -1;
      c = this.readCodeUnit();
    }

    if ((c < DIGIT_0 || c > DIGIT_9) && c !== PERIOD) {
      throw new SyntaxError('First character of a number must be one of [0-9+-.]');
    }

    let integer = 0;
    while (c >= DIGIT_0 && c <= DIGIT_9) {
      integer = integer * 10 + (c - DIGIT_0);
      c = this.readCodeUnit();
    }

    if (!Number.isFinite(integer)) {
      throw new RangeError('Numeric overflow in path data');
    }

    let decimal = 0;
    if (c === PERIOD) {
      c = this.readCodeUnit();
      if (c < DIGIT_0 || c > DIGIT_9) {
        throw new SyntaxError('There must be at least one digit following the .');
      }

      let frac = 1;
      while (c >= DIGIT_0 && c <= DIGIT_9) {
        frac *= 0.1;
        decimal += (c - DIGIT_0) * frac;
        c = this.readCodeUnit();
      }
    }

    let number = (integer + decimal) * sign;

    // `1em` and `1ex` are CSS lengths, not exponents; the lookahead is what
    // keeps this scanner usable for attribute values as well as for `d`.
    if (
      this.index < this.length &&
      (c === LOWER_E || c === UPPER_E) &&
      this.source.charCodeAt(this.index) !== LOWER_X &&
      this.source.charCodeAt(this.index) !== LOWER_M
    ) {
      c = this.readCodeUnit();

      let exponentIsNegative = false;
      if (c === PLUS) {
        c = this.readCodeUnit();
      } else if (c === MINUS) {
        c = this.readCodeUnit();
        exponentIsNegative = true;
      }

      if (c < DIGIT_0 || c > DIGIT_9) {
        throw new SyntaxError('Missing exponent in path data');
      }

      let exponent = 0;
      while (c >= DIGIT_0 && c <= DIGIT_9) {
        exponent = exponent * 10 + (c - DIGIT_0);
        c = this.readCodeUnit();
      }
      if (exponentIsNegative) {
        exponent = -exponent;
      }
      if (exponent < -37 || exponent > 38) {
        throw new RangeError(`Invalid exponent ${exponent} in path data`);
      }
      if (exponent !== 0) {
        number *= Math.pow(10, exponent);
      }
    }

    if (!Number.isFinite(number)) {
      throw new RangeError('Numeric overflow in path data');
    }

    if (c !== -1) {
      this.index--;
      this.skipOptionalSpacesOrDelimiter();
    }

    return number;
  }

  private parseArcFlag(): boolean {
    if (!this.hasMoreData) {
      throw new SyntaxError('Expected an arc flag');
    }

    const flag = this.source.charCodeAt(this.index++);
    this.skipOptionalSpacesOrDelimiter();

    if (flag === DIGIT_0) return false;
    if (flag === DIGIT_1) return true;
    throw new SyntaxError('Arc flag must be 0 or 1');
  }

  parseSegment(): PathSegment {
    const segment = newSegment();
    const lookahead = this.source.charCodeAt(this.index);
    let command = commandOf(this.source[this.index]!);

    if (this.previousCommand === '?') {
      // A path has to open with a moveto; anything else has no start point.
      if (command !== 'M' && command !== 'm') {
        throw new SyntaxError('Path data must begin with a moveTo command');
      }
      this.index++;
    } else if (command === '?') {
      command = this.maybeImplicitCommand(lookahead, command);
      if (command === '?') {
        throw new SyntaxError(`Expected a path command at offset ${this.index}`);
      }
    } else {
      this.index++;
    }

    segment.command = command;
    this.previousCommand = command;

    switch (command) {
      case 'C':
      case 'c':
        segment.point1 = { dx: this.parseNumber(), dy: this.parseNumber() };
        segment.point2 = { dx: this.parseNumber(), dy: this.parseNumber() };
        segment.targetPoint = { dx: this.parseNumber(), dy: this.parseNumber() };
        break;

      case 'S':
      case 's':
        segment.point2 = { dx: this.parseNumber(), dy: this.parseNumber() };
        segment.targetPoint = { dx: this.parseNumber(), dy: this.parseNumber() };
        break;

      case 'M':
      case 'm':
      case 'L':
      case 'l':
      case 'T':
      case 't':
        segment.targetPoint = { dx: this.parseNumber(), dy: this.parseNumber() };
        break;

      case 'H':
      case 'h':
        // The other coordinate stays zero; the normalizer fills it from the
        // current point, whether this is the relative or the absolute form.
        segment.targetPoint = { dx: this.parseNumber(), dy: 0 };
        break;

      case 'V':
      case 'v':
        segment.targetPoint = { dx: 0, dy: this.parseNumber() };
        break;

      case 'Z':
      case 'z':
        this.skipOptionalSpaces();
        break;

      case 'Q':
      case 'q':
        segment.point1 = { dx: this.parseNumber(), dy: this.parseNumber() };
        segment.targetPoint = { dx: this.parseNumber(), dy: this.parseNumber() };
        break;

      case 'A':
      case 'a':
        segment.point1 = { dx: this.parseNumber(), dy: this.parseNumber() };
        segment.arcAngle = this.parseNumber();
        segment.arcLarge = this.parseArcFlag();
        segment.arcSweep = this.parseArcFlag();
        segment.targetPoint = { dx: this.parseNumber(), dy: this.parseNumber() };
        break;

      default:
        throw new SyntaxError('Unknown path command');
    }

    return segment;
  }
}

function add(a: Offset, b: Offset): Offset {
  return { dx: a.dx + b.dx, dy: a.dy + b.dy };
}

function subtract(a: Offset, b: Offset): Offset {
  return { dx: a.dx - b.dx, dy: a.dy - b.dy };
}

function times(a: Offset, factor: number): Offset {
  return { dx: a.dx * factor, dy: a.dy * factor };
}

/** The control point of a smooth segment: the previous one mirrored. */
function reflectedPoint(reflectedIn: Offset, pointToReflect: Offset): Offset {
  return {
    dx: 2 * reflectedIn.dx - pointToReflect.dx,
    dy: 2 * reflectedIn.dy - pointToReflect.dy
  };
}

const ONE_OVER_THREE = 1 / 3;

/** A quadratic's control point raised to the two a cubic needs. */
function blendPoints(p1: Offset, p2: Offset): Offset {
  return {
    dx: (p1.dx + 2 * p2.dx) * ONE_OVER_THREE,
    dy: (p1.dy + 2 * p2.dy) * ONE_OVER_THREE
  };
}

const TWO_PI = Math.PI * 2;
const PI_OVER_TWO = Math.PI / 2;

/**
 * Turns parsed segments absolute and reduces them to move / line / cubic /
 * close, which is all a PDF content stream can express.
 */
export class SvgPathNormalizer {
  private currentPoint: Offset = ZERO;
  private subPathPoint: Offset = ZERO;
  private controlPoint: Offset = ZERO;
  private lastCommand: Command = '?';

  emitSegment(segment: PathSegment, path: PathProxy): void {
    const command = segment.command;

    // Relative commands become absolute against the current point. `H`/`V` fill
    // in the coordinate their letter does not carry.
    switch (command) {
      case 'q':
        segment.point1 = add(segment.point1, this.currentPoint);
        segment.targetPoint = add(segment.targetPoint, this.currentPoint);
        break;
      case 'c':
        segment.point1 = add(segment.point1, this.currentPoint);
        segment.point2 = add(segment.point2, this.currentPoint);
        segment.targetPoint = add(segment.targetPoint, this.currentPoint);
        break;
      case 's':
        segment.point2 = add(segment.point2, this.currentPoint);
        segment.targetPoint = add(segment.targetPoint, this.currentPoint);
        break;
      case 'm':
      case 'l':
      case 'h':
      case 'v':
      case 't':
      case 'a':
        segment.targetPoint = add(segment.targetPoint, this.currentPoint);
        break;
      case 'H':
        segment.targetPoint = { dx: segment.targetPoint.dx, dy: this.currentPoint.dy };
        break;
      case 'V':
        segment.targetPoint = { dx: this.currentPoint.dx, dy: segment.targetPoint.dy };
        break;
      case 'Z':
      case 'z':
        segment.targetPoint = this.subPathPoint;
        break;
      default:
        break;
    }

    // Upstream chains this switch with labelled `continue`s: a smooth segment
    // computes its missing control point and then falls into the non-smooth
    // case. TypeScript has no labelled fallthrough, so the shared tail is a
    // single case body with the smooth-only step guarded at the top.
    switch (command) {
      case 'M':
      case 'm':
        this.subPathPoint = segment.targetPoint;
        path.moveTo(segment.targetPoint.dx, segment.targetPoint.dy);
        break;

      case 'L':
      case 'l':
      case 'H':
      case 'h':
      case 'V':
      case 'v':
        path.lineTo(segment.targetPoint.dx, segment.targetPoint.dy);
        break;

      case 'Z':
      case 'z':
        path.close();
        break;

      case 'S':
      case 's':
      case 'C':
      case 'c': {
        if (command === 'S' || command === 's') {
          segment.point1 = isCubicCommand(this.lastCommand)
            ? reflectedPoint(this.currentPoint, this.controlPoint)
            : this.currentPoint;
        }
        this.controlPoint = segment.point2;
        path.cubicTo(
          segment.point1.dx,
          segment.point1.dy,
          segment.point2.dx,
          segment.point2.dy,
          segment.targetPoint.dx,
          segment.targetPoint.dy
        );
        break;
      }

      case 'T':
      case 't':
      case 'Q':
      case 'q': {
        if (command === 'T' || command === 't') {
          segment.point1 = isQuadraticCommand(this.lastCommand)
            ? reflectedPoint(this.currentPoint, this.controlPoint)
            : this.currentPoint;
        }
        // The unmodified quadratic control point is what a following `T`
        // reflects, so it is saved before being raised to cubic degree.
        this.controlPoint = segment.point1;
        const p1 = blendPoints(this.currentPoint, this.controlPoint);
        const p2 = blendPoints(segment.targetPoint, this.controlPoint);
        path.cubicTo(p1.dx, p1.dy, p2.dx, p2.dy, segment.targetPoint.dx, segment.targetPoint.dy);
        break;
      }

      case 'A':
      case 'a':
        if (!this.decomposeArcToCubic(this.currentPoint, segment, path)) {
          // An arc the spec says to skip still has to reach its endpoint.
          path.lineTo(segment.targetPoint.dx, segment.targetPoint.dy);
        }
        break;

      default:
        throw new SyntaxError('Invalid command type in path');
    }

    this.currentPoint = segment.targetPoint;

    if (!isCubicCommand(command) && !isQuadraticCommand(command)) {
      this.controlPoint = this.currentPoint;
    }

    this.lastCommand = command;
  }

  /**
   * The endpoint-to-centre conversion from the SVG implementation notes,
   * emitting one cubic per quarter turn. Returns false when the spec says to
   * treat the arc as a straight line.
   */
  private decomposeArcToCubic(currentPoint: Offset, segment: PathSegment, path: PathProxy): boolean {
    let rx = Math.abs(segment.point1.dx);
    let ry = Math.abs(segment.point1.dy);
    if (rx === 0 || ry === 0) {
      return false;
    }

    if (segment.targetPoint.dx === currentPoint.dx && segment.targetPoint.dy === currentPoint.dy) {
      return false;
    }

    const angle = (segment.arcAngle * Math.PI) / 180;
    const midPointDistance = times(subtract(currentPoint, segment.targetPoint), 0.5);

    const unrotate = rotationMatrix(-angle);
    const transformedMidPoint = transformPoint(unrotate, midPointDistance.dx, midPointDistance.dy);

    const squareRx = rx * rx;
    const squareRy = ry * ry;
    const squareX = transformedMidPoint.x * transformedMidPoint.x;
    const squareY = transformedMidPoint.y * transformedMidPoint.y;

    // Radii too small to reach both endpoints are scaled up until they can.
    const radiiScale = squareX / squareRx + squareY / squareRy;
    if (radiiScale > 1) {
      rx *= Math.sqrt(radiiScale);
      ry *= Math.sqrt(radiiScale);
    }

    // Map into the space where the ellipse is the unit circle: rotate, then
    // scale by the reciprocal radii.
    const toUnitCircle = multiplyMatrix(scaleMatrix(1 / rx, 1 / ry), rotationMatrix(-angle));

    const mapped1 = transformPoint(toUnitCircle, currentPoint.dx, currentPoint.dy);
    const mapped2 = transformPoint(toUnitCircle, segment.targetPoint.dx, segment.targetPoint.dy);
    let point1: Offset = { dx: mapped1.x, dy: mapped1.y };
    let point2: Offset = { dx: mapped2.x, dy: mapped2.y };
    let delta = subtract(point2, point1);

    const d = delta.dx * delta.dx + delta.dy * delta.dy;
    const scaleFactorSquared = Math.max(1 / d - 0.25, 0);
    let scaleFactor = Math.sqrt(scaleFactorSquared);
    if (!Number.isFinite(scaleFactor)) {
      scaleFactor = 0;
    }

    if (segment.arcSweep === segment.arcLarge) {
      scaleFactor = -scaleFactor;
    }

    delta = times(delta, scaleFactor);
    const midpoint = times(add(point1, point2), 0.5);
    const centerPoint: Offset = { dx: midpoint.dx - delta.dy, dy: midpoint.dy + delta.dx };

    const theta1 = Math.atan2(point1.dy - centerPoint.dy, point1.dx - centerPoint.dx);
    const theta2 = Math.atan2(point2.dy - centerPoint.dy, point2.dx - centerPoint.dx);

    let thetaArc = theta2 - theta1;
    if (thetaArc < 0 && segment.arcSweep) {
      thetaArc += TWO_PI;
    } else if (thetaArc > 0 && !segment.arcSweep) {
      thetaArc -= TWO_PI;
    }

    const fromUnitCircle = multiplyMatrix(rotationMatrix(angle), scaleMatrix(rx, ry));

    // The 0.001 is Chromium's: `atan2` is not exact enough on every platform,
    // and without the slack an exact quarter turn splits into two fragments.
    const segments = Math.ceil(Math.abs(thetaArc / (PI_OVER_TWO + 0.001)));
    for (let i = 0; i < segments; i++) {
      const startTheta = theta1 + (i * thetaArc) / segments;
      const endTheta = theta1 + ((i + 1) * thetaArc) / segments;

      const t = (8 / 6) * Math.tan(0.25 * (endTheta - startTheta));
      if (!Number.isFinite(t)) {
        return false;
      }

      const sinStart = Math.sin(startTheta);
      const cosStart = Math.cos(startTheta);
      const sinEnd = Math.sin(endTheta);
      const cosEnd = Math.cos(endTheta);

      point1 = {
        dx: cosStart - t * sinStart + centerPoint.dx,
        dy: sinStart + t * cosStart + centerPoint.dy
      };
      const targetPoint: Offset = { dx: cosEnd + centerPoint.dx, dy: sinEnd + centerPoint.dy };
      point2 = { dx: targetPoint.dx + t * sinEnd, dy: targetPoint.dy - t * cosEnd };

      const c1 = transformPoint(fromUnitCircle, point1.dx, point1.dy);
      const c2 = transformPoint(fromUnitCircle, point2.dx, point2.dy);
      const end = transformPoint(fromUnitCircle, targetPoint.dx, targetPoint.dy);

      path.cubicTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
    }

    return true;
  }
}

/** Parse `d` and emit it to `path`. Upstream's `writeSvgPathDataToPath`. */
export function writeSvgPathDataToPath(d: string | null | undefined, path: PathProxy): void {
  if (d === null || d === undefined || d === '') {
    return;
  }

  const source = new SvgPathStringSource(d);
  const normalizer = new SvgPathNormalizer();
  for (const segment of source.parseSegments()) {
    normalizer.emitSegment(segment, path);
  }
}

/** Feeds a parsed path straight into a canvas. `PdfGraphics.drawShape`. */
export class CanvasPathProxy implements PathProxy {
  private readonly canvas: PdfCanvas;

  constructor(canvas: PdfCanvas) {
    this.canvas = canvas;
  }

  moveTo(x: number, y: number): void {
    this.canvas.moveTo(x, y);
  }

  lineTo(x: number, y: number): void {
    this.canvas.lineTo(x, y);
  }

  cubicTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    this.canvas.curveTo(x1, y1, x2, y2, x3, y3);
  }

  close(): void {
    this.canvas.closePath();
  }
}

/**
 * Append the path `d` describes to `canvas`'s current path, in PDF user space.
 *
 * Nothing is painted: the caller decides between `fillPath`, `strokePath` and
 * `clipPath`, which is what lets an SVG shape be filled and stroked with
 * different rules from one `d` string.
 */
export function drawShape(canvas: PdfCanvas, d: string): void {
  writeSvgPathDataToPath(d, new CanvasPathProxy(canvas));
}

/**
 * Accumulates the tight bounding box of a path. Upstream's `_PathBBProxy`,
 * which solves each cubic's derivative rather than sampling it, so a curve that
 * bulges past its control points is still contained.
 */
export class BoundingBoxPathProxy implements PathProxy {
  private xMin = Infinity;
  private yMin = Infinity;
  private xMax = -Infinity;
  private yMax = -Infinity;
  private px = 0;
  private py = 0;

  get box(): PdfRect {
    if (this.xMin > this.xMax || this.yMin > this.yMax) {
      return PdfRect.zero;
    }
    return PdfRect.fromLTRB(this.xMin, this.yMin, this.xMax, this.yMax);
  }

  moveTo(x: number, y: number): void {
    this.px = x;
    this.py = y;
    this.updateMinMax(x, y);
  }

  lineTo(x: number, y: number): void {
    this.px = x;
    this.py = y;
    this.updateMinMax(x, y);
  }

  close(): void {}

  cubicTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    const tValues: number[] = [];

    for (let axis = 0; axis < 2; axis++) {
      let a: number;
      let b: number;
      let c: number;

      if (axis === 0) {
        b = 6 * this.px - 12 * x1 + 6 * x2;
        a = -3 * this.px + 9 * x1 - 9 * x2 + 3 * x3;
        c = 3 * x1 - 3 * this.px;
      } else {
        b = 6 * this.py - 12 * y1 + 6 * y2;
        a = -3 * this.py + 9 * y1 - 9 * y2 + 3 * y3;
        c = 3 * y1 - 3 * this.py;
      }

      if (Math.abs(a) < 1e-12) {
        if (Math.abs(b) < 1e-12) {
          continue;
        }
        const t = -c / b;
        if (t > 0 && t < 1) {
          tValues.push(t);
        }
        continue;
      }

      const b2ac = b * b - 4 * c * a;
      if (b2ac < 0) {
        if (Math.abs(b2ac) < 1e-12) {
          const t = -b / (2 * a);
          if (t > 0 && t < 1) {
            tValues.push(t);
          }
        }
        continue;
      }

      const sqrtB2ac = Math.sqrt(b2ac);
      const t1 = (-b + sqrtB2ac) / (2 * a);
      if (t1 > 0 && t1 < 1) {
        tValues.push(t1);
      }
      const t2 = (-b - sqrtB2ac) / (2 * a);
      if (t2 > 0 && t2 < 1) {
        tValues.push(t2);
      }
    }

    for (const t of tValues) {
      const mt = 1 - t;
      this.updateMinMax(
        mt * mt * mt * this.px + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
        mt * mt * mt * this.py + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
      );
    }

    this.updateMinMax(this.px, this.py);
    this.updateMinMax(x3, y3);

    this.px = x3;
    this.py = y3;
  }

  private updateMinMax(x: number, y: number): void {
    this.xMin = Math.min(this.xMin, x);
    this.yMin = Math.min(this.yMin, y);
    this.xMax = Math.max(this.xMax, x);
    this.yMax = Math.max(this.yMax, y);
  }
}

/** The tight bounding box of `d`. Upstream's `PdfGraphics.shapeBoundingBox`. */
export function shapeBoundingBox(d: string): PdfRect {
  const proxy = new BoundingBoxPathProxy();
  writeSvgPathDataToPath(d, proxy);
  return proxy.box;
}

/** A basic SVG shape normalized to path data, then painted with its brush. */
export class SvgPath extends SvgOperation {
  readonly d: string;

  constructor(
    d: string,
    brush: SvgBrush,
    clip: SvgClipPath,
    transform: SvgTransform,
    painter: SvgPainter
  ) {
    super(brush, clip, transform, painter);
    this.d = d;
  }

  static fromXmlElement(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgPath {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    let d: string;

    switch (element.name.local) {
      case 'path': {
        const attribute = element.getAttribute('d');
        if (attribute === null) {
          throw new SyntaxError('Path element must contain a d attribute');
        }
        d = attribute;
        break;
      }

      case 'rect':
        d = SvgPath.rectData(element, brush);
        break;

      case 'circle': {
        const cx = SvgPath.numeric(element, 'cx', brush);
        const cy = SvgPath.numeric(element, 'cy', brush);
        const r = SvgPath.numeric(element, 'r', brush);
        d = `M${cx - r},${cy}A${r},${r} 0,0,0 ${cx + r},${cy}`
          + `A${r},${r} 0,0,0 ${cx - r},${cy}z`;
        break;
      }

      case 'ellipse': {
        const cx = SvgPath.numeric(element, 'cx', brush);
        const cy = SvgPath.numeric(element, 'cy', brush);
        const rx = SvgPath.numeric(element, 'rx', brush);
        const ry = SvgPath.numeric(element, 'ry', brush);
        d = `M${cx - rx},${cy}A${rx},${ry} 0,0,0 ${cx + rx},${cy}`
          + `A${rx},${ry} 0,0,0 ${cx - rx},${cy}z`;
        break;
      }

      case 'line': {
        const x1 = SvgPath.numeric(element, 'x1', brush);
        const y1 = SvgPath.numeric(element, 'y1', brush);
        const x2 = SvgPath.numeric(element, 'x2', brush);
        const y2 = SvgPath.numeric(element, 'y2', brush);
        d = `M${x1} ${y1} ${x2} ${y2}`;
        break;
      }

      case 'polyline':
        d = `M${element.getAttribute('points') ?? '0, 0'}`;
        break;

      case 'polygon':
        d = `M${element.getAttribute('points') ?? '0, 0'}z`;
        break;

      default:
        throw new SyntaxError(`Unsupported SVG shape: ${element.name.local}`);
    }

    return new SvgPath(
      d,
      brush,
      SvgClipPath.fromXml(element, painter, brush),
      SvgTransform.fromXml(element),
      painter
    );
  }

  private static numeric(element: XmlElement, name: string, brush: SvgBrush): number {
    return getNumeric(element, name, brush, { defaultValue: 0 })!.sizeValue;
  }

  private static rectData(element: XmlElement, brush: SvgBrush): string {
    const x = SvgPath.numeric(element, 'x', brush);
    const y = SvgPath.numeric(element, 'y', brush);
    const width = SvgPath.numeric(element, 'width', brush);
    const height = SvgPath.numeric(element, 'height', brush);

    let rx = getNumeric(element, 'rx', brush)?.sizeValue ?? null;
    let ry = getNumeric(element, 'ry', brush)?.sizeValue ?? null;
    ry = ry ?? rx ?? 0;
    rx = rx ?? ry;

    const topRight = rx !== 0 || ry !== 0 ? `a ${rx} ${ry} 0 0 1 ${rx} ${ry}` : '';
    const bottomRight = rx !== 0 || ry !== 0 ? `a ${rx} ${ry} 0 0 1 ${-rx} ${ry}` : '';
    const bottomLeft = rx !== 0 || ry !== 0 ? `a ${rx} ${ry} 0 0 1 ${-rx} ${-ry}` : '';
    const topLeft = rx !== 0 || ry !== 0 ? `a ${rx} ${ry} 0 0 1 ${rx} ${-ry}` : '';

    return `M${x + rx} ${y}h${width - rx * 2}${topRight}`
      + `v${height - ry * 2}${bottomRight}`
      + `h${-(width - rx * 2)}${bottomLeft}`
      + `v${-(height - ry * 2)}${topLeft}z`;
  }

  protected paintShape(canvas: PdfCanvas): void {
    const fill = this.brush.fill;
    if (fill?.isNotEmpty === true) {
      fill.setFillColor(this, canvas);
      const opacity = (this.brush.fillOpacity ?? 1) * fill.opacity;
      if (opacity < 1) {
        canvas.saveContext();
        canvas.setGraphicState(new PdfGraphicState({ opacity }));
      }
      drawShape(canvas, this.d);
      canvas.fillPath({ evenOdd: this.brush.fillEvenOdd ?? false });
      if (opacity < 1) {
        canvas.restoreContext();
      }
    }

    const stroke = this.brush.stroke;
    if (stroke?.isNotEmpty === true) {
      stroke.setStrokeColor(this, canvas);
      const opacity = (this.brush.strokeOpacity ?? 1) * stroke.opacity;
      if (opacity < 1) {
        canvas.setGraphicState(new PdfGraphicState({ opacity }));
      }
      drawShape(canvas, this.d);
      canvas.setLineCap(this.brush.strokeLineCap ?? 'butt');
      canvas.setLineJoin(this.brush.strokeLineJoin ?? 'miter');
      canvas.setMiterLimit(Math.max(1, this.brush.strokeMiterLimit ?? 4));
      canvas.setLineDashPattern(
        this.brush.strokeDashArray ?? [],
        this.brush.strokeDashOffset ?? 0
      );
      canvas.setLineWidth(this.brush.strokeWidth?.sizeValue ?? 1);
      canvas.strokePath();
    }
  }

  protected drawShape(canvas: PdfCanvas): void {
    drawShape(canvas, this.d);
  }

  boundingBox(): PdfRect {
    return shapeBoundingBox(this.d);
  }
}
