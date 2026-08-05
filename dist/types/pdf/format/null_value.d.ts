import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';
/**
 * The PDF `null` object. Distinct from omitting a key: an explicit null
 * overrides an inherited value.
 */
export declare class PdfNull extends PdfDataType {
    output(s: PdfStream): void;
}
