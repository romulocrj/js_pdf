import type { ColorInput } from './color.ts';
export interface TextStyle {
    readonly fontSize: number;
    readonly color: ColorInput;
}
export interface CircleOptions {
    readonly fill?: ColorInput | null;
    readonly stroke?: ColorInput | null;
    readonly lineWidth?: number;
}
/**
 * Content-stream builder for one page.
 *
 * Coordinates given to these methods are top-left origin (the widget layer's
 * convention); the canvas flips them into PDF's bottom-left user space. Like
 * upstream `PdfGraphics`, the operators are appended to a buffer and never
 * re-read.
 */
export declare class PdfCanvas {
    readonly pageHeight: number;
    private readonly commands;
    constructor(pageHeight: number);
    push(command: string): void;
    save(): void;
    restore(): void;
    fillRect(x: number, top: number, width: number, height: number, color: ColorInput): void;
    strokeRect(x: number, top: number, width: number, height: number, color: ColorInput, lineWidth?: number): void;
    text(text: string, x: number, baselineFromTop: number, style: TextStyle): void;
    line(x1: number, top1: number, x2: number, top2: number, color?: ColorInput, lineWidth?: number): void;
    circle(cx: number, topCenter: number, radius: number, { fill, stroke, lineWidth }?: CircleOptions): void;
    output(): string;
}
