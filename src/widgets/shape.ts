/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/widgets/shape.dart
 *   - pdf/lib/src/widgets/svg.dart
 *
 * `Vector` is the imperative drawing surface that the future SVG subsystem
 * will target: `src/svg/parser.ts` will translate SVG elements into these same
 * primitives rather than emitting operators directly. See phase 2 of
 * docs/ROADMAP.md.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput } from '../pdf/color.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';

export interface VectorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill?: ColorInput | null;
  readonly stroke?: ColorInput | null;
  readonly lineWidth?: number;
}

export interface VectorLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly color?: ColorInput;
  readonly lineWidth?: number;
}

export interface VectorCircle {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly fill?: ColorInput | null;
  readonly stroke?: ColorInput | null;
  readonly lineWidth?: number;
}

export interface VectorText {
  readonly value: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize?: number;
  readonly color?: ColorInput;
}

/** The drawing surface handed to `Vector`'s `draw` callback. */
export interface VectorApi {
  rect(options: VectorRect): void;
  line(options: VectorLine): void;
  circle(options: VectorCircle): void;
  text(options: VectorText): void;
}

export interface VectorOptions {
  readonly width: number;
  readonly height: number;
  readonly draw: (api: VectorApi) => void;
}

export interface VectorLayoutData {
  readonly scale: number;
}

export class Vector extends Widget<VectorLayoutData> {
  readonly width: number;
  readonly height: number;
  readonly draw: (api: VectorApi) => void;

  constructor({ width, height, draw }: VectorOptions) {
    super();
    this.width = Number(width);
    this.height = Number(height);
    this.draw = draw;
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<VectorLayoutData> {
    const scale = Math.min(1, constraints.maxWidth / this.width);
    return {
      widget: this,
      width: this.width * scale,
      height: this.height * scale,
      data: { scale }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<VectorLayoutData>): void {
    const scale = box.data.scale;
    const api: VectorApi = {
      rect: ({ x, y, width, height, fill = null, stroke = null, lineWidth = 1 }) => {
        if (fill) context.canvas.fillRect(box.x + x * scale, box.y + y * scale, width * scale, height * scale, fill);
        if (stroke) context.canvas.strokeRect(box.x + x * scale, box.y + y * scale, width * scale, height * scale, stroke, lineWidth * scale);
      },
      line: ({ x1, y1, x2, y2, color = '#000000', lineWidth = 1 }) => {
        context.canvas.line(box.x + x1 * scale, box.y + y1 * scale, box.x + x2 * scale, box.y + y2 * scale, color, lineWidth * scale);
      },
      circle: ({ cx, cy, radius, fill = null, stroke = null, lineWidth = 1 }) => {
        context.canvas.circle(box.x + cx * scale, box.y + cy * scale, radius * scale, { fill, stroke, lineWidth: lineWidth * scale });
      },
      text: ({ value, x, y, fontSize = 12, color = '#000000' }) => {
        context.canvas.text(String(value), box.x + x * scale, box.y + y * scale, {
          fontSize: fontSize * scale,
          color: normalizeColor(color)
        });
      }
    };

    this.draw(api);
  }
}
