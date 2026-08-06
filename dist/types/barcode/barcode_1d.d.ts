import { Barcode } from './barcode.ts';
import type { BarcodeMakeOptions } from './barcode.ts';
import type { BarcodeElement } from './barcode_operations.ts';
/** Default padding between the text and the bars. */
export declare const DEFAULT_TEXT_PADDING = 0;
/** The measurements every drawing hook is handed. */
export interface BarcodeDrawParams {
    readonly drawText: boolean;
    readonly width: number;
    readonly height: number;
    readonly fontHeight: number;
    readonly textPadding: number;
}
/** One-dimensional barcode generation class. */
export declare abstract class Barcode1D extends Barcode {
    makeBytes(data: Uint8Array, options: BarcodeMakeOptions): BarcodeElement[];
    /** The height of the bar at a given index. */
    getHeight(_index: number, _count: number, params: BarcodeDrawParams): number;
    /** Margin above the first bar. */
    marginTop(_params: BarcodeDrawParams): number;
    /** Margin before the first bar. */
    marginLeft(_params: BarcodeDrawParams): number;
    /** Margin after the last bar. */
    marginRight(_params: BarcodeDrawParams): number;
    /** The text operations drawn under the bars. */
    makeText(data: string, params: BarcodeDrawParams, _lineWidth: number): BarcodeElement[];
    /**
     * Expand a bit-encoded integer into `count` bars, least significant bit
     * first — the order the symbol tables are written in.
     */
    add(data: number, count: number): boolean[];
    /** A hexadecimal digest of the bars, for comparing against upstream. */
    toHex(data: string): string;
    /** The text this barcode would draw, for comparing against upstream. */
    getText(data: string): string;
    /**
     * The actual symbology: the presence or absence of a bar, one entry per
     * module, at the narrowest module width.
     */
    abstract convert(data: string): boolean[];
}
/** Fill in the optional halves of [BarcodeMakeOptions]. */
export declare function drawParams(options: BarcodeMakeOptions): BarcodeDrawParams;
