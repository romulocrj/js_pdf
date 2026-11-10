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
 *   - pdf/lib/src/svg/transform.dart
 *
 * The `transform` attribute: `matrix translate scale rotate skewX skewY`,
 * composed left to right into one `cm` operand.
 *
 * `preserveAspectRatio` is read for nested viewports (`<svg>`, `<symbol>` via
 * `<use>`) by `viewBoxTransform` in `group.ts`. The root's is not: `SvgImage`
 * fits the root viewBox into the widget's box with `BoxFit` and `Alignment`,
 * stated by the caller, as upstream does.
 */

import { identityMatrix, multiplyMatrix, rotationMatrix, scaleMatrix, skewMatrix, translationMatrix } from '../pdf/matrix.ts';
import type { PdfMatrix } from '../pdf/matrix.ts';
import { parseNumbers } from './parser.ts';
import type { XmlElement } from './xml.ts';

const TRANSFORM = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * A parsed `transform` attribute, or `none` when the element carried none.
 *
 * `none` is distinct from the identity matrix on purpose: upstream writes no
 * `cm` operator at all for an element without a transform, and matching that
 * keeps the emitted content stream comparable.
 */
export class SvgTransform {
  readonly matrix: PdfMatrix | null;

  constructor(matrix: PdfMatrix | null) {
    this.matrix = matrix;
  }

  static readonly none = new SvgTransform(null);

  get isEmpty(): boolean {
    return this.matrix === null;
  }

  get isNotEmpty(): boolean {
    return this.matrix !== null;
  }

  static fromXml(element: XmlElement): SvgTransform {
    return SvgTransform.fromString(element.getAttribute('transform'));
  }

  static fromString(transform: string | null | undefined): SvgTransform {
    if (transform === null || transform === undefined) {
      return SvgTransform.none;
    }

    let matrix = identityMatrix;

    for (const match of transform.matchAll(TRANSFORM)) {
      const name = match[1]!;
      // Each function must match its SVG 1.1 7.6 signature, or it is skipped
      // and the valid ones around it still apply — upstream PR #1980's rule.
      // Before, a non-number threw out of the document and a short `matrix()`
      // was zero-padded into a singular `cm` that collapsed everything after.
      const p = parseNumbers(match[2]!) ?? [];
      const [a = 0, b, c = 0] = p;
      const one = p.length === 1;
      const upToTwo = p.length === 1 || p.length === 2;
      let step: PdfMatrix | null = null;

      if (name === 'matrix') {
        step = p.length === 6 ? p as unknown as PdfMatrix : null;
      } else if (name === 'translate') {
        step = upToTwo ? translationMatrix(a, b ?? 0) : null;
      } else if (name === 'scale') {
        // A single operand scales both axes.
        step = upToTwo ? scaleMatrix(a, b ?? a) : null;
      } else if (name === 'rotate') {
        step = one || p.length === 3
          ? multiplyMatrix(
            multiplyMatrix(translationMatrix(b ?? 0, c), rotationMatrix(toRadians(a))),
            translationMatrix(-(b ?? 0), -c)
          )
          : null;
      } else {
        step = one ? skewMatrix(name === 'skewX' ? toRadians(a) : 0, name === 'skewY' ? toRadians(a) : 0) : null;
      }

      if (step !== null) {
        matrix = multiplyMatrix(matrix, step);
      }
    }

    return new SvgTransform(matrix);
  }
}
