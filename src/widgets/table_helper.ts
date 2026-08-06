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
 *   - pdf/lib/src/widgets/table_helper.dart
 *   - pdf/lib/src/widgets/container.dart
 *
 * The private cell wrapper replaces upstream's composition through a tightly
 * constrained `Container`. This port does not gain minimum constraints until
 * phase 3.4, so the wrapper carries the same minimum height explicitly.
 */

import {
  Alignment,
  BoxConstraints,
  inscribe,
  insetsHorizontal,
  insetsVertical,
  normalizeInsets
} from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { assertFiniteNumber } from '../base/assert.ts';
import {
  IntrinsicColumnWidth,
  Table,
  TableBorder,
  TableRow,
  paintTableDecorationBackground,
  paintTableDecorationBorder
} from './table.ts';
import type {
  TableBorderInput,
  TableColumnWidth,
  TableColumnWidthMap,
  TableDecorationInput,
  TableWidth
} from './table.ts';
import { Text } from './text.ts';
import type { TextAlign } from './text.ts';
import type { TextStyle } from './text_style.ts';
import { Widget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export type TableAlignmentName =
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'centerLeft'
  | 'center'
  | 'centerRight'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight';

export type TableAlignmentInput = Alignment | TableAlignmentName;

type IndexedValues<T> = Readonly<Record<number, T>> | ReadonlyMap<number, T>;

function indexed<T>(values: IndexedValues<T> | null, index: number): T | undefined {
  if (values === null) return undefined;
  if (values instanceof Map) return values.get(index);
  return (values as Readonly<Record<number, T>>)[index];
}

function alignment(value: TableAlignmentInput): Alignment {
  if (typeof value !== 'string') {
    return value;
  }
  const resolved = Alignment[value];
  if (resolved === undefined) {
    throw new TypeError(`Unknown table alignment: ${value}`);
  }
  return resolved;
}

function textAlign(value: Alignment): TextAlign {
  if (value.x === 0) return 'center';
  return value.x < 0 ? 'left' : 'right';
}

interface HelperCellLayoutData {
  readonly childBox: AnyLayoutBox;
}

/** Padding, minimum height, alignment and decoration for one helper cell. */
class HelperCell extends Widget<HelperCellLayoutData> {
  readonly child: AnyWidget;
  readonly padding: Insets;
  readonly minimumHeight: number;
  readonly alignment: Alignment;
  readonly decoration: TableDecorationInput | null;

  constructor({
    child,
    padding,
    minimumHeight,
    alignment: cellAlignment,
    decoration
  }: {
    readonly child: AnyWidget;
    readonly padding: InsetsInput;
    readonly minimumHeight: number;
    readonly alignment: Alignment;
    readonly decoration: TableDecorationInput | null;
  }) {
    super();
    this.child = child;
    this.padding = normalizeInsets(padding);
    this.minimumHeight = Math.max(
      0,
      assertFiniteNumber(Number(minimumHeight), 'table cell height')
    );
    this.alignment = cellAlignment;
    this.decoration = decoration;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<HelperCellLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const horizontal = insetsHorizontal(this.padding);
    const vertical = insetsVertical(this.padding);
    const childBox = this.child.layout(context, parent.deflate(this.padding));
    const size = parent.constrain({
      width: childBox.width + horizontal,
      height: Math.max(this.minimumHeight, childBox.height + vertical)
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<HelperCellLayoutData>): void {
    paintTableDecorationBackground(context, this.decoration, box.x, box.y, box.width, box.height);

    const { childBox } = box.data;
    const innerWidth = Math.max(0, box.width - insetsHorizontal(this.padding));
    const innerHeight = Math.max(0, box.height - insetsVertical(this.padding));
    /*
     * Upstream wraps every cell in a `Container(alignment:)`, which places the
     * child's own box — a shrink-wrapped line of text included. Stretching the
     * child to the column width instead would pin every cell to the left, since
     * a text box that did not wrap is only as wide as its longest line.
     */
    const offset = inscribe(
      this.alignment,
      childBox.width,
      childBox.height,
      innerWidth,
      innerHeight
    );
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x + this.padding.left + offset.dx,
      y: box.y + this.padding.top + offset.dy
    });

    paintTableDecorationBorder(context, this.decoration, box.x, box.y, box.width, box.height);
  }
}

export type OnCellFormat = (index: number, data: unknown) => string;
export type OnCellDecoration = (
  index: number,
  data: unknown,
  rowNumber: number
) => TableDecorationInput | null;
export type OnCell = (index: number, data: unknown, rowNumber: number) => AnyWidget | null;
export type OnCellTextStyle = (
  index: number,
  data: unknown,
  rowNumber: number
) => TextStyle | null;

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

const defaultBorder = TableBorder.all();

/** Convenience builders that translate scalar arrays into table cells. */
export class TableHelper {
  static fromTextArray({
    context = null,
    data,
    cellPadding = 5,
    cellHeight = 0,
    cellAlignment = 'topLeft',
    cellAlignments = null,
    cellStyle = null,
    oddCellStyle = null,
    cellFormat = null,
    cellDecoration = null,
    headerCount = 1,
    headers = null,
    headerPadding = cellPadding,
    headerHeight = cellHeight,
    headerAlignment = 'center',
    headerAlignments = cellAlignments,
    headerStyle = null,
    headerFormat = null,
    border = defaultBorder,
    columnWidths = null,
    defaultColumnWidth = new IntrinsicColumnWidth(),
    tableWidth = 'max',
    headerDecoration = null,
    headerCellDecoration = null,
    rowDecoration = null,
    oddRowDecoration = rowDecoration,
    cellBuilder = null,
    textStyleBuilder = null
  }: TableTextArrayOptions): Table {
    if (!Array.isArray(data)) {
      throw new TypeError('TableHelper.fromTextArray requires a data array');
    }
    /*
     * Upstream reads `theme.tableHeader` and `theme.tableCell` only when it is
     * given a context; without one the cells carry no style of their own and
     * inherit the ambient default text style. Resolving the theme regardless
     * would silently shrink every helper table to 0.8 of the body size.
     */
    const resolvedHeaderStyle = headerStyle ?? (context === null ? null : context.theme.tableHeader);
    const resolvedCellStyle = cellStyle ?? (context === null ? null : context.theme.tableCell);
    const resolvedOddCellStyle = oddCellStyle ?? resolvedCellStyle;

    const normalizedHeaderCount = Math.trunc(
      assertFiniteNumber(Number(headerCount), 'headerCount')
    );
    if (normalizedHeaderCount < 0) {
      throw new RangeError('headerCount must not be negative');
    }

    const rows: TableRow[] = [];
    let rowNumber = 0;

    const makeCell = (
      value: unknown,
      column: number,
      isHeader: boolean,
      padding: InsetsInput,
      minimumHeight: number,
      cellAlignmentValue: TableAlignmentInput,
      decoration: TableDecorationInput | null,
      isHeaderRow = false
    ): AnyWidget => {
      const resolvedAlignment = alignment(cellAlignmentValue);
      if (value instanceof Widget) {
        return new HelperCell({
          child: value,
          padding,
          minimumHeight,
          alignment: resolvedAlignment,
          decoration
        });
      }

      const built = !isHeader ? cellBuilder?.(column, value, rowNumber) ?? null : null;
      if (built !== null) {
        if (!(built instanceof Widget)) {
          throw new TypeError('cellBuilder must return a Widget or null');
        }
        return new HelperCell({
          child: built,
          padding,
          minimumHeight,
          alignment: resolvedAlignment,
          decoration
        });
      }

      const formatter = isHeader ? headerFormat : cellFormat;
      const formatted = formatter === null ? String(value) : formatter(column, value);
      const isOdd = (rowNumber - normalizedHeaderCount) % 2 !== 0;
      const style = isHeader
        ? resolvedHeaderStyle
        : textStyleBuilder?.(column, value, rowNumber) ?? (isOdd ? resolvedOddCellStyle : resolvedCellStyle);
      const text = new Text(formatted, {
        ...style === null ? {} : { style },
        // Upstream leaves the header row's own cells unaligned: the container
        // alignment already places a single line, and a wrapped one reads
        // better ragged-right.
        ...isHeaderRow ? {} : { align: textAlign(resolvedAlignment) }
      });
      return new HelperCell({
        child: text,
        padding,
        minimumHeight,
        alignment: resolvedAlignment,
        decoration
      });
    };

    if (headers !== null) {
      const cells = headers.map((value, column) => makeCell(
        value,
        column,
        true,
        headerPadding ?? cellPadding,
        headerHeight ?? cellHeight,
        indexed(headerAlignments, column) ?? headerAlignment,
        headerCellDecoration,
        true
      ));
      rows.push(new TableRow({ children: cells, repeat: true, decoration: headerDecoration }));
      rowNumber++;
    }

    for (const row of data) {
      const isHeader = rowNumber < normalizedHeaderCount;
      const isOdd = (rowNumber - normalizedHeaderCount) % 2 !== 0;
      const cells = row.map((value: unknown, column: number) => makeCell(
        value,
        column,
        isHeader,
        isHeader ? headerPadding ?? cellPadding : cellPadding,
        isHeader ? headerHeight ?? cellHeight : cellHeight,
        isHeader
          ? indexed(headerAlignments, column) ?? headerAlignment
          : indexed(cellAlignments, column) ?? cellAlignment,
        isHeader ? null : cellDecoration?.(column, value, rowNumber) ?? null
      ));
      rows.push(new TableRow({
        children: cells,
        repeat: isHeader,
        decoration: isHeader ? headerDecoration : isOdd ? oddRowDecoration : rowDecoration
      }));
      rowNumber++;
    }

    return new Table({
      border,
      tableWidth,
      children: rows,
      columnWidths,
      defaultColumnWidth,
      defaultVerticalAlignment: 'full'
    });
  }
}
