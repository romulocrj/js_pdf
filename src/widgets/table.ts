/*
 * Ported to JavaScript from https://github.com/DavBfr/dart_pdf
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port: https://github.com/romulocrj/js_pdf
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/widgets/table.dart
 *
 * Table continuation uses the port's immutable spanning state rather than
 * upstream's mutable `TableContext`; repeated layout of one state is therefore
 * deterministic and cannot overwrite a fragment already assigned to a page.
 * The state also carries the resolved column widths, which upstream memoizes
 * on the widget (PR #1980), so a long MultiPage table is no longer quadratic.
 *
 * Overflowing columns shrink as CSS automatic table layout does (upstream
 * PR #1716, reworked in #1980): no column goes below its min-content width
 * unless even the min-content total overflows. Min-content is measured by an
 * ordinary layout pass with the context's `minContent` flag set, instead of
 * upstream's `MinContentWidth` inherited marker and `PdfRect.minWidth`.
 */

import { assertFiniteNumber } from '../base/assert.ts';
import { normalizePaintColor } from '../pdf/color.ts';
import type { ColorInput, PaintColor } from '../pdf/color.ts';
import { BoxConstraints } from './geometry.ts';
import { normalizeBoxDecoration } from './decoration.ts';
import type { BoxDecorationInput } from './decoration.ts';
import type { ThemeData } from './theme.ts';
import { SpanningWidget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export type TableCellVerticalAlignment = 'bottom' | 'middle' | 'top' | 'full';
export type TableWidth = 'min' | 'max';

export interface TableBorderSideOptions {
  readonly color?: ColorInput;
  readonly width?: number;
}

export interface TableBorderSide {
  readonly color: PaintColor;
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

function side(input: TableBorderSideInput | undefined): TableBorderSide | null {
  if (input === null || input === undefined) {
    return null;
  }
  const width = Math.max(0, assertFiniteNumber(Number(input.width ?? 1), 'border width'));
  if (width === 0) {
    return null;
  }
  return { color: normalizePaintColor(input.color ?? '#000000'), width };
}

/** Exterior and interior rules for a table. */
export class TableBorder {
  readonly left: TableBorderSide | null;
  readonly top: TableBorderSide | null;
  readonly right: TableBorderSide | null;
  readonly bottom: TableBorderSide | null;
  readonly horizontalInside: TableBorderSide | null;
  readonly verticalInside: TableBorderSide | null;

  constructor({
    left = null,
    top = null,
    right = null,
    bottom = null,
    horizontalInside = null,
    verticalInside = null
  }: TableBorderOptions = {}) {
    this.left = side(left);
    this.top = side(top);
    this.right = side(right);
    this.bottom = side(bottom);
    this.horizontalInside = side(horizontalInside);
    this.verticalInside = side(verticalInside);
  }

  static all({ color = '#000000', width = 1 }: TableBorderSideOptions = {}): TableBorder {
    const value = { color, width };
    return new TableBorder({
      left: value,
      top: value,
      right: value,
      bottom: value,
      horizontalInside: value,
      verticalInside: value
    });
  }

  static symmetric({
    inside = null,
    outside = null
  }: {
    readonly inside?: TableBorderSideInput;
    readonly outside?: TableBorderSideInput;
  } = {}): TableBorder {
    return new TableBorder({
      left: outside,
      top: outside,
      right: outside,
      bottom: outside,
      horizontalInside: inside,
      verticalInside: inside
    });
  }

  paint(
    context: RenderContext,
    x: number,
    y: number,
    width: number,
    height: number,
    columnWidths: readonly number[] = [],
    rowHeights: readonly number[] = []
  ): void {
    const { canvas } = context;
    const draw = (
      value: TableBorderSide | null,
      x1: number,
      y1: number,
      x2: number,
      y2: number
    ): void => {
      if (value !== null) {
        canvas.line(x1, y1, x2, y2, value.color, value.width);
      }
    };

    draw(this.top, x, y, x + width, y);
    draw(this.right, x + width, y, x + width, y + height);
    draw(this.bottom, x, y + height, x + width, y + height);
    draw(this.left, x, y, x, y + height);

    let offset = x;
    for (let index = 0; index < columnWidths.length - 1; index++) {
      offset += columnWidths[index]!;
      draw(this.verticalInside, offset, y, offset, y + height);
    }

    offset = y;
    for (let index = 0; index < rowHeights.length - 1; index++) {
      offset += rowHeights[index]!;
      draw(this.horizontalInside, x, offset, x + width, offset);
    }
  }
}

export type TableBorderInput = TableBorder | TableBorderOptions;

export function normalizeTableBorder(input: TableBorderInput | null | undefined): TableBorder | null {
  if (input === null || input === undefined) {
    return null;
  }
  return input instanceof TableBorder ? input : new TableBorder(input);
}

/** A row or helper-cell decoration, shared with `Container`. */
export type TableDecorationInput = BoxDecorationInput;

export function paintTableDecorationBackground(
  context: RenderContext,
  decoration: TableDecorationInput | null,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  normalizeBoxDecoration(decoration)?.paint(context, x, y, width, height, 'background');
}

export function paintTableDecorationBorder(
  context: RenderContext,
  decoration: TableDecorationInput | null,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  normalizeBoxDecoration(decoration)?.paint(context, x, y, width, height, 'foreground');
}

export interface TableRowOptions {
  readonly children: readonly AnyWidget[];
  readonly repeat?: boolean;
  readonly verticalAlignment?: TableCellVerticalAlignment | null;
  readonly decoration?: TableDecorationInput | null;
}

/** A horizontal group of cells in a `Table`. */
export class TableRow {
  readonly children: readonly AnyWidget[];
  readonly repeat: boolean;
  readonly verticalAlignment: TableCellVerticalAlignment | null;
  readonly decoration: TableDecorationInput | null;

  constructor({
    children,
    repeat = false,
    verticalAlignment = null,
    decoration = null
  }: TableRowOptions) {
    this.children = children;
    this.repeat = Boolean(repeat);
    this.verticalAlignment = verticalAlignment;
    this.decoration = decoration;
  }
}

export interface ColumnLayout {
  readonly width: number;
  readonly flex: number;
}

/** How one table column contributes its intrinsic and flexible width. */
export abstract class TableColumnWidth {
  abstract layout(child: AnyWidget, context: RenderContext, constraints: Constraints): ColumnLayout;
}

export class IntrinsicColumnWidth extends TableColumnWidth {
  readonly flex: number | null;

  constructor({ flex = null }: { readonly flex?: number | null } = {}) {
    super();
    this.flex = flex === null
      ? null
      : Math.max(0, assertFiniteNumber(Number(flex), 'intrinsic column flex'));
  }

  override layout(child: AnyWidget, context: RenderContext, constraints: Constraints): ColumnLayout {
    if (this.flex !== null) {
      return { width: 0, flex: this.flex };
    }
    const box = child.layout(context, constraints);
    return {
      width: Number.isFinite(box.width) ? Math.max(0, box.width) : 0,
      flex: Number.isFinite(box.width) ? 0 : 1
    };
  }
}

export class FixedColumnWidth extends TableColumnWidth {
  readonly width: number;

  constructor(width: number) {
    super();
    this.width = Math.max(0, assertFiniteNumber(Number(width), 'fixed column width'));
  }

  override layout(): ColumnLayout {
    return { width: this.width, flex: 0 };
  }
}

export class FlexColumnWidth extends TableColumnWidth {
  readonly flex: number;

  constructor(flex = 1) {
    super();
    this.flex = Math.max(0, assertFiniteNumber(Number(flex), 'column flex'));
  }

  override layout(): ColumnLayout {
    return { width: 0, flex: this.flex };
  }
}

export class FractionColumnWidth extends TableColumnWidth {
  readonly value: number;

  constructor(value: number) {
    super();
    this.value = Math.max(0, assertFiniteNumber(Number(value), 'column fraction'));
  }

  override layout(_child: AnyWidget, _context: RenderContext, constraints: Constraints): ColumnLayout {
    return { width: constraints.maxWidth * this.value, flex: 0 };
  }
}

export type TableColumnWidthMap =
  | Readonly<Record<number, TableColumnWidth>>
  | ReadonlyMap<number, TableColumnWidth>;

function mappedWidth(map: TableColumnWidthMap | null, index: number): TableColumnWidth | undefined {
  if (map === null) return undefined;
  if (map instanceof Map) return map.get(index);
  return (map as Readonly<Record<number, TableColumnWidth>>)[index];
}

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

export interface TableSpanState {
  readonly nextRow: number;
  /** Column widths resolved by an earlier fragment, and what they were resolved for. */
  readonly widths?: {
    readonly key: string;
    readonly theme: ThemeData;
    readonly columns: readonly number[];
  };
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
export class Table extends SpanningWidget<TableLayoutData, TableSpanState> {
  readonly children: readonly TableRow[];
  readonly border: TableBorder | null;
  readonly defaultVerticalAlignment: TableCellVerticalAlignment;
  readonly columnWidths: TableColumnWidthMap | null;
  readonly defaultColumnWidth: TableColumnWidth;
  readonly tableWidth: TableWidth;

  constructor({
    children = [],
    border = null,
    defaultVerticalAlignment = 'top',
    columnWidths = null,
    defaultColumnWidth = new IntrinsicColumnWidth(),
    tableWidth = 'max'
  }: TableOptions = {}) {
    super();
    if (!['bottom', 'middle', 'top', 'full'].includes(defaultVerticalAlignment)) {
      throw new TypeError(`Unknown table vertical alignment: ${defaultVerticalAlignment}`);
    }
    if (tableWidth !== 'min' && tableWidth !== 'max') {
      throw new TypeError(`Unknown table width: ${tableWidth}`);
    }
    this.children = children;
    this.border = normalizeTableBorder(border);
    this.defaultVerticalAlignment = defaultVerticalAlignment;
    this.columnWidths = columnWidths;
    this.defaultColumnWidth = defaultColumnWidth;
    this.tableWidth = tableWidth;
  }

  private resolveWidths(context: RenderContext, constraints: Constraints): number[] {
    const count = this.children.reduce((maximum, row) => Math.max(maximum, row.children.length), 0);
    const widths = Array.from({ length: count }, () => 0);
    const flex = Array.from({ length: count }, () => 0);

    for (const row of this.children) {
      for (let index = 0; index < row.children.length; index++) {
        const child = row.children[index]!;
        const columnWidth = mappedWidth(this.columnWidths, index) ?? this.defaultColumnWidth;
        const measured = columnWidth.layout(child, context, constraints);
        widths[index] = Math.max(widths[index]!, measured.width);
        flex[index] = Math.max(flex[index]!, measured.flex);
      }
    }

    if (count === 0 || !Number.isFinite(constraints.maxWidth)) {
      return widths;
    }

    const maximum = Math.max(0, constraints.maxWidth);
    const totalFlex = flex.reduce((sum, value) => sum + value, 0);
    const intrinsicTotal = widths.reduce((sum, value) => sum + value, 0);

    if (totalFlex > 0) {
      let fixedSpace = widths.reduce(
        (sum, value, index) => sum + (flex[index]! === 0 ? value : 0),
        0
      );
      if (fixedSpace > maximum && fixedSpace > 0) {
        this.fitColumns(context, constraints, widths, flex, maximum);
        fixedSpace = maximum;
      }
      const remaining = Math.max(0, maximum - fixedSpace);
      for (let index = 0; index < count; index++) {
        if (flex[index]! > 0) widths[index] = remaining * flex[index]! / totalFlex;
      }
      return widths;
    }

    if (intrinsicTotal > maximum && intrinsicTotal > 0) {
      this.fitColumns(context, constraints, widths, flex, maximum);
      return widths;
    }

    if (this.tableWidth === 'max') {
      if (intrinsicTotal === 0) {
        return widths.map(() => count === 0 ? 0 : maximum / count);
      }
      const scale = maximum / intrinsicTotal;
      return widths.map(value => value * scale);
    }
    return widths;
  }

  /**
   * Shrinks the inflexible columns, which together overflow `maximum`, in place.
   *
   * Every column used to be scaled by one factor, so a short column went below
   * the width of one word and its cell hard-split it: `ATLANTICA` became
   * `ATLANTI` / `CA`. Each column now keeps its min-content width, and the
   * space left over is shared in proportion to how much more each wanted. Only
   * when even the min-content total overflows are the minimums scaled together
   * — which is the old uniform scaling whenever no column could shrink.
   */
  private fitColumns(
    context: RenderContext,
    constraints: Constraints,
    widths: number[],
    flex: readonly number[],
    maximum: number
  ): void {
    const minContext: RenderContext = { ...context, minContent: true };
    const mins = widths.map(() => 0);
    for (const row of this.children) {
      for (let index = 0; index < row.children.length; index++) {
        if (flex[index]! !== 0) continue;
        const width = widths[index]!;
        const columnWidth = mappedWidth(this.columnWidths, index) ?? this.defaultColumnWidth;
        // Only intrinsic columns measure content; any other kind is as unbreakable as it is wide.
        let minimum = width;
        if (columnWidth instanceof IntrinsicColumnWidth && columnWidth.flex === null) {
          const box = row.children[index]!.layout(minContext, constraints);
          if (Number.isFinite(box.width)) minimum = Math.min(width, Math.max(0, box.width));
        }
        mins[index] = Math.max(mins[index]!, minimum);
      }
    }

    let totalMin = 0;
    let totalMax = 0;
    for (let index = 0; index < widths.length; index++) {
      if (flex[index]! !== 0) continue;
      totalMin += mins[index]!;
      totalMax += widths[index]!;
    }
    const share = (maximum - totalMin) / (totalMax - totalMin);
    const scale = maximum / totalMin;
    for (let index = 0; index < widths.length; index++) {
      if (flex[index]! !== 0) continue;
      widths[index] = totalMin <= maximum
        ? mins[index]! + (widths[index]! - mins[index]!) * share
        : mins[index]! * scale;
    }
  }

  /**
   * Lays out `headers`, then this table's rows from `start`, stopping before the
   * first row that would end below `maxHeight`. The rows after it are never
   * measured: a MultiPage fragment used to lay out every remaining row and then
   * keep a page's worth, which made a long table quadratic.
   */
  private layoutRows(
    context: RenderContext,
    columnWidths: readonly number[],
    headers: readonly TableRow[],
    start: number,
    maxHeight: number
  ): LayoutBox<TableLayoutData> {
    if (columnWidths.length === 0) {
      return { widget: this, width: 0, height: 0, data: { columnWidths, rowHeights: [], rows: [] } };
    }

    const rows: TableRowLayout[] = [];
    const rowHeights: number[] = [];
    let rowY = 0;
    const total = headers.length + this.children.length - start;

    for (let position = 0; position < total; position++) {
      const row = position < headers.length
        ? headers[position]!
        : this.children[start + position - headers.length]!;
      const measured: { readonly box: AnyLayoutBox; readonly column: number; readonly x: number; }[] = [];
      let x = 0;
      let rowHeight = 0;

      for (let column = 0; column < row.children.length; column++) {
        const child = row.children[column]!;
        const width = columnWidths[column] ?? 0;
        const box = child.layout(context, new BoxConstraints({
          minWidth: width,
          maxWidth: width,
          maxHeight: Infinity
        }));
        measured.push({ box, column, x });
        rowHeight = Math.max(rowHeight, box.height);
        x += width;
      }
      if (rowY + rowHeight > maxHeight + 0.001) break;

      const alignment = row.verticalAlignment ?? this.defaultVerticalAlignment;
      const cells: TableCellLayout[] = measured.map(cell => {
        const height = alignment === 'full' ? rowHeight : cell.box.height;
        const dy = alignment === 'bottom'
          ? rowHeight - cell.box.height
          : alignment === 'middle'
            ? (rowHeight - cell.box.height) / 2
            : 0;
        return {
          ...cell,
          y: rowY + dy,
          width: columnWidths[cell.column] ?? 0,
          height
        };
      });

      rows.push({ row, cells, y: rowY, height: rowHeight });
      rowHeights.push(rowHeight);
      rowY += rowHeight;
    }

    return {
      widget: this,
      width: columnWidths.reduce((sum, value) => sum + value, 0),
      height: rowY,
      data: { columnWidths, rowHeights, rows }
    };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<TableLayoutData> {
    const columnWidths = this.resolveWidths(context, constraints);
    return this.layoutRows(context, columnWidths, [], 0, Infinity);
  }

  override initialSpanState(): TableSpanState {
    return Object.freeze({ nextRow: 0 });
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: TableSpanState
  ): { readonly box: LayoutBox<TableLayoutData>; readonly nextState: TableSpanState; readonly hasMore: boolean } {
    const nextRow = Number(state.nextRow);
    if (!Number.isInteger(nextRow) || nextRow < 0 || nextRow > this.children.length) {
      throw new RangeError('Invalid table continuation state');
    }

    /*
     * Column widths depend on the constraints (an intrinsic cell is measured
     * against them) and the theme, so they are reused only for the same pair.
     * Every page after the first has the same constraints, and the measure pass
     * then runs once instead of once per page.
     */
    const parent = BoxConstraints.from(constraints);
    const key = `${parent.minWidth},${parent.maxWidth},${parent.minHeight},${parent.maxHeight}`;
    let widths = state.widths;
    if (widths === undefined || widths.key !== key || widths.theme !== context.theme) {
      widths = Object.freeze({
        key,
        theme: context.theme,
        columns: Object.freeze(this.resolveWidths(context, constraints))
      });
    }
    const columnWidths = widths.columns;

    // Rows already placed that repeat at the top of every later fragment.
    const headers: TableRow[] = [];
    for (let index = 0; index < nextRow; index++) {
      if (this.children[index]!.repeat) headers.push(this.children[index]!);
    }
    const box = this.layoutRows(context, columnWidths, headers, nextRow, constraints.maxHeight);
    const followingRow = nextRow + Math.max(0, box.data.rows.length - headers.length);

    const hasMore = followingRow < this.children.length;
    if (hasMore && followingRow === nextRow) {
      const emptyBox: LayoutBox<TableLayoutData> = {
        widget: this,
        width: columnWidths.reduce((sum, value) => sum + value, 0),
        height: 0,
        data: { columnWidths, rowHeights: [], rows: [] }
      };
      return { box: emptyBox, nextState: Object.freeze({ nextRow, widths }), hasMore: true };
    }

    return {
      box,
      nextState: Object.freeze({ nextRow: followingRow, widths }),
      hasMore
    };
  }

  override paint(context: RenderContext, box: PositionedBox<TableLayoutData>): void {
    const { canvas } = context;

    for (const row of box.data.rows) {
      paintTableDecorationBackground(
        context,
        row.row.decoration,
        box.x,
        box.y + row.y,
        box.width,
        row.height
      );

      for (const cell of row.cells) {
        canvas.saveContext();
        canvas.drawRect(
          box.x + cell.x,
          canvas.pageHeight - box.y - cell.y - cell.height,
          cell.width,
          cell.height
        );
        canvas.clipPath();
        cell.box.widget.paint(context, {
          ...cell.box,
          x: box.x + cell.x,
          y: box.y + cell.y,
          width: cell.width,
          height: cell.height
        });
        canvas.restoreContext();
      }
    }

    for (const row of box.data.rows) {
      paintTableDecorationBorder(
        context,
        row.row.decoration,
        box.x,
        box.y + row.y,
        box.width,
        row.height
      );
    }

    this.border?.paint(
      context,
      box.x,
      box.y,
      box.width,
      box.height,
      box.data.columnWidths,
      box.data.rowHeights
    );
  }
}
