import type { PdfCanvas } from '../pdf/graphics.ts';
import { PdfImage } from '../pdf/obj/image.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';
export declare class SvgImageOperation extends SvgOperation {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly image: PdfImage;
    constructor(x: number, y: number, width: number, height: number, image: PdfImage, brush: SvgBrush, clip: SvgClipPath, transform: SvgTransform, painter: SvgPainter);
    /**
     * Null when the image cannot be used: an external href, a payload that is
     * not base64, or one that is not a decodable PNG or JPEG (a nested SVG, a
     * GIF, a WebP, a truncated file). That costs this element only; upstream and
     * the port used to abort the whole document.
     */
    static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgImageOperation | null;
    protected paintShape(canvas: PdfCanvas): void;
    protected drawShape(_canvas: PdfCanvas): void;
    boundingBox(): PdfRect;
}
