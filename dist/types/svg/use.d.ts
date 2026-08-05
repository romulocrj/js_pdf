import type { PdfCanvas } from '../pdf/graphics.ts';
import { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';
export declare class SvgUse extends SvgOperation {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly href: SvgOperation | null;
    constructor(x: number, y: number, width: number, height: number, href: SvgOperation | null, brush: SvgBrush, clip: SvgClipPath, transform: SvgTransform, painter: SvgPainter);
    static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgUse;
    protected paintShape(canvas: PdfCanvas): void;
    protected drawShape(canvas: PdfCanvas): void;
    boundingBox(): PdfRect;
}
