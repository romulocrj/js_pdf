import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgGroup } from './group.ts';
import type { SvgViewportSize } from './group.ts';
import type { SvgOperation } from './operation.ts';
import type { SvgParser } from './parser.ts';
import type { XmlElement } from './xml.ts';
export declare class SvgPainter {
    readonly parser: SvgParser;
    readonly canvas: PdfCanvas;
    readonly boundingBox: PdfRect;
    /** The brush above the root: defaults, with the root viewBox as the viewport. */
    readonly rootBrush: SvgBrush;
    private readonly fontLookup;
    private readonly fonts;
    private readonly building;
    constructor(parser: SvgParser, canvas: PdfCanvas, boundingBox: PdfRect, fontLookup?: (family: string, style: string, weight: string) => PdfFont);
    resolveFont(family: string, style: string, weight: string): PdfFont;
    /** The brush in force at `element` through its document ancestors. */
    brushOf(element: XmlElement | null): SvgBrush;
    /**
     * `boundingBox` (page space) mapped back into the canvas's current user
     * space: a soft mask's form is evaluated there, so this /BBox covers all
     * that can be visible without cutting a stroke that leaves the geometry.
     */
    userSpaceBox(canvas: PdfCanvas): PdfRect;
    /**
     * `display` and `visibility` read after `style` is flattened: drawing tools
     * export hidden layers as `style="display:none"`, which upstream painted
     * because it tested the raw attributes before `convertStyle` ran.
     */
    private isHidden;
    /** `size` comes from a `<use>` instancing a `<symbol>` or an `<svg>`. */
    operationFromXml(element: XmlElement, brush: SvgBrush, size?: SvgViewportSize | null): SvgOperation | null;
    rootOperation(): SvgGroup;
    paint(): void;
}
