import { PdfDataType } from './base.ts';
import type { PdfReferenceable } from './array.ts';
import type { PdfStream } from './stream.ts';
export declare class PdfDict extends PdfDataType {
    readonly values: Map<string, PdfDataType>;
    constructor(values?: Iterable<readonly [string, PdfDataType]>);
    /** `{ '/F1': fontObject }` becomes `<< /F1 3 0 R >>`. */
    static fromObjectMap(objects: Iterable<readonly [string, PdfReferenceable]>): PdfDict;
    get isEmpty(): boolean;
    has(key: string): boolean;
    get(key: string): PdfDataType | undefined;
    set(key: string, value: PdfDataType): void;
    output(s: PdfStream): void;
}
