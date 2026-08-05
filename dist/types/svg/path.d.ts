import { PdfCanvas } from '../pdf/graphics.ts';
import { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';
/** Receives the normalized path. Upstream's `PathProxy`. */
export interface PathProxy {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    cubicTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
    close(): void;
}
interface Offset {
    readonly dx: number;
    readonly dy: number;
}
/**
 * A path command letter, or `?` for "not a command".
 *
 * Upstream's `path_parsing` has an `SvgPathSegType` enum and a letter-to-enum
 * table. The letter *is* the enum, so the port keeps the letter — one fewer
 * mapping to get wrong, and `enum` is not erasable TypeScript anyway.
 */
type Command = 'M' | 'm' | 'L' | 'l' | 'H' | 'h' | 'V' | 'v' | 'C' | 'c' | 'S' | 's' | 'Q' | 'q' | 'T' | 't' | 'A' | 'a' | 'Z' | 'z' | '?';
interface PathSegment {
    command: Command;
    targetPoint: Offset;
    point1: Offset;
    point2: Offset;
    /** Degrees, as the `A` command spells it. */
    arcAngle: number;
    arcLarge: boolean;
    arcSweep: boolean;
}
/**
 * Tokenizer for the `d` grammar.
 *
 * Divergence from upstream: `parseSegments` returns an array instead of a
 * generator. The port stays synchronous and a `d` string is bounded, so nothing
 * is gained by streaming and a plain array is easier to test against.
 */
export declare class SvgPathStringSource {
    private readonly source;
    private readonly length;
    private index;
    private previousCommand;
    constructor(source: string);
    get hasMoreData(): boolean;
    parseSegments(): PathSegment[];
    private isSpace;
    /** Advances past whitespace and returns the next code unit, or -1 at the end. */
    private skipOptionalSpaces;
    private skipOptionalSpacesOrDelimiter;
    private static isNumberStart;
    private readCodeUnit;
    /**
     * The implicit-repeat rule: a number where a command letter was expected
     * repeats the previous command, except that a repeated `moveto` is a `lineto`
     * and `close` takes no parameters so cannot repeat at all.
     */
    private maybeImplicitCommand;
    /**
     * Ported from Chromium's own number scanner rather than handed to
     * `Number.parseFloat`: the grammar allows `.5.5` to mean two numbers, and
     * `1e2` to be followed immediately by a command letter. A regular expression
     * that accepts those and nothing else is harder to read than the scanner.
     */
    private parseNumber;
    private parseArcFlag;
    parseSegment(): PathSegment;
}
/**
 * Turns parsed segments absolute and reduces them to move / line / cubic /
 * close, which is all a PDF content stream can express.
 */
export declare class SvgPathNormalizer {
    private currentPoint;
    private subPathPoint;
    private controlPoint;
    private lastCommand;
    emitSegment(segment: PathSegment, path: PathProxy): void;
    /**
     * The endpoint-to-centre conversion from the SVG implementation notes,
     * emitting one cubic per quarter turn. Returns false when the spec says to
     * treat the arc as a straight line.
     */
    private decomposeArcToCubic;
}
/** Parse `d` and emit it to `path`. Upstream's `writeSvgPathDataToPath`. */
export declare function writeSvgPathDataToPath(d: string | null | undefined, path: PathProxy): void;
/** Feeds a parsed path straight into a canvas. `PdfGraphics.drawShape`. */
export declare class CanvasPathProxy implements PathProxy {
    private readonly canvas;
    constructor(canvas: PdfCanvas);
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    cubicTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
    close(): void;
}
/**
 * Append the path `d` describes to `canvas`'s current path, in PDF user space.
 *
 * Nothing is painted: the caller decides between `fillPath`, `strokePath` and
 * `clipPath`, which is what lets an SVG shape be filled and stroked with
 * different rules from one `d` string.
 */
export declare function drawShape(canvas: PdfCanvas, d: string): void;
/**
 * Accumulates the tight bounding box of a path. Upstream's `_PathBBProxy`,
 * which solves each cubic's derivative rather than sampling it, so a curve that
 * bulges past its control points is still contained.
 */
export declare class BoundingBoxPathProxy implements PathProxy {
    private xMin;
    private yMin;
    private xMax;
    private yMax;
    private px;
    private py;
    get box(): PdfRect;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    close(): void;
    cubicTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
    private updateMinMax;
}
/** The tight bounding box of `d`. Upstream's `PdfGraphics.shapeBoundingBox`. */
export declare function shapeBoundingBox(d: string): PdfRect;
/** A basic SVG shape normalized to path data, then painted with its brush. */
export declare class SvgPath extends SvgOperation {
    readonly d: string;
    constructor(d: string, brush: SvgBrush, clip: SvgClipPath, transform: SvgTransform, painter: SvgPainter);
    static fromXmlElement(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgPath;
    private static numeric;
    private static rectData;
    protected paintShape(canvas: PdfCanvas): void;
    protected drawShape(canvas: PdfCanvas): void;
    boundingBox(): PdfRect;
}
export {};
