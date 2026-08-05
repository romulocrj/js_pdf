import type { Rgb } from '../color.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
export type PdfOutlineStyle = 'normal' | 'italic' | 'bold' | 'italicBold';
/** One node, or the untitled root, of the document outline tree. */
export declare class PdfOutline extends PdfObject<PdfDict> {
    readonly title: string | null;
    readonly anchor: string | null;
    readonly color: Rgb | null;
    readonly style: PdfOutlineStyle;
    readonly children: PdfOutline[];
    parent: PdfOutline | null;
    constructor(document: PdfObjectRegistry, { title, anchor, color, style }?: {
        readonly title?: string | null;
        readonly anchor?: string | null;
        readonly color?: Rgb | null;
        readonly style?: PdfOutlineStyle;
    });
    add(child: PdfOutline): void;
    descendantCount(): number;
    prepare(): void;
}
