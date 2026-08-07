import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgGroup } from './group.ts';
import type { SvgOperation } from './operation.ts';
import type { SvgParser } from './parser.ts';
import type { XmlElement } from './xml.ts';
export declare class SvgPainter {
    readonly parser: SvgParser;
    readonly canvas: PdfCanvas;
    readonly boundingBox: PdfRect;
    private readonly fontLookup;
    private readonly fonts;
    constructor(parser: SvgParser, canvas: PdfCanvas, boundingBox: PdfRect, fontLookup?: (family: string, style: string, weight: string) => PdfFont);
    resolveFont(family: string, style: string, weight: string): PdfFont;
    brushFor(element: XmlElement, parent: SvgBrush): SvgBrush;
    operationFromXml(element: XmlElement, brush: SvgBrush): SvgOperation | null;
    rootOperation(): SvgGroup;
    paint(): void;
}
