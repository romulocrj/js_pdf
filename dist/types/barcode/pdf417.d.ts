import { Barcode2D, Barcode2DMatrix } from './barcode_2d.ts';
/**
 * PDF417 error recovery levels.
 *
 * The numeric values are load-bearing: the level indexes the correction-factor
 * table and sets the codeword count, as upstream's enum indices do.
 */
export declare const Pdf417SecurityLevel: {
    readonly level0: 0;
    readonly level1: 1;
    readonly level2: 2;
    readonly level3: 3;
    readonly level4: 4;
    readonly level5: 5;
    readonly level6: 6;
    readonly level7: 7;
    readonly level8: 8;
};
export type Pdf417SecurityLevel = (typeof Pdf417SecurityLevel)[keyof typeof Pdf417SecurityLevel];
/**
 * PDF417 barcode.
 *
 * A stacked linear format used on transport documents, identification cards
 * and inventory labels.
 */
export declare class BarcodePDF417 extends Barcode2D {
    /** Height of the bars, in modules. */
    readonly moduleHeight: number;
    /** The width-to-height ratio the layout aims for. */
    readonly preferredRatio: number;
    /** Error recovery level. */
    readonly securityLevel: Pdf417SecurityLevel;
    constructor(securityLevel: Pdf417SecurityLevel, moduleHeight: number, preferredRatio: number);
    get charSet(): Iterable<number>;
    get name(): string;
    get maxLength(): number;
    convert(data: Uint8Array): Barcode2DMatrix;
    private encodeData;
    private calcDimensions;
    private encodeText;
    private consecutiveTextCount;
    private consecutiveBinaryCount;
    private highlevelEncode;
}
