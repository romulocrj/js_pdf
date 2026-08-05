import type { ColorInput } from './color.ts';
import type { PdfFont } from './font/font.ts';
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
 * Content-stream builder for one page.
 *
 * Coordinates given to these methods are top-left origin (the widget layer's
 * convention); the canvas flips them into PDF's bottom-left user space. Like
 * upstream `PdfGraphics`, the operators are appended to a buffer and never
 * re-read.
 */
export declare class PdfCanvas {
    readonly pageHeight: number;
    private readonly commands;
    private readonly fontNames;
    constructor(pageHeight: number);
    push(command: string): void;
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
    save(): void;
    restore(): void;
    fillRect(x: number, top: number, width: number, height: number, color: ColorInput): void;
    strokeRect(x: number, top: number, width: number, height: number, color: ColorInput, lineWidth?: number): void;
    text(text: string, x: number, baselineFromTop: number, style: CanvasTextStyle): void;
    line(x1: number, top1: number, x2: number, top2: number, color?: ColorInput, lineWidth?: number): void;
    circle(cx: number, topCenter: number, radius: number, { fill, stroke, lineWidth }?: CircleOptions): void;
    output(): string;
}
