import type { PdfFont } from '../pdf/font/font.ts';
import type { PdfFontMetrics } from '../pdf/font/font_metrics.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';
interface TextOffset {
    readonly x: number;
    readonly y: number;
}
export declare class SvgText extends SvgOperation {
    readonly x: number;
    readonly y: number;
    readonly advance: number;
    readonly text: string;
    readonly font: PdfFont;
    readonly fontSize: number;
    readonly metrics: PdfFontMetrics;
    readonly spans: readonly SvgText[];
    constructor(x: number, y: number, advance: number, text: string, font: PdfFont, fontSize: number, metrics: PdfFontMetrics, spans: readonly SvgText[], brush: SvgBrush, clip: SvgClipPath, transform: SvgTransform, painter: SvgPainter);
    static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush, offset?: TextOffset): SvgText;
    protected paintShape(canvas: PdfCanvas): void;
    protected drawShape(canvas: PdfCanvas): void;
    boundingBox(): PdfRect;
}
export {};
