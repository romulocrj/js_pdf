import { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgGroup } from './group.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import type { XmlElement } from './xml.ts';
export declare class SvgMaskedOperation extends SvgOperation {
    readonly target: SvgOperation;
    readonly mask: SvgGroup;
    constructor(target: SvgOperation, mask: SvgGroup, painter: SvgPainter);
    static fromXml(element: XmlElement, target: SvgOperation, painter: SvgPainter): SvgMaskedOperation;
    paint(canvas: PdfCanvas): void;
    draw(canvas: PdfCanvas): void;
    protected paintShape(_canvas: PdfCanvas): void;
    protected drawShape(_canvas: PdfCanvas): void;
    boundingBox(): PdfRect;
}
