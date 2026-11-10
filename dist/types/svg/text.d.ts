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
/** One text node drawn at one place, with the style in force where it was written. */
export interface SvgTextRun {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly font: PdfFont;
    readonly fontSize: number;
    readonly metrics: PdfFontMetrics;
    readonly brush: SvgBrush;
    /** Opacity of nested text elements; the outer text's is applied by its operation. */
    readonly opacity?: number;
}
export declare class SvgText extends SvgOperation {
    readonly runs: readonly SvgTextRun[];
    constructor(runs: readonly SvgTextRun[], brush: SvgBrush, clip: SvgClipPath, transform: SvgTransform, painter: SvgPainter);
    static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgText;
    private static walk;
    protected paintShape(canvas: PdfCanvas): void;
    protected drawShape(canvas: PdfCanvas): void;
    boundingBox(): PdfRect;
}
