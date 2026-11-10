import { PdfCanvas } from '../pdf/graphics.ts';
import { SvgGroup } from './group.ts';
import type { SvgPainter } from './painter.ts';
import type { XmlElement } from './xml.ts';
export declare class SvgMask {
    readonly content: SvgGroup;
    readonly painter: SvgPainter;
    constructor(content: SvgGroup, painter: SvgPainter);
    /** The mask `element` names, or null when it names none that resolves. */
    static fromXml(element: XmlElement, painter: SvgPainter): SvgMask | null;
    apply(canvas: PdfCanvas): void;
}
