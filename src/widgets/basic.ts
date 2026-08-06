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
 *   - pdf/lib/src/widgets/basic.dart
 *   - pdf/lib/src/widgets/geometry.dart
 *
 * The composition and constraint widgets from upstream's `basic.dart`.
 */

import { assertFiniteNumber } from '../base/assert.ts';
import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import { PdfGraphicState } from '../pdf/graphic_state.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import {
  flipMatrix,
  identityMatrix,
  multiplyMatrix,
  rotationMatrix,
  scaleMatrix,
  transformPoint,
  translationMatrix
} from '../pdf/matrix.ts';
import type { PdfMatrix } from '../pdf/matrix.ts';
import type { PdfPoint } from '../pdf/rect.ts';
import {
  Alignment,
  BoxConstraints,
  inscribe,
  insetsHorizontal,
  insetsVertical,
  normalizeInsets
} from './geometry.ts';
import type { BoxConstraintsInput, Insets, InsetsInput, Offset } from './geometry.ts';
import type { BoxFit } from './svg.ts';
import { BorderSide } from './box_border.ts';
import type { BorderStyle, BorderStyleInput } from './box_border.ts';
import { StatelessWidget, Widget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext,
  StatelessLayoutData
} from './widget.ts';

/** What a widget with one optional child hands from `layout` to `paint`. */
export interface SingleChildLayoutData {
  readonly childBox: AnyLayoutBox | null;
}

export interface PaddingOptions {
  readonly padding?: InsetsInput;
  readonly child?: AnyWidget | null;
}

/** Insets its child by `padding`, growing by that much in each direction. */
export class Padding extends Widget<SingleChildLayoutData> {
  readonly padding: Insets;
  readonly child: AnyWidget | null;

  constructor({ padding = 0, child = null }: PaddingOptions = {}) {
    super();
    this.padding = normalizeInsets(padding);
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const horizontal = insetsHorizontal(this.padding);
    const vertical = insetsVertical(this.padding);

    if (this.child === null) {
      const size = parent.constrain({ width: horizontal, height: vertical });
      return {
        widget: this,
        width: size.width,
        height: size.height,
        data: { childBox: null }
      };
    }

    const childBox = this.child.layout(context, parent.deflate(this.padding));
    const size = parent.constrain({
      width: childBox.width + horizontal,
      height: childBox.height + vertical
    });

    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void {
    const { childBox } = box.data;
    if (childBox === null) return;

    childBox.widget.paint(context, {
      ...childBox,
      x: box.x + this.padding.left,
      y: box.y + this.padding.top
    });
  }
}

/** `Align` places its child, so it carries the child's offset within its box. */
export interface AlignLayoutData extends SingleChildLayoutData {
  readonly dx: number;
  readonly dy: number;
}

export type BasicAlignmentName =
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'centerLeft'
  | 'center'
  | 'centerRight'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight';

export type BasicAlignmentInput = Alignment | BasicAlignmentName;

export function resolveBasicAlignment(value: BasicAlignmentInput): Alignment {
  if (typeof value !== 'string') return value;
  const result = Alignment[value];
  if (result === undefined) throw new TypeError(`Unknown alignment: ${value}`);
  return result;
}

export interface AlignOptions {
  readonly alignment?: BasicAlignmentInput;
  readonly widthFactor?: number | null;
  readonly heightFactor?: number | null;
  readonly child?: AnyWidget | null;
}

/**
 * Positions its child inside itself according to `alignment`.
 *
 * Sizing follows upstream: an axis shrink-wraps when it has a factor or an
 * unbounded maximum, and otherwise fills the available extent.
 */
export class Align extends Widget<AlignLayoutData> {
  readonly alignment: Alignment;
  readonly widthFactor: number | null;
  readonly heightFactor: number | null;
  readonly child: AnyWidget | null;

  constructor({
    alignment = Alignment.center,
    widthFactor = null,
    heightFactor = null,
    child = null
  }: AlignOptions = {}) {
    super();
    this.alignment = resolveBasicAlignment(alignment);
    this.widthFactor = widthFactor;
    this.heightFactor = heightFactor;
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<AlignLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const shrinkWidth = this.widthFactor !== null || !parent.hasBoundedWidth;
    const shrinkHeight = this.heightFactor !== null || !parent.hasBoundedHeight;
    if (this.child === null) {
      const size = parent.constrain({
        width: shrinkWidth ? 0 : Infinity,
        height: shrinkHeight ? 0 : Infinity
      });
      return {
        widget: this,
        width: size.width,
        height: size.height,
        data: { childBox: null, dx: 0, dy: 0 }
      };
    }

    const childBox = this.child.layout(context, parent.loosen());
    const size = parent.constrain({
      width: shrinkWidth ? childBox.width * (this.widthFactor ?? 1) : Infinity,
      height: shrinkHeight ? childBox.height * (this.heightFactor ?? 1) : Infinity
    });

    const offset = inscribe(this.alignment, childBox.width, childBox.height, size.width, size.height);

    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox, dx: offset.dx, dy: offset.dy }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<AlignLayoutData>): void {
    const { childBox, dx, dy } = box.data;
    if (childBox === null) return;

    childBox.widget.paint(context, { ...childBox, x: box.x + dx, y: box.y + dy });
  }
}

export interface ConstrainedBoxOptions {
  readonly constraints: BoxConstraints | BoxConstraintsInput;
  readonly child?: AnyWidget | null;
}

/** Imposes additional minimum and maximum dimensions on its child. */
export class ConstrainedBox extends Widget<SingleChildLayoutData> {
  readonly constraints: BoxConstraints;
  readonly child: AnyWidget | null;

  constructor({ constraints, child = null }: ConstrainedBoxOptions) {
    super();
    this.constraints = BoxConstraints.from(constraints);
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData> {
    const enforced = this.constraints.enforce(BoxConstraints.from(constraints));
    const childBox = this.child?.layout(context, enforced) ?? null;
    const size = childBox === null ? enforced.smallest : enforced.constrain(childBox);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void {
    const { childBox } = box.data;
    childBox?.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

export interface CenterOptions {
  readonly widthFactor?: number | null;
  readonly heightFactor?: number | null;
  readonly child?: AnyWidget | null;
}

/** `Align` fixed to the centre, exactly as upstream defines it. */
export class Center extends Align {
  constructor({ widthFactor = null, heightFactor = null, child = null }: CenterOptions = {}) {
    super({ alignment: Alignment.center, widthFactor, heightFactor, child });
  }
}

export interface SizedBoxOptions {
  readonly width?: number | null;
  readonly height?: number | null;
  readonly child?: AnyWidget | null;
}

/** A box that tightens either stated dimension around its child. */
export class SizedBox extends Widget<SingleChildLayoutData> {
  readonly width: number | null;
  readonly height: number | null;
  readonly child: AnyWidget | null;

  constructor({ width = null, height = null, child = null }: SizedBoxOptions = {}) {
    super();
    this.width = width === null ? null : Number(width);
    this.height = height === null ? null : Number(height);
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData> {
    const tight = BoxConstraints.from(constraints).tighten({
      width: this.width,
      height: this.height
    });
    const childBox = this.child === null
      ? null
      : this.child.layout(context, tight);
    const size = childBox === null ? tight.smallest : tight.constrain(childBox);

    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void {
    const { childBox } = box.data;
    if (childBox === null) return;

    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

export interface DividerOptions {
  readonly height?: number;
  readonly thickness?: number;
  readonly indent?: number;
  readonly endIndent?: number;
  readonly color?: ColorInput;
  readonly borderStyle?: BorderStyleInput;
}

export const DEFAULT_DIVIDER_HEIGHT = 16;
export const DEFAULT_DIVIDER_THICKNESS = 1;

/**
 * A horizontal rule: a `thickness`-tall line centred in a `height`-tall box,
 * inset by `indent` at the leading edge and `endIndent` at the trailing one.
 *
 * Upstream composes this out of `SizedBox` + `Center` + `Container` +
 * `BoxDecoration` + `Border` + `BorderSide`. The port keeps the equivalent
 * direct fill because it is a smaller layout tree and emits the same rule.
 */
export class Divider extends Widget<null> {
  readonly height: number;
  readonly thickness: number;
  readonly indent: number;
  readonly endIndent: number;
  readonly color: Rgb;
  readonly borderStyle: BorderStyle;

  constructor({
    height = DEFAULT_DIVIDER_HEIGHT,
    thickness = DEFAULT_DIVIDER_THICKNESS,
    indent = 0,
    endIndent = 0,
    color = '#000000',
    borderStyle = 'solid'
  }: DividerOptions = {}) {
    super();
    this.height = Math.max(0, Number(height));
    this.thickness = Math.max(0, Number(thickness));
    this.indent = Math.max(0, Number(indent));
    this.endIndent = Math.max(0, Number(endIndent));
    this.color = normalizeColor(color);
    this.borderStyle = new BorderSide({ style: borderStyle }).style;
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const size = BoxConstraints.from(constraints).constrain({
      width: Infinity,
      height: this.height
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }

  override paint(context: RenderContext, box: PositionedBox<null>): void {
    const width = Math.max(0, box.width - this.indent - this.endIndent);
    if (width === 0 || this.thickness === 0 || !this.borderStyle.paint) return;

    const pattern = this.borderStyle.pattern;
    if (pattern !== null && pattern.length > 0) {
      let cursor = -this.borderStyle.phase;
      let index = 0;
      while (cursor < width) {
        const segment = Math.max(0, pattern[index % pattern.length] ?? 0);
        if (index % 2 === 0 && segment > 0) {
          const start = Math.max(0, cursor);
          const end = Math.min(width, cursor + segment);
          if (end > start) {
            context.canvas.fillRect(
              box.x + this.indent + start,
              box.y + (box.height - this.thickness) / 2,
              end - start,
              this.thickness,
              this.color
            );
          }
        }
        cursor += segment;
        index++;
        if (segment === 0 && index >= pattern.length) break;
      }
      return;
    }

    context.canvas.fillRect(
      box.x + this.indent,
      box.y + (box.height - this.thickness) / 2,
      width,
      this.thickness,
      this.color
    );
  }
}

function finiteMatrix(value: PdfMatrix): PdfMatrix {
  const values = value.map((entry, index) =>
    assertFiniteNumber(Number(entry), `transform[${index}]`)
  );
  if (values.length !== 6) throw new TypeError('transform must contain six numbers');
  return [values[0]!, values[1]!, values[2]!, values[3]!, values[4]!, values[5]!];
}

export interface TransformOptions {
  readonly transform?: PdfMatrix | null;
  readonly rotate?: number | null;
  readonly rotateBox?: number | null;
  readonly translate?: PdfPoint | Offset | null;
  readonly scale?: number | null;
  readonly origin?: PdfPoint | Offset | null;
  readonly alignment?: BasicAlignmentInput | null;
  readonly adjustLayout?: boolean;
  readonly unconstrained?: boolean;
  readonly child?: AnyWidget | null;
}

export interface TransformLayoutData extends SingleChildLayoutData {
  readonly layoutDx: number;
  readonly layoutDy: number;
}

function pointCoordinates(value: PdfPoint | Offset | null): { readonly x: number; readonly y: number } {
  if (value === null) return { x: 0, y: 0 };
  if ('dx' in value) return { x: value.dx, y: value.dy };
  return value;
}

/** Paints its child through a six-cell affine transform. */
export class Transform extends Widget<TransformLayoutData> {
  readonly transform: PdfMatrix;
  readonly origin: { readonly x: number; readonly y: number };
  readonly alignment: Alignment | null;
  readonly adjustLayout: boolean;
  readonly unconstrained: boolean;
  readonly child: AnyWidget | null;

  constructor({
    transform = null,
    rotate = null,
    rotateBox = null,
    translate = null,
    scale = null,
    origin = null,
    alignment = undefined,
    adjustLayout = false,
    unconstrained = false,
    child = null
  }: TransformOptions = {}) {
    super();
    const transformCount = [transform, rotate, rotateBox, translate, scale]
      .filter(value => value !== null).length;
    if (transformCount > 1) {
      throw new TypeError('Transform accepts one transform, rotate, rotateBox, translate or scale');
    }

    if (transform !== null) {
      this.transform = finiteMatrix(transform);
    } else if (rotateBox !== null) {
      this.transform = rotationMatrix(-assertFiniteNumber(Number(rotateBox), 'rotateBox'));
    } else if (rotate !== null) {
      this.transform = rotationMatrix(-assertFiniteNumber(Number(rotate), 'rotate'));
    } else if (translate !== null) {
      const offset = pointCoordinates(translate);
      this.transform = translationMatrix(offset.x, offset.y);
    } else if (scale !== null) {
      this.transform = scaleMatrix(assertFiniteNumber(Number(scale), 'scale'));
    } else {
      this.transform = identityMatrix;
    }

    this.origin = pointCoordinates(origin);
    const defaultAlignment = rotate !== null || scale !== null ? Alignment.center : null;
    this.alignment = alignment === undefined
      ? defaultAlignment
      : alignment === null
        ? null
        : resolveBasicAlignment(alignment);
    this.adjustLayout = rotateBox !== null ? true : Boolean(adjustLayout);
    this.unconstrained = Boolean(unconstrained);
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<TransformLayoutData> {
    const parent = BoxConstraints.from(constraints);
    if (this.child === null) {
      const size = parent.smallest;
      return {
        widget: this,
        width: size.width,
        height: size.height,
        data: { childBox: null, layoutDx: 0, layoutDy: 0 }
      };
    }

    const childBox = this.child.layout(
      context,
      this.adjustLayout && this.unconstrained ? new BoxConstraints() : parent
    );
    if (!this.adjustLayout) {
      const size = parent.constrain(childBox);
      return {
        widget: this,
        width: size.width,
        height: size.height,
        data: { childBox, layoutDx: 0, layoutDy: 0 }
      };
    }

    const corners = [
      transformPoint(this.transform, 0, 0),
      transformPoint(this.transform, childBox.width, 0),
      transformPoint(this.transform, childBox.width, childBox.height),
      transformPoint(this.transform, 0, childBox.height)
    ];
    const minimumX = Math.min(...corners.map(point => point.x));
    const maximumX = Math.max(...corners.map(point => point.x));
    const minimumY = Math.min(...corners.map(point => point.y));
    const maximumY = Math.max(...corners.map(point => point.y));

    const size = parent.constrain({
      width: maximumX - minimumX,
      height: maximumY - minimumY
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox, layoutDx: -minimumX, layoutDy: -minimumY }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<TransformLayoutData>): void {
    const { childBox, layoutDx, layoutDy } = box.data;
    if (childBox === null) return;

    let widgetMatrix: PdfMatrix;
    if (this.adjustLayout) {
      widgetMatrix = multiplyMatrix(
        translationMatrix(box.x + layoutDx, box.y + layoutDy),
        multiplyMatrix(this.transform, translationMatrix(-box.x, -box.y))
      );
    } else {
      const alignedX = this.alignment === null ? 0 : (this.alignment.x + 1) * box.width / 2;
      const alignedY = this.alignment === null ? 0 : (1 - this.alignment.y) * box.height / 2;
      const anchorX = box.x + alignedX + this.origin.x;
      const anchorY = box.y + alignedY + this.origin.y;
      widgetMatrix = multiplyMatrix(
        translationMatrix(anchorX, anchorY),
        multiplyMatrix(this.transform, translationMatrix(-anchorX, -anchorY))
      );
    }

    context.canvas.saveContext();
    context.canvas.setTransform(flipMatrix(widgetMatrix, context.canvas.pageHeight));
    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
    context.canvas.restoreContext();
  }
}

export interface OpacityOptions {
  readonly opacity: number;
  readonly child?: AnyWidget | null;
}

export class Opacity extends Widget<SingleChildLayoutData> {
  readonly opacity: number;
  readonly child: AnyWidget | null;

  constructor({ opacity, child = null }: OpacityOptions) {
    super();
    const value = assertFiniteNumber(Number(opacity), 'opacity');
    if (value < 0 || value > 1) throw new RangeError('opacity must be between 0 and 1');
    this.opacity = value;
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData> {
    const childBox = this.child?.layout(context, constraints) ?? null;
    const size = BoxConstraints.from(constraints).constrain(childBox ?? { width: 0, height: 0 });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void {
    const { childBox } = box.data;
    if (childBox === null || this.opacity === 0 && childBox.width === 0 && childBox.height === 0) return;
    context.canvas.saveContext();
    context.canvas.setGraphicState(new PdfGraphicState({ opacity: this.opacity }));
    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
    context.canvas.restoreContext();
  }
}

export interface FitSize {
  readonly width: number;
  readonly height: number;
}

export interface FitResult {
  readonly source: FitSize;
  readonly destination: FitSize;
}

export function applyBoxFit(fit: BoxFit, input: FitSize, output: FitSize): FitResult {
  const { width: iw, height: ih } = input;
  const { width: ow, height: oh } = output;
  if (iw <= 0 || ih <= 0 || ow <= 0 || oh <= 0) {
    const zero = { width: 0, height: 0 };
    return { source: zero, destination: zero };
  }
  if (fit === 'fill') return { source: input, destination: output };
  if (fit === 'contain' || fit === 'scaleDown') {
    const factor = Math.min(fit === 'scaleDown' ? 1 : Number.POSITIVE_INFINITY, ow / iw, oh / ih);
    return { source: input, destination: { width: iw * factor, height: ih * factor } };
  }
  if (fit === 'cover') {
    const factor = Math.max(ow / iw, oh / ih);
    return { source: { width: ow / factor, height: oh / factor }, destination: output };
  }
  if (fit === 'fitWidth') {
    const factor = ow / iw;
    const height = ih * factor;
    return height > oh
      ? { source: { width: iw, height: oh / factor }, destination: output }
      : { source: input, destination: { width: ow, height } };
  }
  if (fit === 'fitHeight') {
    const factor = oh / ih;
    const width = iw * factor;
    return width > ow
      ? { source: { width: ow / factor, height: ih }, destination: output }
      : { source: input, destination: { width, height: oh } };
  }
  if (fit === 'none') {
    const value = { width: Math.min(iw, ow), height: Math.min(ih, oh) };
    return { source: value, destination: value };
  }
  throw new TypeError(`Unknown BoxFit: ${fit}`);
}

export interface FittedBoxOptions {
  readonly fit?: BoxFit;
  readonly alignment?: BasicAlignmentInput;
  readonly child?: AnyWidget | null;
}

export interface FittedBoxLayoutData extends SingleChildLayoutData {}

export class FittedBox extends Widget<FittedBoxLayoutData> {
  readonly fit: BoxFit;
  readonly alignment: Alignment;
  readonly child: AnyWidget | null;

  constructor({ fit = 'contain', alignment = 'center', child = null }: FittedBoxOptions = {}) {
    super();
    // Validate eagerly, including a zero-size probe.
    applyBoxFit(fit, { width: 1, height: 1 }, { width: 1, height: 1 });
    this.fit = fit;
    this.alignment = resolveBasicAlignment(alignment);
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<FittedBoxLayoutData> {
    const parent = BoxConstraints.from(constraints);
    if (this.child === null) {
      const size = parent.smallest;
      return {
        widget: this,
        width: size.width,
        height: size.height,
        data: { childBox: null }
      };
    }
    const childBox = this.child.layout(context, new BoxConstraints());
    const size = parent.constrainSizeAndAttemptToPreserveAspectRatio(childBox);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<FittedBoxLayoutData>): void {
    const { childBox } = box.data;
    if (childBox === null || childBox.width <= 0 || childBox.height <= 0) return;
    const fitted = applyBoxFit(
      this.fit,
      { width: childBox.width, height: childBox.height },
      { width: box.width, height: box.height }
    );
    if (fitted.source.width <= 0 || fitted.source.height <= 0) return;
    const sourceOffset = inscribe(
      this.alignment,
      fitted.source.width,
      fitted.source.height,
      childBox.width,
      childBox.height
    );
    const destinationOffset = inscribe(
      this.alignment,
      fitted.destination.width,
      fitted.destination.height,
      box.width,
      box.height
    );
    const scaleX = fitted.destination.width / fitted.source.width;
    const scaleY = fitted.destination.height / fitted.source.height;
    const widgetMatrix = multiplyMatrix(
      translationMatrix(box.x + destinationOffset.dx, box.y + destinationOffset.dy),
      multiplyMatrix(
        scaleMatrix(scaleX, scaleY),
        translationMatrix(-box.x - sourceOffset.dx, -box.y - sourceOffset.dy)
      )
    );

    context.canvas.saveContext();
    context.canvas.drawRect(
      box.x,
      context.canvas.pageHeight - box.y - box.height,
      box.width,
      box.height
    );
    context.canvas.clipPath();
    context.canvas.setTransform(flipMatrix(widgetMatrix, context.canvas.pageHeight));
    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
    context.canvas.restoreContext();
  }
}

export interface AspectRatioOptions {
  readonly aspectRatio: number;
  readonly child?: AnyWidget | null;
}

export class AspectRatio extends Widget<SingleChildLayoutData> {
  readonly aspectRatio: number;
  readonly child: AnyWidget | null;

  constructor({ aspectRatio, child = null }: AspectRatioOptions) {
    super();
    const value = assertFiniteNumber(Number(aspectRatio), 'aspectRatio');
    if (value <= 0) throw new RangeError('aspectRatio must be greater than zero');
    this.aspectRatio = value;
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData> {
    const parent = BoxConstraints.from(constraints);
    let size: { readonly width: number; readonly height: number };
    if (parent.isTight) {
      size = parent.smallest;
    } else {
      let width = parent.maxWidth;
      let height: number;
      if (Number.isFinite(width)) {
        height = width / this.aspectRatio;
      } else {
        height = parent.maxHeight;
        width = height * this.aspectRatio;
      }
      if (width > parent.maxWidth) {
        width = parent.maxWidth;
        height = width / this.aspectRatio;
      }
      if (height > parent.maxHeight) {
        height = parent.maxHeight;
        width = height * this.aspectRatio;
      }
      if (width < parent.minWidth) {
        width = parent.minWidth;
        height = width / this.aspectRatio;
      }
      if (height < parent.minHeight) {
        height = parent.minHeight;
        width = height * this.aspectRatio;
      }
      size = parent.constrain({ width, height });
    }
    const childBox = this.child?.layout(context, BoxConstraints.tight(size)) ?? null;
    return { widget: this, width: size.width, height: size.height, data: { childBox } };
  }

  override paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void {
    const { childBox } = box.data;
    childBox?.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

export type WidgetBuilder = (context: RenderContext) => AnyWidget;

export interface BuilderOptions {
  readonly builder: WidgetBuilder;
}

export class Builder extends StatelessWidget {
  readonly builder: WidgetBuilder;

  constructor({ builder }: BuilderOptions) {
    super();
    if (typeof builder !== 'function') throw new TypeError('Builder.builder must be a function');
    this.builder = builder;
  }

  override build(context: RenderContext): AnyWidget {
    return this.builder(context);
  }
}

export type LayoutWidgetBuilder = (context: RenderContext, constraints: Constraints) => AnyWidget;

export interface LayoutBuilderOptions {
  readonly builder: LayoutWidgetBuilder;
}

export class LayoutBuilder extends Widget<StatelessLayoutData> {
  readonly builder: LayoutWidgetBuilder;

  constructor({ builder }: LayoutBuilderOptions) {
    super();
    if (typeof builder !== 'function') throw new TypeError('LayoutBuilder.builder must be a function');
    this.builder = builder;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<StatelessLayoutData> {
    const childBox = this.builder(context, constraints).layout(context, constraints);
    return { widget: this, width: childBox.width, height: childBox.height, data: { childBox } };
  }

  override paint(context: RenderContext, box: PositionedBox<StatelessLayoutData>): void {
    const { childBox } = box.data;
    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

export type CustomPainter = (canvas: PdfCanvas, size: PdfPoint) => void;

export interface CustomPaintOptions {
  readonly painter?: CustomPainter | null;
  readonly foregroundPainter?: CustomPainter | null;
  readonly size?: PdfPoint;
  readonly child?: AnyWidget | null;
}

export class CustomPaint extends Widget<SingleChildLayoutData> {
  readonly painter: CustomPainter | null;
  readonly foregroundPainter: CustomPainter | null;
  readonly size: PdfPoint;
  readonly child: AnyWidget | null;

  constructor({
    painter = null,
    foregroundPainter = null,
    size = { x: 0, y: 0 },
    child = null
  }: CustomPaintOptions = {}) {
    super();
    this.painter = painter;
    this.foregroundPainter = foregroundPainter;
    this.size = size;
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData> {
    const childBox = this.child?.layout(context, constraints) ?? null;
    const size = BoxConstraints.from(constraints).constrain(
      childBox ?? { width: Math.max(0, this.size.x), height: Math.max(0, this.size.y) }
    );
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox }
    };
  }

  private paintWithLocalCanvas(
    context: RenderContext,
    box: PositionedBox<SingleChildLayoutData>,
    painter: CustomPainter
  ): void {
    context.canvas.saveContext();
    context.canvas.setTransform([
      1,
      0,
      0,
      1,
      box.x,
      context.canvas.pageHeight - box.y - box.height
    ]);
    painter(context.canvas, { x: box.width, y: box.height });
    context.canvas.restoreContext();
  }

  override paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void {
    if (this.painter !== null) this.paintWithLocalCanvas(context, box, this.painter);
    const { childBox } = box.data;
    childBox?.widget.paint(context, { ...childBox, x: box.x, y: box.y });
    if (this.foregroundPainter !== null) {
      this.paintWithLocalCanvas(context, box, this.foregroundPainter);
    }
  }
}

export interface FullPageOptions {
  readonly ignoreMargins: boolean;
  readonly child?: AnyWidget | null;
}

export class FullPage extends Widget<SingleChildLayoutData> {
  readonly ignoreMargins: boolean;
  readonly child: AnyWidget | null;

  constructor({ ignoreMargins, child = null }: FullPageOptions) {
    super();
    this.ignoreMargins = Boolean(ignoreMargins);
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData> {
    const page = BoxConstraints.tight({
      width: context.pageFormat.width,
      height: context.pageFormat.height
    });
    const offered = this.ignoreMargins ? page : BoxConstraints.from(constraints);
    const size = offered.biggest;
    const childBox = this.child?.layout(context, offered) ?? null;
    const width = size.width;
    const height = size.height;
    return { widget: this, width, height, data: { childBox } };
  }

  override paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void {
    const { childBox } = box.data;
    if (childBox === null) return;
    const inverse = this.ignoreMargins ? context.canvas.getTransform() : identityMatrix;
    context.canvas.saveContext();
    if (this.ignoreMargins) {
      // The layer is normally already at the page origin. Applying the inverse
      // here also lets FullPage escape a transformed ancestor.
      const determinant = inverse[0] * inverse[3] - inverse[1] * inverse[2];
      if (determinant !== 0) {
        context.canvas.setTransform([
          inverse[3] / determinant,
          -inverse[1] / determinant,
          -inverse[2] / determinant,
          inverse[0] / determinant,
          (inverse[2] * inverse[5] - inverse[3] * inverse[4]) / determinant,
          (inverse[1] * inverse[4] - inverse[0] * inverse[5]) / determinant
        ]);
      }
    }
    childBox.widget.paint(context, {
      ...childBox,
      x: this.ignoreMargins ? 0 : box.x,
      y: (this.ignoreMargins ? 0 : box.y) + box.height - childBox.height
    });
    context.canvas.restoreContext();
  }
}

export interface LimitedBoxOptions {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly child?: AnyWidget | null;
}

export class LimitedBox extends Widget<SingleChildLayoutData> {
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly child: AnyWidget | null;

  constructor({
    maxWidth = Number.POSITIVE_INFINITY,
    maxHeight = Number.POSITIVE_INFINITY,
    child = null
  }: LimitedBoxOptions = {}) {
    super();
    this.maxWidth = Number(maxWidth);
    this.maxHeight = Number(maxHeight);
    if (this.maxWidth < 0 || this.maxHeight < 0 || Number.isNaN(this.maxWidth) || Number.isNaN(this.maxHeight)) {
      throw new RangeError('LimitedBox maxima must be non-negative numbers');
    }
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const limited = new BoxConstraints({
      minWidth: parent.minWidth,
      maxWidth: parent.hasBoundedWidth ? parent.maxWidth : parent.constrainWidth(this.maxWidth),
      minHeight: parent.minHeight,
      maxHeight: parent.hasBoundedHeight ? parent.maxHeight : parent.constrainHeight(this.maxHeight)
    });
    const childBox = this.child?.layout(context, limited) ?? null;
    const size = parent.constrain(childBox ?? limited.smallest);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void {
    const { childBox } = box.data;
    childBox?.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

export interface OverflowBoxOptions {
  readonly alignment?: BasicAlignmentInput;
  readonly minWidth?: number | null;
  readonly maxWidth?: number | null;
  readonly minHeight?: number | null;
  readonly maxHeight?: number | null;
  readonly child?: AnyWidget | null;
}

export interface OverflowBoxLayoutData extends SingleChildLayoutData {
  readonly dx: number;
  readonly dy: number;
}

/** Gives its child replacement constraints and permits it to exceed this box. */
export class OverflowBox extends Widget<OverflowBoxLayoutData> {
  readonly alignment: Alignment;
  readonly minWidth: number | null;
  readonly maxWidth: number | null;
  readonly minHeight: number | null;
  readonly maxHeight: number | null;
  readonly child: AnyWidget | null;

  constructor({
    alignment = 'center',
    minWidth = null,
    maxWidth = null,
    minHeight = null,
    maxHeight = null,
    child = null
  }: OverflowBoxOptions = {}) {
    super();
    this.alignment = resolveBasicAlignment(alignment);
    this.minWidth = minWidth === null ? null : Number(minWidth);
    this.maxWidth = maxWidth === null ? null : Number(maxWidth);
    this.minHeight = minHeight === null ? null : Number(minHeight);
    this.maxHeight = maxHeight === null ? null : Number(maxHeight);
    this.child = child;
    new BoxConstraints({
      minWidth: this.minWidth ?? 0,
      maxWidth: this.maxWidth ?? Infinity,
      minHeight: this.minHeight ?? 0,
      maxHeight: this.maxHeight ?? Infinity
    });
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<OverflowBoxLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const size = parent.smallest;
    const childBox = this.child?.layout(context, new BoxConstraints({
      minWidth: this.minWidth ?? parent.minWidth,
      maxWidth: this.maxWidth ?? parent.maxWidth,
      minHeight: this.minHeight ?? parent.minHeight,
      maxHeight: this.maxHeight ?? parent.maxHeight
    })) ?? null;
    const offset = childBox === null
      ? { dx: 0, dy: 0 }
      : inscribe(this.alignment, childBox.width, childBox.height, size.width, size.height);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox, dx: offset.dx, dy: offset.dy }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<OverflowBoxLayoutData>): void {
    const { childBox, dx, dy } = box.data;
    childBox?.widget.paint(context, { ...childBox, x: box.x + dx, y: box.y + dy });
  }
}

export interface VerticalDividerOptions {
  readonly width?: number;
  readonly thickness?: number;
  readonly indent?: number;
  readonly endIndent?: number;
  readonly color?: ColorInput;
}

export class VerticalDivider extends Widget<null> {
  readonly width: number;
  readonly thickness: number;
  readonly indent: number;
  readonly endIndent: number;
  readonly color: Rgb;

  constructor({
    width = DEFAULT_DIVIDER_HEIGHT,
    thickness = DEFAULT_DIVIDER_THICKNESS,
    indent = 0,
    endIndent = 0,
    color = '#000000'
  }: VerticalDividerOptions = {}) {
    super();
    this.width = Math.max(0, assertFiniteNumber(Number(width), 'divider width'));
    this.thickness = Math.max(0, assertFiniteNumber(Number(thickness), 'divider thickness'));
    this.indent = Math.max(0, assertFiniteNumber(Number(indent), 'divider indent'));
    this.endIndent = Math.max(0, assertFiniteNumber(Number(endIndent), 'divider endIndent'));
    this.color = normalizeColor(color);
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const size = BoxConstraints.from(constraints).constrain({
      width: this.width,
      height: Infinity
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }

  override paint(context: RenderContext, box: PositionedBox<null>): void {
    const height = Math.max(0, box.height - this.indent - this.endIndent);
    if (height === 0 || this.thickness === 0) return;
    context.canvas.fillRect(
      box.x + (box.width - this.thickness) / 2,
      box.y + this.indent,
      this.thickness,
      height,
      this.color
    );
  }
}
