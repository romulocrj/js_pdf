import { Barcode1D } from './barcode_1d.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
/**
 * The start and stop symbols Codabar allows.
 *
 * The numeric values are load-bearing: they index the start/stop table and
 * offset from 'A', as upstream's enum indices do.
 */
export declare const BarcodeCodabarStartStop: {
    /** A, or E. */
    readonly A: 0;
    /** B, or N. */
    readonly B: 1;
    /** C, or `*`. */
    readonly C: 2;
    /** D, or T. */
    readonly D: 3;
};
export type BarcodeCodabarStartStop = (typeof BarcodeCodabarStartStop)[keyof typeof BarcodeCodabarStartStop];
/**
 * Codabar barcode.
 *
 * Designed to survive a dot-matrix printer, which is why it is still found on
 * airbills and blood bank forms.
 */
export declare class BarcodeCodabar extends Barcode1D {
    readonly start: BarcodeCodabarStartStop;
    readonly stop: BarcodeCodabarStartStop;
    /** Print the start and stop characters under the bars. */
    readonly printStartStop: boolean;
    /**
     * Take the start and stop characters from the data itself, as letters
     * (ABCDETN*). [start] and [stop] are then ignored.
     */
    readonly explicitStartStop: boolean;
    constructor(start: BarcodeCodabarStartStop, stop: BarcodeCodabarStartStop, printStartStop: boolean, explicitStartStop: boolean);
    get charSet(): Iterable<number>;
    get name(): string;
    convert(data: string): boolean[];
    verifyBytes(data: Uint8Array): void;
    makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[];
}
