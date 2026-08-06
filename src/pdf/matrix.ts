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
 *   - pdf/lib/src/pdf/graphics.dart
 *   - pdf/lib/src/svg/transform.dart
 *
 * The affine transform used by the `cm` operator and by SVG's `transform`
 * attribute.
 *
 * Upstream has no file of its own for this: it takes `Matrix4` from the
 * `vector_math` package and, at the point of writing `cm`, throws away ten of
 * the sixteen cells. The port has no runtime dependencies, so it carries the six
 * cells PDF actually stores:
 *
 *     | a c e |
 *     | b d f |
 *     | 0 0 1 |
 *
 * which is exactly the `[a b c d e f] cm` operand order. Everything the port
 * transforms — page content, SVG — is two-dimensional, so nothing is lost, and a
 * 2×3 matrix cannot express the 3-D rotation that upstream's `Matrix4` would
 * silently accept and then discard.
 */

/** `[a, b, c, d, e, f]`, in `cm` operand order. */
export type PdfMatrix = readonly [number, number, number, number, number, number];

export const identityMatrix: PdfMatrix = Object.freeze([1, 0, 0, 1, 0, 0]) as PdfMatrix;

/**
 * `first` applied after `second` — the same composition order as upstream's
 * `Matrix4.multiply`, and the order the `cm` operator itself uses: a `cm` while
 * a CTM is already in force post-multiplies onto it.
 */
export function multiplyMatrix(first: PdfMatrix, second: PdfMatrix): PdfMatrix {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = second;

  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

/** Compose left to right, which is how SVG reads a `transform` attribute. */
export function composeMatrices(matrices: readonly PdfMatrix[]): PdfMatrix {
  let result = identityMatrix;
  for (const matrix of matrices) {
    result = multiplyMatrix(result, matrix);
  }
  return result;
}

export function translationMatrix(tx: number, ty: number): PdfMatrix {
  return [1, 0, 0, 1, tx, ty];
}

export function scaleMatrix(sx: number, sy: number = sx): PdfMatrix {
  return [sx, 0, 0, sy, 0, 0];
}

/** Counter-clockwise, radians — upstream's `rotateZ`. */
export function rotationMatrix(radians: number): PdfMatrix {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, 0, 0];
}

/** SVG's `skewX`/`skewY`, in radians. */
export function skewMatrix(alpha: number, beta: number): PdfMatrix {
  return [1, Math.tan(beta), Math.tan(alpha), 1, 0, 0];
}

export function transformPoint(matrix: PdfMatrix, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/** Null when the matrix is singular, which a caller must handle rather than divide by zero. */
export function invertMatrix(matrix: PdfMatrix): PdfMatrix | null {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (determinant === 0 || !Number.isFinite(determinant)) {
    return null;
  }

  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant
  ];
}

/**
 * Reflect a transform expressed in top-left, y-down coordinates into PDF user
 * space, given the height of the surface it applies to.
 *
 * The widget layer measures y downward from the top of the page and the canvas
 * flips each coordinate as it writes it (see ARCHITECTURE.md §4). A `cm` written
 * from that layer therefore has to be conjugated by the same flip, or it would
 * rotate and translate in the opposite vertical direction from the coordinates
 * it applies to. The flip `(x, y) -> (x, height - y)` is its own inverse, so
 * this is `flip * matrix * flip`.
 */
export function flipMatrix(matrix: PdfMatrix, height: number): PdfMatrix {
  const flip: PdfMatrix = [1, 0, 0, -1, 0, height];
  return multiplyMatrix(flip, multiplyMatrix(matrix, flip));
}
