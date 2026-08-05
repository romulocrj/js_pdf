import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import type { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import type { XmlElement } from './xml.ts';
export type SvgClipPathUnits = 'userSpaceOnUse' | 'objectBoundingBox';
export declare class SvgClipPath {
    readonly children: readonly SvgOperation[];
    readonly units: SvgClipPathUnits;
    readonly evenOdd: boolean;
    constructor(children: readonly SvgOperation[], units?: SvgClipPathUnits, evenOdd?: boolean);
    static readonly empty: SvgClipPath;
    get isEmpty(): boolean;
    get isNotEmpty(): boolean;
    static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgClipPath;
    apply(canvas: PdfCanvas, target: PdfRect): void;
}
