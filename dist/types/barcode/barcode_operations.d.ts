/** A [Barcode] drawing operation. */
export declare class BarcodeElement {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    constructor(left: number, top: number, width: number, height: number);
    get right(): number;
    get bottom(): number;
}
/** A rectangle: one white or black unit of the symbol. */
export declare class BarcodeBar extends BarcodeElement {
    /** Whether this rectangle is black. */
    readonly black: boolean;
    constructor(left: number, top: number, width: number, height: number, black: boolean);
}
/** Text alignment inside a [BarcodeText] zone. */
export type BarcodeTextAlign = 'left' | 'center' | 'right';
/** A text drawing operation. */
export declare class BarcodeText extends BarcodeElement {
    /** Text to display in this rectangle. */
    readonly text: string;
    /** Where the text sits inside its rectangle. */
    readonly align: BarcodeTextAlign;
    constructor(left: number, top: number, width: number, height: number, text: string, align: BarcodeTextAlign);
}
