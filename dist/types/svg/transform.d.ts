import type { PdfMatrix } from '../pdf/matrix.ts';
import type { XmlElement } from './xml.ts';
/**
 * A parsed `transform` attribute, or `none` when the element carried none.
 *
 * `none` is distinct from the identity matrix on purpose: upstream writes no
 * `cm` operator at all for an element without a transform, and matching that
 * keeps the emitted content stream comparable.
 */
export declare class SvgTransform {
    readonly matrix: PdfMatrix | null;
    constructor(matrix: PdfMatrix | null);
    static readonly none: SvgTransform;
    get isEmpty(): boolean;
    get isNotEmpty(): boolean;
    static fromXml(element: XmlElement): SvgTransform;
    static fromString(transform: string | null | undefined): SvgTransform;
}
