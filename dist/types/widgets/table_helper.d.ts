import { Alignment } from './geometry.ts';
import type { InsetsInput } from './geometry.ts';
import { Table } from './table.ts';
import type { TableBorderInput, TableColumnWidth, TableColumnWidthMap, TableDecorationInput, TableWidth } from './table.ts';
import type { TextStyle } from './text_style.ts';
import type { AnyWidget, RenderContext } from './widget.ts';
export type TableAlignmentName = 'topLeft' | 'topCenter' | 'topRight' | 'centerLeft' | 'center' | 'centerRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight';
export type TableAlignmentInput = Alignment | TableAlignmentName;
type IndexedValues<T> = Readonly<Record<number, T>> | ReadonlyMap<number, T>;
export type OnCellFormat = (index: number, data: unknown) => string;
export type OnCellDecoration = (index: number, data: unknown, rowNumber: number) => TableDecorationInput | null;
export type OnCell = (index: number, data: unknown, rowNumber: number) => AnyWidget | null;
export type OnCellTextStyle = (index: number, data: unknown, rowNumber: number) => TextStyle | null;
export interface TableTextArrayOptions {
    readonly context?: RenderContext | null;
    readonly data: readonly (readonly unknown[])[];
    readonly cellPadding?: InsetsInput;
    readonly cellHeight?: number;
    readonly cellAlignment?: TableAlignmentInput;
    readonly cellAlignments?: IndexedValues<TableAlignmentInput> | null;
    readonly cellStyle?: TextStyle | null;
    readonly oddCellStyle?: TextStyle | null;
    readonly cellFormat?: OnCellFormat | null;
    readonly cellDecoration?: OnCellDecoration | null;
    readonly headerCount?: number;
    readonly headers?: readonly unknown[] | null;
    readonly headerPadding?: InsetsInput | null;
    readonly headerHeight?: number | null;
    readonly headerAlignment?: TableAlignmentInput;
    readonly headerAlignments?: IndexedValues<TableAlignmentInput> | null;
    readonly headerStyle?: TextStyle | null;
    readonly headerFormat?: OnCellFormat | null;
    readonly border?: TableBorderInput | null;
    readonly columnWidths?: TableColumnWidthMap | null;
    readonly defaultColumnWidth?: TableColumnWidth;
    readonly tableWidth?: TableWidth;
    readonly headerDecoration?: TableDecorationInput | null;
    readonly headerCellDecoration?: TableDecorationInput | null;
    readonly rowDecoration?: TableDecorationInput | null;
    readonly oddRowDecoration?: TableDecorationInput | null;
    readonly headerDirection?: unknown;
    readonly tableDirection?: unknown;
    readonly cellBuilder?: OnCell | null;
    readonly textStyleBuilder?: OnCellTextStyle | null;
}
/** Convenience builders that translate scalar arrays into table cells. */
export declare class TableHelper {
    static fromTextArray({ context, data, cellPadding, cellHeight, cellAlignment, cellAlignments, cellStyle, oddCellStyle, cellFormat, cellDecoration, headerCount, headers, headerPadding, headerHeight, headerAlignment, headerAlignments, headerStyle, headerFormat, border, columnWidths, defaultColumnWidth, tableWidth, headerDecoration, headerCellDecoration, rowDecoration, oddRowDecoration, cellBuilder, textStyleBuilder }: TableTextArrayOptions): Table;
}
export {};
