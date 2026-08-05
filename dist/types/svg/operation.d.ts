import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfRect } from '../pdf/rect.ts';
import type { SvgBrush } from './brush.ts';
import type { SvgPainter } from './painter.ts';
import type { SvgTransform } from './transform.ts';
export declare abstract class SvgOperation {
    readonly brush: SvgBrush;
    readonly transform: SvgTransform;
    readonly painter: SvgPainter;
    constructor(brush: SvgBrush, transform: SvgTransform, painter: SvgPainter);
    paint(canvas: PdfCanvas): void;
    draw(canvas: PdfCanvas): void;
    protected abstract paintShape(canvas: PdfCanvas): void;
    protected abstract drawShape(canvas: PdfCanvas): void;
    abstract boundingBox(): PdfRect;
}
