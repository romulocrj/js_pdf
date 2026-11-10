import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfMatrix } from '../pdf/matrix.ts';
import { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';
/** `<use>`'s `width` and `height`, which override the instanced element's. */
export interface SvgViewportSize {
    readonly width?: number | null;
    readonly height?: number | null;
}
interface SvgViewport {
    /** The viewport rectangle in the group's user space; the content is clipped to it. */
    readonly box: PdfRect;
    /** The viewBox fitted into `box`. */
    readonly matrix: PdfMatrix;
}
/**
 * The transform that fits `viewBox` into `viewport` per `preserveAspectRatio`
 * (SVG 1.1 7.8): `none`, or one of the nine `x…Y…` alignments with `meet`
 * (the default) or `slice`. Anything unreadable means `xMidYMid meet`.
 */
export declare function viewBoxTransform(viewport: PdfRect, viewBox: PdfRect | null, preserveAspectRatio: string | null): PdfMatrix;
export declare class SvgGroup extends SvgOperation {
    readonly children: readonly SvgOperation[];
    readonly viewport: SvgViewport | null;
    constructor(children: readonly SvgOperation[], brush: SvgBrush, clip: SvgClipPath, transform: SvgTransform, painter: SvgPainter, viewport?: SvgViewport | null);
    /**
     * `size` non-null makes `element` establish a viewport: its `x`, `y`,
     * `width` and `height` (`size` overriding the last two, a missing one being
     * 100% of the parent viewport), fitted with its `viewBox`. Upstream dropped a
     * nested `<svg>` and ignored `<symbol viewBox>` and `<use width height>`.
     */
    static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush, size?: SvgViewportSize | null): SvgGroup;
    protected paintShape(canvas: PdfCanvas): void;
    protected drawShape(canvas: PdfCanvas): void;
    boundingBox(): PdfRect;
}
export {};
