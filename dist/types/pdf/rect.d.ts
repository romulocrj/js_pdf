export interface PdfPoint {
    readonly x: number;
    readonly y: number;
}
export declare const PdfPoint: Readonly<{
    zero: PdfPoint;
    translate(point: PdfPoint, dx: number, dy: number): PdfPoint;
}>;
export interface PdfRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export declare const PdfRect: Readonly<{
    zero: PdfRect;
    fromLTRB(left: number, bottom: number, right: number, top: number): PdfRect;
    left(rect: PdfRect): number;
    bottom(rect: PdfRect): number;
    right(rect: PdfRect): number;
    top(rect: PdfRect): number;
    horizontalCenter(rect: PdfRect): number;
    verticalCenter(rect: PdfRect): number;
    /** Edges moved outwards by `delta`; a negative delta deflates, as upstream. */
    inflate(rect: PdfRect, delta: number): PdfRect;
    deflate(rect: PdfRect, delta: number): PdfRect;
    scale(rect: PdfRect, factor: number): PdfRect;
}>;
