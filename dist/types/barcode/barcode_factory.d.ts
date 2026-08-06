import type { Barcode, BarcodeType } from './barcode.ts';
import type { BarcodeCodabarStartStop as CodabarStartStop } from './codabar.ts';
import type { Pdf417SecurityLevel as Pdf417Level } from './pdf417.ts';
import type { BarcodeQRCorrectionLevel as QrCorrectionLevel } from './qrcode.ts';
export interface Code128FactoryOptions {
    readonly useCode128A?: boolean;
    readonly useCode128B?: boolean;
    readonly useCode128C?: boolean;
    readonly escapes?: boolean;
}
export interface Gs128FactoryOptions extends Code128FactoryOptions {
    readonly addSpaceAfterParenthesis?: boolean;
    readonly keepParenthesis?: boolean;
}
export interface ItfFactoryOptions {
    readonly addChecksum?: boolean;
    readonly zeroPrepend?: boolean;
    readonly drawBorder?: boolean;
    readonly borderWidth?: number | null;
    readonly quietWidth?: number | null;
    readonly fixedLength?: number | null;
}
export interface ItfFixedFactoryOptions {
    readonly drawBorder?: boolean;
    readonly borderWidth?: number | null;
    readonly quietWidth?: number | null;
}
export interface CodabarFactoryOptions {
    readonly start?: CodabarStartStop;
    readonly stop?: CodabarStartStop;
    readonly printStartStop?: boolean;
    readonly explicitStartStop?: boolean;
}
/** Static constructor surface compatible with `Barcode.foo()` upstream. */
export declare class BarcodeFactory {
    private constructor();
    static fromType(type: BarcodeType): Barcode;
    static code39({ drawSpacers }?: {
        readonly drawSpacers?: boolean;
    }): Barcode;
    static code93(): Barcode;
    static code128({ useCode128A, useCode128B, useCode128C, escapes }?: Code128FactoryOptions): Barcode;
    static gs128({ useCode128A, useCode128B, useCode128C, escapes, addSpaceAfterParenthesis, keepParenthesis }?: Gs128FactoryOptions): Barcode;
    static itf({ addChecksum, zeroPrepend, drawBorder, borderWidth, quietWidth, fixedLength }?: ItfFactoryOptions): Barcode;
    static itf14({ drawBorder, borderWidth, quietWidth }?: ItfFixedFactoryOptions): Barcode;
    static itf16({ drawBorder, borderWidth, quietWidth }?: ItfFixedFactoryOptions): Barcode;
    static ean13({ drawEndChar }?: {
        readonly drawEndChar?: boolean;
    }): Barcode;
    static ean8({ drawSpacers }?: {
        readonly drawSpacers?: boolean;
    }): Barcode;
    static ean5(): Barcode;
    static ean2(): Barcode;
    static isbn({ drawEndChar, drawIsbn }?: {
        readonly drawEndChar?: boolean;
        readonly drawIsbn?: boolean;
    }): Barcode;
    static upcA(): Barcode;
    static upcE({ fallback }?: {
        readonly fallback?: boolean;
    }): Barcode;
    static telepen(): Barcode;
    static qrCode({ typeNumber, errorCorrectLevel }?: {
        readonly typeNumber?: number | null;
        readonly errorCorrectLevel?: QrCorrectionLevel;
    }): Barcode;
    static pdf417({ securityLevel, moduleHeight, preferredRatio }?: {
        readonly securityLevel?: Pdf417Level;
        readonly moduleHeight?: number;
        readonly preferredRatio?: number;
    }): Barcode;
    static codabar({ start, stop, printStartStop, explicitStartStop }?: CodabarFactoryOptions): Barcode;
    static rm4scc(): Barcode;
    static postnet(): Barcode;
}
