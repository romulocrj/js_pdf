import type { ColorInput, Rgb } from '../pdf/color.ts';
import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export type TableCellVerticalAlignment = 'bottom' | 'middle' | 'top' | 'full';
export type TableWidth = 'min' | 'max';
export interface TableBorderSideOptions {
    readonly color?: ColorInput;
    readonly width?: number;
}
export interface TableBorderSide {
    readonly color: Rgb;
    readonly width: number;
}
export type TableBorderSideInput = TableBorderSideOptions | TableBorderSide | null;
export interface TableBorderOptions {
    readonly left?: TableBorderSideInput;
    readonly top?: TableBorderSideInput;
    readonly right?: TableBorderSideInput;
    readonly bottom?: TableBorderSideInput;
    readonly horizontalInside?: TableBorderSideInput;
    readonly verticalInside?: TableBorderSideInput;
}
/** Exterior and interior rules for a table. */
export declare class TableBorder {
    readonly left: TableBorderSide | null;
    readonly top: TableBorderSide | null;
    readonly right: TableBorderSide | null;
    readonly bottom: TableBorderSide | null;
    readonly horizontalInside: TableBorderSide | null;
    readonly verticalInside: TableBorderSide | null;
    constructor({ left, top, right, bottom, horizontalInside, verticalInside }?: TableBorderOptions);
    static all({ color, width }?: TableBorderSideOptions): TableBorder;
    static symmetric({ inside, outside }?: {
        readonly inside?: TableBorderSideInput;
        readonly outside?: TableBorderSideInput;
    }): TableBorder;
    paint(context: RenderContext, x: number, y: number, width: number, height: number, columnWidths?: readonly number[], rowHeights?: readonly number[]): void;
}
export type TableBorderInput = TableBorder | TableBorderOptions;
export declare function normalizeTableBorder(input: TableBorderInput | null | undefined): TableBorder | null;
/** The subset of box decoration table rows and helper cells need in phase 3.1. */
export interface TableDecorationInput {
    readonly color?: ColorInput | null;
    readonly border?: TableBorderInput | null;
}
export declare function paintTableDecorationBackground(context: RenderContext, decoration: TableDecorationInput | null, x: number, y: number, width: number, height: number): void;
export declare function paintTableDecorationBorder(context: RenderContext, decoration: TableDecorationInput | null, x: number, y: number, width: number, height: number): void;
export interface TableRowOptions {
    readonly children: readonly AnyWidget[];
    readonly repeat?: boolean;
    readonly verticalAlignment?: TableCellVerticalAlignment | null;
    readonly decoration?: TableDecorationInput | null;
}
/** A horizontal group of cells in a `Table`. */
export declare class TableRow {
    readonly children: readonly AnyWidget[];
    readonly repeat: boolean;
    readonly verticalAlignment: TableCellVerticalAlignment | null;
    readonly decoration: TableDecorationInput | null;
    constructor({ children, repeat, verticalAlignment, decoration }: TableRowOptions);
}
export interface ColumnLayout {
    readonly width: number;
    readonly flex: number;
}
/** How one table column contributes its intrinsic and flexible width. */
export declare abstract class TableColumnWidth {
    abstract layout(child: AnyWidget, context: RenderContext, constraints: Constraints): ColumnLayout;
}
export declare class IntrinsicColumnWidth extends TableColumnWidth {
    readonly flex: number | null;
    constructor({ flex }?: {
        readonly flex?: number | null;
    });
    layout(child: AnyWidget, context: RenderContext, constraints: Constraints): ColumnLayout;
}
export declare class FixedColumnWidth extends TableColumnWidth {
    readonly width: number;
    constructor(width: number);
    layout(): ColumnLayout;
}
export declare class FlexColumnWidth extends TableColumnWidth {
    readonly flex: number;
    constructor(flex?: number);
    layout(): ColumnLayout;
}
export declare class FractionColumnWidth extends TableColumnWidth {
    readonly value: number;
    constructor(value: number);
    layout(_child: AnyWidget, _context: RenderContext, constraints: Constraints): ColumnLayout;
}
export type TableColumnWidthMap = Readonly<Record<number, TableColumnWidth>> | ReadonlyMap<number, TableColumnWidth>;
export interface TableCellLayout {
    readonly box: AnyLayoutBox;
    readonly column: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export interface TableRowLayout {
    readonly row: TableRow;
    readonly cells: readonly TableCellLayout[];
    readonly y: number;
    readonly height: number;
}
export interface TableLayoutData {
    readonly columnWidths: readonly number[];
    readonly rowHeights: readonly number[];
    readonly rows: readonly TableRowLayout[];
}
export interface TableOptions {
    readonly children?: readonly TableRow[];
    readonly border?: TableBorderInput | null;
    readonly defaultVerticalAlignment?: TableCellVerticalAlignment;
    readonly columnWidths?: TableColumnWidthMap | null;
    readonly defaultColumnWidth?: TableColumnWidth;
    readonly tableWidth?: TableWidth;
}
/** A grid whose rows share one set of computed column tracks. */
export declare class Table extends Widget<TableLayoutData> {
    readonly children: readonly TableRow[];
    readonly border: TableBorder | null;
    readonly defaultVerticalAlignment: TableCellVerticalAlignment;
    readonly columnWidths: TableColumnWidthMap | null;
    readonly defaultColumnWidth: TableColumnWidth;
    readonly tableWidth: TableWidth;
    constructor({ children, border, defaultVerticalAlignment, columnWidths, defaultColumnWidth, tableWidth }?: TableOptions);
    private resolveWidths;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<TableLayoutData>;
    paint(context: RenderContext, box: PositionedBox<TableLayoutData>): void;
}
