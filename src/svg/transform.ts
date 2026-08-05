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
 *   - pdf/lib/src/svg/transform.dart
 *
 * The `transform` attribute: `matrix translate scale rotate skewX skewY`,
 * composed left to right into one `cm` operand.
 *
 * PORT GAP: no `preserveAspectRatio`. Upstream has none either — `SvgImage`
 * fits the viewBox into the widget's box with `BoxFit` and `Alignment` instead,
 * which covers every alignment `preserveAspectRatio` can express but is stated
 * by the caller rather than read from the document. Phase 2.7 is where that
 * fitting lands.
 */

import { identityMatrix, multiplyMatrix, rotationMatrix, scaleMatrix, skewMatrix, translationMatrix } from '../pdf/matrix.ts';
import type { PdfMatrix } from '../pdf/matrix.ts';
import { splitDoubles } from './parser.ts';
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
      const parameters = splitDoubles(match[2]!);

      switch (name) {
        case 'matrix': {
          // Missing operands are zero, which is what upstream pads with. A
          // short `matrix()` is malformed SVG; padding renders it rather than
          // rejecting the whole file for one bad attribute.
          const m = [...parameters, 0, 0, 0, 0, 0, 0].slice(0, 6) as unknown as PdfMatrix;
          matrix = multiplyMatrix(matrix, m);
          break;
        }

        case 'translate': {
          const dx = parameters[0] ?? 0;
          const dy = parameters[1] ?? 0;
          matrix = multiplyMatrix(matrix, translationMatrix(dx, dy));
          break;
        }

        case 'scale': {
          const sx = parameters[0] ?? 1;
          // A single operand scales both axes, which is why this is not `?? 1`.
          const sy = parameters[1] ?? sx;
          matrix = multiplyMatrix(matrix, scaleMatrix(sx, sy));
          break;
        }

        case 'rotate': {
          const degrees = parameters[0] ?? 0;
          const ox = parameters[1] ?? 0;
          const oy = parameters[2] ?? 0;

          if (parameters.length > 1) {
            matrix = multiplyMatrix(matrix, translationMatrix(ox, oy));
          }
          matrix = multiplyMatrix(matrix, rotationMatrix(toRadians(degrees)));
          if (ox !== 0 || oy !== 0) {
            matrix = multiplyMatrix(matrix, translationMatrix(-ox, -oy));
          }
          break;
        }

        case 'skewX':
          matrix = multiplyMatrix(matrix, skewMatrix(toRadians(parameters[0] ?? 0), 0));
          break;

        case 'skewY':
          matrix = multiplyMatrix(matrix, skewMatrix(0, toRadians(parameters[0] ?? 0)));
          break;

        default:
          break;
      }
    }

    return new SvgTransform(matrix);
  }
}
