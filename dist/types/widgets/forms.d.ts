import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfFormHighlighting, PdfTextFieldAlign } from '../pdf/obj/annotation.ts';
import type { InsetsInput } from './geometry.ts';
import { TextStyle } from './text_style.ts';
import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export type PdfFieldFlag = 'readOnly' | 'mandatory' | 'noExport' | 'multiline' | 'password' | 'noToggleToOff' | 'radio' | 'pushButton' | 'combo' | 'edit' | 'sort' | 'fileSelect' | 'multiSelect' | 'doNotSpellCheck' | 'doNotScroll' | 'comb' | 'radiosInUnison' | 'commitOnSelChange';
interface FormLayoutData {
    readonly childBox: AnyLayoutBox;
}
export interface ChoiceFieldOptions {
    readonly name: string;
    readonly items: readonly string[];
    readonly value?: string | null;
    readonly width?: number;
    readonly height?: number;
    readonly textStyle?: TextStyle | null;
}
export declare class ChoiceField extends Widget<FormLayoutData> {
    readonly name: string;
    readonly items: readonly string[];
    readonly value: string | null;
    readonly width: number;
    readonly height: number;
    readonly textStyle: TextStyle | null;
    constructor({ name, items, value, width, height, textStyle }: ChoiceFieldOptions);
    private child;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<FormLayoutData>;
    paint(context: RenderContext, box: PositionedBox<FormLayoutData>): void;
}
export interface CheckboxOptions {
    readonly name: string;
    readonly value: boolean;
    readonly tristate?: boolean;
    readonly width?: number;
    readonly height?: number;
    readonly activeColor?: ColorInput;
    readonly checkColor?: ColorInput;
    readonly borderColor?: ColorInput;
}
export declare class Checkbox extends Widget<null> {
    readonly name: string;
    readonly value: boolean;
    readonly tristate: boolean;
    readonly width: number;
    readonly height: number;
    readonly activeColor: Rgb;
    readonly checkColor: Rgb;
    readonly borderColor: Rgb;
    constructor({ name, value, tristate, width, height, activeColor, checkColor, borderColor }: CheckboxOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
    paint(context: RenderContext, box: PositionedBox<null>): void;
    private paintState;
}
export interface FlatButtonOptions {
    readonly name: string;
    readonly child: AnyWidget;
    readonly textColor?: ColorInput;
    readonly color?: ColorInput;
    readonly colorDown?: ColorInput;
    readonly colorRollover?: ColorInput;
    readonly padding?: InsetsInput;
    readonly fieldFlags?: readonly PdfFieldFlag[];
}
export declare class FlatButton extends Widget<FormLayoutData> {
    readonly name: string;
    readonly childWidget: AnyWidget;
    readonly textColor: Rgb;
    readonly color: Rgb;
    readonly colorDown: Rgb;
    readonly colorRollover: Rgb;
    readonly padding: InsetsInput;
    readonly fieldFlags: readonly PdfFieldFlag[];
    constructor({ name, child, textColor, color, colorDown, colorRollover, padding, fieldFlags }: FlatButtonOptions);
    private child;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<FormLayoutData>;
    paint(context: RenderContext, box: PositionedBox<FormLayoutData>): void;
}
export interface TextFieldOptions {
    readonly name: string;
    readonly child?: AnyWidget | null;
    readonly width?: number;
    readonly height?: number;
    readonly value?: string | null;
    readonly defaultValue?: string | null;
    readonly textStyle?: TextStyle | null;
    readonly maxLength?: number | null;
    readonly alternateName?: string | null;
    readonly mappingName?: string | null;
    readonly fieldFlags?: readonly PdfFieldFlag[];
    readonly textAlign?: PdfTextFieldAlign | null;
    readonly color?: ColorInput | null;
    readonly backgroundColor?: ColorInput | null;
    readonly highlighting?: PdfFormHighlighting | null;
}
export declare class TextField extends Widget<FormLayoutData> {
    readonly options: TextFieldOptions;
    readonly name: string;
    constructor(options: TextFieldOptions);
    private child;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<FormLayoutData>;
    paint(context: RenderContext, box: PositionedBox<FormLayoutData>): void;
}
export {};
