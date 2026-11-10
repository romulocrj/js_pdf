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
 *   - pdf/lib/src/svg/group.dart
 *   - pdf/lib/src/svg/symbol.dart
 *
 * A group, and the three elements that are a group with a viewport of their
 * own: a nested `<svg>`, a `<symbol>` instanced by `<use>`, and an `<svg>`
 * instanced by `<use>`. Upstream PR #1980 adds those viewports in
 * `nested_svg.dart` and `viewbox.dart`; the port keeps them as one optional
 * field here plus `viewBoxTransform`, rather than translating both files.
 * The root `<svg>` has no viewport here: `SvgImage` fits it with `BoxFit`.
 */

import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfMatrix } from '../pdf/matrix.ts';
import { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { getNumeric, parseViewBox } from './parser.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';

/** `<use>`'s `width` and `height`, which override the instanced element's. */
export interface SvgViewportSize {
  readonly width?: number | null;
  readonly height?: number | null;
}

interface SvgViewport {
  /** The viewport rectangle in the group's user space; the content is clipped to it. */
  readonly box: PdfRect;
  /** The viewBox fitted into `box`. */
  readonly matrix: PdfMatrix;
}

const ALIGN: Readonly<Record<string, number>> = Object.freeze({ Min: 0, Mid: 0.5, Max: 1 });

/**
 * The transform that fits `viewBox` into `viewport` per `preserveAspectRatio`
 * (SVG 1.1 7.8): `none`, or one of the nine `x…Y…` alignments with `meet`
 * (the default) or `slice`. Anything unreadable means `xMidYMid meet`.
 */
export function viewBoxTransform(viewport: PdfRect, viewBox: PdfRect | null, preserveAspectRatio: string | null): PdfMatrix {
  if (viewBox === null) {
    return [1, 0, 0, 1, viewport.x, viewport.y];
  }
  const words = (preserveAspectRatio ?? '').trim().split(/\s+/).filter(word => word !== 'defer');
  let sx = viewport.width / viewBox.width;
  let sy = viewport.height / viewBox.height;
  let ax = 0.5;
  let ay = 0.5;
  if (words[0] !== 'none') {
    const align = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.exec(words[0] ?? '');
    ax = ALIGN[align?.[1] ?? 'Mid']!;
    ay = ALIGN[align?.[2] ?? 'Mid']!;
    sx = sy = align !== null && words[1] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
  }
  return [
    sx, 0, 0, sy,
    viewport.x + (viewport.width - viewBox.width * sx) * ax - viewBox.x * sx,
    viewport.y + (viewport.height - viewBox.height * sy) * ay - viewBox.y * sy
  ];
}

export class SvgGroup extends SvgOperation {
  readonly children: readonly SvgOperation[];
  readonly viewport: SvgViewport | null;

  constructor(
    children: readonly SvgOperation[],
    brush: SvgBrush,
    clip: SvgClipPath,
    transform: SvgTransform,
    painter: SvgPainter,
    viewport: SvgViewport | null = null
  ) {
    super(brush, clip, transform, painter);
    this.children = children;
    this.viewport = viewport;
  }

  /**
   * `size` non-null makes `element` establish a viewport: its `x`, `y`,
   * `width` and `height` (`size` overriding the last two, a missing one being
   * 100% of the parent viewport), fitted with its `viewBox`. Upstream dropped a
   * nested `<svg>` and ignored `<symbol viewBox>` and `<use width height>`.
   */
  static fromXml(
    element: XmlElement,
    painter: SvgPainter,
    parent: SvgBrush,
    size: SvgViewportSize | null = null
  ): SvgGroup {
    let brush = SvgBrush.fromXml(element, parent, painter.parser);
    let viewport: SvgViewport | null = null;

    if (size !== null) {
      const outer = brush.viewport ?? PdfRect.zero;
      const length = (name: string, axis: 'x' | 'y', fallback: number): number =>
        getNumeric(element, name, brush)?.lengthIn(axis) ?? fallback;
      const box = {
        x: length('x', 'x', 0),
        y: length('y', 'y', 0),
        width: size.width ?? length('width', 'x', outer.width),
        height: size.height ?? length('height', 'y', outer.height)
      };
      // A zero-sized viewport disables rendering (SVG 1.1 5.1.2, 5.6).
      if (box.width <= 0 || box.height <= 0) {
        return new SvgGroup([], brush, SvgClipPath.empty, SvgTransform.none, painter);
      }
      const viewBox = parseViewBox(element.getAttribute('viewBox'));
      viewport = { box, matrix: viewBoxTransform(box, viewBox, element.getAttribute('preserveAspectRatio')) };
      // Percentages inside are fractions of the new viewport.
      brush = brush.copyWith({ viewport: viewBox ?? box });
    }

    const children: SvgOperation[] = [];
    for (const child of element.elements) {
      const operation = painter.operationFromXml(child, brush);
      if (operation !== null) {
        children.push(operation);
      }
    }

    return new SvgGroup(
      children,
      brush,
      SvgClipPath.fromXml(element, painter, brush),
      SvgTransform.fromXml(element),
      painter,
      viewport
    );
  }

  protected paintShape(canvas: PdfCanvas): void {
    if (this.viewport !== null) {
      // overflow: hidden is the initial value for a viewport element.
      canvas.drawBox(this.viewport.box);
      canvas.clipPath();
      canvas.setTransform(this.viewport.matrix);
    }
    for (const child of this.children) {
      child.paint(canvas);
    }
  }

  protected drawShape(canvas: PdfCanvas): void {
    // Inside a clip path only the geometry counts, so no nested clip here.
    if (this.viewport !== null) {
      canvas.setTransform(this.viewport.matrix);
    }
    for (const child of this.children) {
      child.draw(canvas);
    }
  }

  boundingBox(): PdfRect {
    if (this.children.length === 0) {
      return PdfRect.zero;
    }

    let left = Infinity;
    let bottom = Infinity;
    let right = -Infinity;
    let top = -Infinity;

    for (const child of this.children) {
      const box = child.boundingBox();
      left = Math.min(left, PdfRect.left(box));
      bottom = Math.min(bottom, PdfRect.bottom(box));
      right = Math.max(right, PdfRect.right(box));
      top = Math.max(top, PdfRect.top(box));
    }

    // A viewport matrix only scales and translates, so the box maps directly.
    const [sx, , , sy, tx, ty] = this.viewport?.matrix ?? [1, 0, 0, 1, 0, 0];
    return PdfRect.fromLTRB(left * sx + tx, bottom * sy + ty, right * sx + tx, top * sy + ty);
  }
}
