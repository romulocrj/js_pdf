import type { Barcode } from '../barcode/barcode.ts';
import type { ColorInput } from '../pdf/color.ts';
import type { BoxDecorationInput } from './decoration.ts';
import type { InsetsInput } from './geometry.ts';
import { TextStyle } from './text_style.ts';
import { StatelessWidget } from './widget.ts';
import type { AnyWidget, RenderContext } from './widget.ts';
export interface BarcodeWidgetOptions {
    readonly data: string | Uint8Array;
    readonly barcode: Barcode;
    readonly color?: ColorInput;
    readonly backgroundColor?: ColorInput | null;
    readonly decoration?: BoxDecorationInput | null;
    readonly margin?: InsetsInput | null;
    readonly padding?: InsetsInput | null;
    readonly width?: number | null;
    readonly height?: number | null;
    readonly drawText?: boolean;
    readonly textStyle?: TextStyle | null;
    readonly textPadding?: number;
}
/** Draw a one- or two-dimensional barcode inside the widget tree. */
export declare class BarcodeWidget extends StatelessWidget {
    readonly dataString: string | null;
    readonly dataBytes: Uint8Array | null;
    readonly barcode: Barcode;
    readonly color: ColorInput;
    readonly backgroundColor: ColorInput | null;
    readonly decoration: BoxDecorationInput | null;
    readonly margin: InsetsInput | null;
    readonly padding: InsetsInput | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly drawText: boolean;
    readonly textStyle: TextStyle | null;
    readonly textPadding: number;
    constructor({ data, barcode, color, backgroundColor, decoration, margin, padding, width, height, drawText, textStyle, textPadding }: BarcodeWidgetOptions);
    get data(): Uint8Array;
    build(context: RenderContext): AnyWidget;
}
