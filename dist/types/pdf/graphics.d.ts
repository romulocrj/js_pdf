import type { ColorInput } from './color.ts';
import type { PdfFont } from './font/font.ts';
import { PdfDict } from './format/dict.ts';
import type { PdfGraphicState } from './graphic_state.ts';
import type { PdfShadingPattern } from './obj/pattern.ts';
import type { PdfImage } from './obj/image.ts';
import type { PdfMatrix } from './matrix.ts';
import type { PdfRect } from './rect.ts';
/**
 * What `PdfCanvas.text` needs to write one run of text. Named for the canvas
 * rather than called `TextStyle`, which as of phase 1.4 is the widget-level
 * value type in `widgets/text_style.ts`; this is its resolved, drawable form.
 */
export interface CanvasTextStyle {
    readonly fontSize: number;
    readonly color: ColorInput;
    readonly font?: PdfFont;
    /** `Tc`, extra space per glyph. Omitted from the output when zero. */
    readonly letterSpacing?: number;
    /**
     * `Tw`, extra space per space character. Omitted when zero.
     *
     * PORT GAP: `Tw` applies to single-byte code 32 only, so a reader ignores it
     * for the two-byte CIDs an embedded TrueType font emits. Word spacing has no
     * effect on TTF text until the port measures and inserts the space itself.
     */
    readonly wordSpacing?: number;
}
export interface CircleOptions {
    readonly fill?: ColorInput | null;
    readonly stroke?: ColorInput | null;
    readonly lineWidth?: number;
}
/**
 * The shape drawn at the ends of an open subpath. Upstream is an `enum` whose
 * `index` it writes; an `enum` is not erasable TypeScript, so this is a string
 * union and the operand is looked up.
 */
export type PdfLineCap = 'butt' | 'round' | 'square';
/** The shape drawn where two segments meet. */
export type PdfLineJoin = 'miter' | 'round' | 'bevel';
export interface FillOptions {
    /** Even-odd rather than the nonzero winding rule: `f*` instead of `f`. */
    readonly evenOdd?: boolean;
}
export interface StrokeOptions {
    /** Close the subpath before stroking: `s` instead of `S`. */
    readonly close?: boolean;
}
export interface FillAndStrokeOptions extends FillOptions, StrokeOptions {
}
export interface ClipOptions extends FillOptions {
    /**
     * Emit the `n` that ends the path. Upstream's default; pass `false` to paint
     * the same path as well as clip with it.
     */
    readonly end?: boolean;
}
export interface BezierArcOptions {
    readonly large?: boolean;
    readonly sweep?: boolean;
    /** X-axis rotation, in radians. */
    readonly phi?: number;
}
/**
 * Content-stream builder for one page.
 *
 * Like upstream `PdfGraphics`, operators are appended to a buffer and never
 * re-read. Unlike upstream, the buffer is a list of lines rather than a byte
 * stream, because the port assembles the whole content stream as a string
 * before any document exists.
 */
export declare class PdfCanvas {
    readonly pageHeight: number;
    private readonly commands;
    private readonly fontNames;
    private readonly stateNames;
    private readonly stateDicts;
    private readonly patternNames;
    private readonly patternDicts;
    private readonly imageNames;
    /**
     * The current transformation matrix, tracked so a widget can ask what space
     * it is drawing in. `q`/`Q` save and restore it, as they do in the reader.
     */
    private currentTransform;
    private readonly transformStack;
    private currentLetterSpacing;
    private currentWordSpacing;
    private readonly textSpacingStack;
    private textSpacingDirty;
    constructor(pageHeight: number);
    push(command: string): void;
    /** Widget-space (top-left, y-down) to PDF user space. */
    toPdfY(top: number): number;
    /**
     * Register `font` on this page and return the name a `Tf` operator should
     * use. Names are allocated in first-use order — `/F1`, `/F2`, … — and repeat
     * for the same font, so a page's `/Font` dictionary has one entry per font.
     *
     * Upstream derives the name from the font object's serial number instead
     * (`/F$objser`), which it can do because its `PdfFont` is an indirect object
     * from the moment it is created. Here a page is rendered to operators before
     * any document exists, so the name has to be page-local; `PdfDocument.addPage`
     * is what binds it to the font object. Consequence: two pages using the same
     * font both call it `/F1` and share one font object.
     */
    addFont(font: PdfFont): string;
    /** The fonts this page drew with, mapped to the names it wrote for them. */
    get fonts(): ReadonlyMap<PdfFont, string>;
    /** The `/ExtGState` entries this page selected, by the name it wrote. */
    get graphicStates(): ReadonlyMap<string, PdfDict>;
    /** The `/Pattern` entries this page selected, by content-stream name. */
    get patterns(): ReadonlyMap<string, PdfDict>;
    /** The images this page drew with, mapped to page-local `/I…` names. */
    get images(): ReadonlyMap<PdfImage, string>;
    private addImage;
    /**
     * `q`. Upstream calls this `saveContext`; `save` is kept as the name the
     * port's own widgets have used since before the graphics context existed.
     */
    saveContext(): void;
    /** `Q`, restoring the CTM this canvas last saved. A no-op if nothing was saved. */
    restoreContext(): void;
    save(): void;
    restore(): void;
    /** `cm`, post-multiplied onto the current transform exactly as the reader does. */
    setTransform(matrix: PdfMatrix): void;
    getTransform(): PdfMatrix;
    /**
     * `gs`, selecting an `/ExtGState`. States with equal values share one name,
     * so a page that draws fifty half-transparent boxes writes one dictionary.
     */
    setGraphicState(state: PdfGraphicState): string | null;
    private addPattern;
    setFillPattern(pattern: PdfShadingPattern): string;
    setStrokePattern(pattern: PdfShadingPattern): string;
    /** Draw an image in PDF user space, applying its stored EXIF-style orientation. */
    drawImage(image: PdfImage, x: number, y: number, width?: number, height?: number): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    /**
     * A cubic Bézier to `(x3, y3)`, with `(x1, y1)` and `(x2, y2)` as the control
     * points at the start and the end.
     */
    curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
    closePath(): void;
    drawLine(x1: number, y1: number, x2: number, y2: number): void;
    drawRect(x: number, y: number, width: number, height: number): void;
    drawBox(box: PdfRect): void;
    /** A rounded rectangle with horizontal radius `rh` and vertical radius `rv`. */
    drawRRect(x: number, y: number, width: number, height: number, rv: number, rh: number): void;
    /** Pass `clockwise: false` to wind the other way, which cuts a hole in a fill. */
    drawEllipse(x: number, y: number, r1: number, r2: number, clockwise?: boolean): void;
    /**
     * An elliptical arc from the current point to `(x2, y2)` with radii
     * `(rx, ry)`, converted to cubic Béziers. This is SVG's `A` command, and the
     * centre is derived from the endpoints per the SVG implementation notes.
     */
    bezierArc(x1: number, y1: number, rx: number, ry: number, x2: number, y2: number, { large, sweep, phi }?: BezierArcOptions): void;
    private vectorAngle;
    private endToCenterParameters;
    private bezierArcFromCentre;
    fillPath({ evenOdd }?: FillOptions): void;
    strokePath({ close }?: StrokeOptions): void;
    fillAndStrokePath({ evenOdd, close }?: FillAndStrokeOptions): void;
    /** `W`/`W*`, optionally followed by the `n` that consumes the path. */
    clipPath({ evenOdd, end }?: ClipOptions): void;
    setLineWidth(width: number): void;
    setLineCap(cap: PdfLineCap): void;
    setLineJoin(join: PdfLineJoin): void;
    setMiterLimit(limit: number): void;
    /**
     * `[2 1] 0 d` alternates 2 units on, 1 off. An empty array restores a solid
     * line, which is what upstream's default argument does.
     */
    setLineDashPattern(array?: readonly number[], phase?: number): void;
    setFillColor(color: ColorInput): void;
    setStrokeColor(color: ColorInput): void;
    setColor(color: ColorInput): void;
    fillRect(x: number, top: number, width: number, height: number, color: ColorInput): void;
    strokeRect(x: number, top: number, width: number, height: number, color: ColorInput, lineWidth?: number): void;
    text(text: string, x: number, baselineFromTop: number, style: CanvasTextStyle): void;
    line(x1: number, top1: number, x2: number, top2: number, color?: ColorInput, lineWidth?: number): void;
    circle(cx: number, topCenter: number, radius: number, { fill, stroke, lineWidth }?: CircleOptions): void;
    output(): string;
}
