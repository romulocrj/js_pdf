/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port:
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
 */

import { assertFiniteNumber } from '../base/assert.ts';
import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import { BoxConstraints } from './geometry.ts';
import { normalizeBoxDecoration } from './decoration.ts';
import type { BoxDecorationInput } from './decoration.ts';
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

function side(input: TableBorderSideInput | undefined): TableBorderSide | null {
  if (input === null || input === undefined) {
    return null;
  }
  const width = Math.max(0, assertFiniteNumber(Number(input.width ?? 1), 'border width'));
  if (width === 0) {
    return null;
  }
  return { color: normalizeColor(input.color ?? '#000000'), width };
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
        const scale = maximum / fixedSpace;
        for (let index = 0; index < count; index++) {
          if (flex[index]! === 0) widths[index] = widths[index]! * scale;
        }
        fixedSpace = maximum;
      }
      const remaining = Math.max(0, maximum - fixedSpace);
      for (let index = 0; index < count; index++) {
        if (flex[index]! > 0) widths[index] = remaining * flex[index]! / totalFlex;
      }
      return widths;
    }

    if (this.tableWidth === 'max') {
      if (intrinsicTotal === 0) {
        return widths.map(() => count === 0 ? 0 : maximum / count);
      }
      const scale = maximum / intrinsicTotal;
      return widths.map(value => value * scale);
    }

    if (intrinsicTotal > maximum && intrinsicTotal > 0) {
      const scale = maximum / intrinsicTotal;
      return widths.map(value => value * scale);
    }
    return widths;
  }

  private layoutRows(
    context: RenderContext,
    _constraints: Constraints,
    columnWidths: readonly number[],
    selectedRows: readonly TableRow[]
  ): LayoutBox<TableLayoutData> {
    if (columnWidths.length === 0) {
      return { widget: this, width: 0, height: 0, data: { columnWidths, rowHeights: [], rows: [] } };
    }

    const rows: TableRowLayout[] = [];
    const rowHeights: number[] = [];
    let rowY = 0;

    for (const row of selectedRows) {
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
    return this.layoutRows(context, constraints, columnWidths, this.children);
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

    const columnWidths = this.resolveWidths(context, constraints);
    const candidates: { readonly row: TableRow; readonly index: number }[] = [];
    for (let index = 0; index < this.children.length; index++) {
      const row = this.children[index]!;
      if (index >= nextRow || row.repeat) {
        candidates.push({ row, index });
      }
    }

    const measured = this.layoutRows(
      context,
      constraints,
      columnWidths,
      candidates.map(candidate => candidate.row)
    );
    let height = 0;
    let count = 0;
    let followingRow = nextRow;

    for (let index = 0; index < measured.data.rows.length; index++) {
      const rowHeight = measured.data.rowHeights[index] ?? 0;
      if (height + rowHeight > constraints.maxHeight + 0.001) {
        break;
      }
      height += rowHeight;
      count++;
      const originalIndex = candidates[index]!.index;
      if (originalIndex >= followingRow) {
        followingRow = originalIndex + 1;
      }
    }

    const hasMore = followingRow < this.children.length;
    if (hasMore && followingRow === nextRow) {
      const emptyBox: LayoutBox<TableLayoutData> = {
        widget: this,
        width: columnWidths.reduce((sum, value) => sum + value, 0),
        height: 0,
        data: { columnWidths, rowHeights: [], rows: [] }
      };
      return { box: emptyBox, nextState: state, hasMore: true };
    }

    const rows = measured.data.rows.slice(0, count);
    const rowHeights = measured.data.rowHeights.slice(0, count);
    const box: LayoutBox<TableLayoutData> = {
      widget: this,
      width: measured.width,
      height,
      data: { columnWidths, rowHeights, rows }
    };
    return {
      box,
      nextState: Object.freeze({ nextRow: followingRow }),
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
