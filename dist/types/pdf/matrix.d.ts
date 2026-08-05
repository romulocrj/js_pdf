/** `[a, b, c, d, e, f]`, in `cm` operand order. */
export type PdfMatrix = readonly [number, number, number, number, number, number];
export declare const identityMatrix: PdfMatrix;
/**
 * `first` applied after `second` — the same composition order as upstream's
 * `Matrix4.multiply`, and the order the `cm` operator itself uses: a `cm` while
 * a CTM is already in force post-multiplies onto it.
 */
export declare function multiplyMatrix(first: PdfMatrix, second: PdfMatrix): PdfMatrix;
/** Compose left to right, which is how SVG reads a `transform` attribute. */
export declare function composeMatrices(matrices: readonly PdfMatrix[]): PdfMatrix;
export declare function translationMatrix(tx: number, ty: number): PdfMatrix;
export declare function scaleMatrix(sx: number, sy?: number): PdfMatrix;
/** Counter-clockwise, radians — upstream's `rotateZ`. */
export declare function rotationMatrix(radians: number): PdfMatrix;
/** SVG's `skewX`/`skewY`, in radians. */
export declare function skewMatrix(alpha: number, beta: number): PdfMatrix;
export declare function transformPoint(matrix: PdfMatrix, x: number, y: number): {
    x: number;
    y: number;
};
/** Null when the matrix is singular, which a caller must handle rather than divide by zero. */
export declare function invertMatrix(matrix: PdfMatrix): PdfMatrix | null;
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
export declare function flipMatrix(matrix: PdfMatrix, height: number): PdfMatrix;
