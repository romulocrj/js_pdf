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
 *   - pdf/lib/src/widgets/border_radius.dart
 */

import type { PdfCanvas } from '../pdf/graphics.ts';

export interface RadiusInput {
  readonly x: number;
  readonly y?: number;
}

/** A circular or elliptical corner radius. */
export class Radius {
  static readonly zero = new Radius(0, 0);

  readonly x: number;
  readonly y: number;

  constructor(x: number, y = x) {
    this.x = Math.max(0, Number(x));
    this.y = Math.max(0, Number(y));
  }

  static circular(radius: number): Radius {
    return new Radius(radius);
  }

  static elliptical(x: number, y: number): Radius {
    return new Radius(x, y);
  }

  equals(other: Radius): boolean {
    return this.x === other.x && this.y === other.y;
  }
}

export type RadiusValue = number | Radius | RadiusInput;

function radius(value: RadiusValue = Radius.zero): Radius {
  if (typeof value === 'number') return Radius.circular(value);
  if (value instanceof Radius) return value;
  return new Radius(value.x, value.y ?? value.x);
}

export type TextDirection = 'ltr' | 'rtl';

/** Physical or direction-dependent corner radii. */
export abstract class BorderRadiusGeometry {
  abstract get isUniform(): boolean;
  abstract get uniform(): Radius;
  abstract resolve(direction?: TextDirection | null): BorderRadius;
}

export interface BorderRadiusOnlyOptions {
  readonly topLeft?: RadiusValue;
  readonly topRight?: RadiusValue;
  readonly bottomLeft?: RadiusValue;
  readonly bottomRight?: RadiusValue;
}

/** Immutable radii for the four physical corners of a rectangle. */
export class BorderRadius extends BorderRadiusGeometry {
  static readonly zero = BorderRadius.all(0);

  readonly topLeft: Radius;
  readonly topRight: Radius;
  readonly bottomLeft: Radius;
  readonly bottomRight: Radius;

  constructor({
    topLeft = Radius.zero,
    topRight = Radius.zero,
    bottomLeft = Radius.zero,
    bottomRight = Radius.zero
  }: BorderRadiusOnlyOptions = {}) {
    super();
    this.topLeft = radius(topLeft);
    this.topRight = radius(topRight);
    this.bottomLeft = radius(bottomLeft);
    this.bottomRight = radius(bottomRight);
  }

  static all(value: RadiusValue): BorderRadius {
    const resolved = radius(value);
    return new BorderRadius({
      topLeft: resolved,
      topRight: resolved,
      bottomLeft: resolved,
      bottomRight: resolved
    });
  }

  static circular(value: number): BorderRadius {
    return BorderRadius.all(value);
  }

  static vertical({
    top = Radius.zero,
    bottom = Radius.zero
  }: {
    readonly top?: RadiusValue;
    readonly bottom?: RadiusValue;
  } = {}): BorderRadius {
    return new BorderRadius({ topLeft: top, topRight: top, bottomLeft: bottom, bottomRight: bottom });
  }

  static horizontal({
    left = Radius.zero,
    right = Radius.zero
  }: {
    readonly left?: RadiusValue;
    readonly right?: RadiusValue;
  } = {}): BorderRadius {
    return new BorderRadius({ topLeft: left, bottomLeft: left, topRight: right, bottomRight: right });
  }

  static only(options: BorderRadiusOnlyOptions = {}): BorderRadius {
    return new BorderRadius(options);
  }

  override get isUniform(): boolean {
    return this.topLeft.equals(this.topRight)
      && this.topLeft.equals(this.bottomLeft)
      && this.topLeft.equals(this.bottomRight);
  }

  override get uniform(): Radius {
    return this.isUniform ? this.topLeft : Radius.zero;
  }

  override resolve(): BorderRadius {
    return this;
  }

  /** Append the rounded rectangle path in PDF user space. */
  paint(canvas: PdfCanvas, x: number, top: number, width: number, height: number): void {
    const bottom = canvas.pageHeight - top - height;
    const scale = Math.min(
      1,
      width / Math.max(1, this.topLeft.x + this.topRight.x, this.bottomLeft.x + this.bottomRight.x),
      height / Math.max(1, this.topLeft.y + this.bottomLeft.y, this.topRight.y + this.bottomRight.y)
    );
    const tl = new Radius(this.topLeft.x * scale, this.topLeft.y * scale);
    const tr = new Radius(this.topRight.x * scale, this.topRight.y * scale);
    const bl = new Radius(this.bottomLeft.x * scale, this.bottomLeft.y * scale);
    const br = new Radius(this.bottomRight.x * scale, this.bottomRight.y * scale);
    const m4 = 0.551784;

    canvas.moveTo(x, bottom + bl.y);
    canvas.curveTo(x, bottom + bl.y * (1 - m4), x + bl.x * (1 - m4), bottom, x + bl.x, bottom);
    canvas.lineTo(x + width - br.x, bottom);
    canvas.curveTo(x + width - br.x * (1 - m4), bottom, x + width, bottom + br.y * (1 - m4), x + width, bottom + br.y);
    canvas.lineTo(x + width, bottom + height - tr.y);
    canvas.curveTo(x + width, bottom + height - tr.y * (1 - m4), x + width - tr.x * (1 - m4), bottom + height, x + width - tr.x, bottom + height);
    canvas.lineTo(x + tl.x, bottom + height);
    canvas.curveTo(x + tl.x * (1 - m4), bottom + height, x, bottom + height - tl.y * (1 - m4), x, bottom + height - tl.y);
    canvas.lineTo(x, bottom + bl.y);
    canvas.closePath();
  }
}

export interface BorderRadiusDirectionalOnlyOptions {
  readonly topStart?: RadiusValue;
  readonly topEnd?: RadiusValue;
  readonly bottomStart?: RadiusValue;
  readonly bottomEnd?: RadiusValue;
}

/** Direction-aware radii, resolved when decoration is painted. */
export class BorderRadiusDirectional extends BorderRadiusGeometry {
  static readonly zero = BorderRadiusDirectional.all(0);

  readonly topStart: Radius;
  readonly topEnd: Radius;
  readonly bottomStart: Radius;
  readonly bottomEnd: Radius;

  constructor({
    topStart = Radius.zero,
    topEnd = Radius.zero,
    bottomStart = Radius.zero,
    bottomEnd = Radius.zero
  }: BorderRadiusDirectionalOnlyOptions = {}) {
    super();
    this.topStart = radius(topStart);
    this.topEnd = radius(topEnd);
    this.bottomStart = radius(bottomStart);
    this.bottomEnd = radius(bottomEnd);
  }

  static all(value: RadiusValue): BorderRadiusDirectional {
    const resolved = radius(value);
    return new BorderRadiusDirectional({
      topStart: resolved,
      topEnd: resolved,
      bottomStart: resolved,
      bottomEnd: resolved
    });
  }

  static circular(value: number): BorderRadiusDirectional {
    return BorderRadiusDirectional.all(value);
  }

  static vertical({
    top = Radius.zero,
    bottom = Radius.zero
  }: {
    readonly top?: RadiusValue;
    readonly bottom?: RadiusValue;
  } = {}): BorderRadiusDirectional {
    return new BorderRadiusDirectional({ topStart: top, topEnd: top, bottomStart: bottom, bottomEnd: bottom });
  }

  static horizontal({
    start = Radius.zero,
    end = Radius.zero
  }: {
    readonly start?: RadiusValue;
    readonly end?: RadiusValue;
  } = {}): BorderRadiusDirectional {
    return new BorderRadiusDirectional({ topStart: start, bottomStart: start, topEnd: end, bottomEnd: end });
  }

  static only(options: BorderRadiusDirectionalOnlyOptions = {}): BorderRadiusDirectional {
    return new BorderRadiusDirectional(options);
  }

  override get isUniform(): boolean {
    return this.topStart.equals(this.topEnd)
      && this.topStart.equals(this.bottomStart)
      && this.topStart.equals(this.bottomEnd);
  }

  override get uniform(): Radius {
    return this.isUniform ? this.topStart : Radius.zero;
  }

  override resolve(direction: TextDirection | null = 'ltr'): BorderRadius {
    if (direction === 'rtl') {
      return new BorderRadius({
        topLeft: this.topEnd,
        topRight: this.topStart,
        bottomLeft: this.bottomEnd,
        bottomRight: this.bottomStart
      });
    }
    return new BorderRadius({
      topLeft: this.topStart,
      topRight: this.topEnd,
      bottomLeft: this.bottomStart,
      bottomRight: this.bottomEnd
    });
  }
}
