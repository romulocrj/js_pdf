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
 *   - pdf/lib/src/widgets/clip.dart
 *
 * Upstream translates mutable child boxes before paint. The port's positioned
 * layout box already supplies absolute widget coordinates, so each clip simply
 * scopes a path around painting the immutable child result.
 */

import { BorderRadius, Radius } from './border_radius.ts';
import { BoxConstraints } from './geometry.ts';
import { Widget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export interface ClipWidgetOptions {
  readonly child?: AnyWidget | null;
}

export interface ClipRRectOptions extends ClipWidgetOptions {
  readonly horizontalRadius?: number;
  readonly verticalRadius?: number;
}

export interface ClipLayoutData {
  readonly childBox: AnyLayoutBox | null;
}

abstract class ClipWidget extends Widget<ClipLayoutData> {
  readonly child: AnyWidget | null;

  constructor({ child = null }: ClipWidgetOptions = {}) {
    super();
    this.child = child;
  }

  protected abstract appendClip(context: RenderContext, box: PositionedBox<ClipLayoutData>): void;

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<ClipLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const childBox = this.child?.layout(context, parent) ?? null;
    const size = parent.constrain(childBox ?? parent.smallest);
    return { widget: this, width: size.width, height: size.height, data: { childBox } };
  }

  override paint(context: RenderContext, box: PositionedBox<ClipLayoutData>): void {
    const { childBox } = box.data;
    if (childBox === null) return;
    context.canvas.saveContext();
    this.appendClip(context, box);
    context.canvas.clipPath();
    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
    context.canvas.restoreContext();
  }
}

export class ClipRect extends ClipWidget {
  protected override appendClip(context: RenderContext, box: PositionedBox<ClipLayoutData>): void {
    context.canvas.drawRect(
      box.x,
      context.canvas.pageHeight - box.y - box.height,
      box.width,
      box.height
    );
  }
}

export class ClipRRect extends ClipWidget {
  readonly horizontalRadius: number;
  readonly verticalRadius: number;

  constructor({
    child = null,
    horizontalRadius = 0,
    verticalRadius = 0
  }: ClipRRectOptions = {}) {
    super({ child });
    this.horizontalRadius = Math.max(0, Number(horizontalRadius));
    this.verticalRadius = Math.max(0, Number(verticalRadius));
  }

  protected override appendClip(context: RenderContext, box: PositionedBox<ClipLayoutData>): void {
    BorderRadius.all(new Radius(this.horizontalRadius, this.verticalRadius)).paint(
      context.canvas,
      box.x,
      box.y,
      box.width,
      box.height
    );
  }
}

export class ClipOval extends ClipWidget {
  protected override appendClip(context: RenderContext, box: PositionedBox<ClipLayoutData>): void {
    context.canvas.drawEllipse(
      box.x + box.width / 2,
      context.canvas.pageHeight - box.y - box.height / 2,
      box.width / 2,
      box.height / 2
    );
  }
}
