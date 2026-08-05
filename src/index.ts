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
 *   - pdf/lib/pdf.dart
 *   - pdf/lib/widgets.dart
 *
 * Public entry point. Runtime requirements: ECMAScript classes, `Math`,
 * `Uint8Array` and template literals. No DOM, Canvas, Node globals, timers,
 * filesystem or network APIs are referenced anywhere under src/ — tsconfig.json
 * enforces that by compiling against the ES2020 lib alone.
 */

import { PageFormat } from './pdf/page_format.ts';
import { PdfType1Font } from './pdf/font/type1_fonts.ts';
import { PdfTtfFont } from './pdf/obj/ttf_font.ts';
import {
  Align,
  AspectRatio,
  Builder,
  Center,
  ConstrainedBox,
  CustomPaint,
  Divider,
  FittedBox,
  FullPage,
  LayoutBuilder,
  LimitedBox,
  Opacity,
  OverflowBox,
  Padding,
  SizedBox,
  Transform,
  VerticalDivider
} from './widgets/basic.ts';
import { Container } from './widgets/container.ts';
import { Document } from './widgets/document.ts';
import { Column, Expanded, Flex, Flexible, Row, Spacer } from './widgets/flex.ts';
import { Font } from './widgets/font.ts';
import { Alignment, BoxConstraints, EdgeInsets } from './widgets/geometry.ts';
import { MultiPage } from './widgets/multi_page.ts';
import { Page } from './widgets/page.ts';
import type { Section } from './widgets/page.ts';
import { PageTheme } from './widgets/page_theme.ts';
import { Vector } from './widgets/shape.ts';
import { SvgImage } from './widgets/svg.ts';
import {
  FixedColumnWidth,
  FlexColumnWidth,
  FractionColumnWidth,
  IntrinsicColumnWidth,
  Table,
  TableBorder,
  TableColumnWidth,
  TableRow
} from './widgets/table.ts';
import { TableHelper } from './widgets/table_helper.ts';
import { Text } from './widgets/text.ts';
import { TextStyle } from './widgets/text_style.ts';
import { DefaultTextStyle, Theme, ThemeData } from './widgets/theme.ts';
import { SpanningWidget, StatelessWidget, Widget } from './widgets/widget.ts';
import type { DocumentOptions } from './widgets/document.ts';

export {
  Align,
  Alignment,
  AspectRatio,
  BoxConstraints,
  Builder,
  Center,
  Column,
  ConstrainedBox,
  Container,
  CustomPaint,
  DefaultTextStyle,
  Divider,
  Document,
  EdgeInsets,
  Expanded,
  FixedColumnWidth,
  FlexColumnWidth,
  FittedBox,
  Flex,
  Flexible,
  Font,
  FractionColumnWidth,
  FullPage,
  IntrinsicColumnWidth,
  LayoutBuilder,
  LimitedBox,
  MultiPage,
  Opacity,
  OverflowBox,
  Padding,
  Page,
  PageFormat,
  PageTheme,
  PdfTtfFont,
  PdfType1Font,
  Row,
  SizedBox,
  Spacer,
  SpanningWidget,
  StatelessWidget,
  SvgImage,
  Table,
  TableBorder,
  TableColumnWidth,
  TableHelper,
  TableRow,
  Text,
  TextStyle,
  Theme,
  ThemeData,
  Transform,
  Vector,
  VerticalDivider,
  Widget
};

export type { ColorInput, Rgb } from './pdf/color.ts';
export { PdfGraphicState } from './pdf/graphic_state.ts';
export type { PdfBlendMode, PdfGraphicStateOptions } from './pdf/graphic_state.ts';
export { PdfPoint, PdfRect } from './pdf/rect.ts';
export {
  composeMatrices,
  flipMatrix,
  identityMatrix,
  invertMatrix,
  multiplyMatrix,
  rotationMatrix,
  scaleMatrix,
  skewMatrix,
  transformPoint,
  translationMatrix
} from './pdf/matrix.ts';
export type { PdfMatrix } from './pdf/matrix.ts';
export type {
  BezierArcOptions,
  ClipOptions,
  FillAndStrokeOptions,
  FillOptions,
  PdfLineCap,
  PdfLineJoin,
  StrokeOptions
} from './pdf/graphics.ts';
export type { PdfFont } from './pdf/font/font.ts';
export type { PdfFontMetricsOptions } from './pdf/font/font_metrics.ts';
export { PdfFontMetrics } from './pdf/font/font_metrics.ts';
export type { PageSize } from './pdf/page_format.ts';
export type { CanvasTextStyle } from './pdf/graphics.ts';
export type { PdfCanvas } from './pdf/graphics.ts';
export type { PdfTtfFontOptions } from './pdf/obj/ttf_font.ts';
export type { Type1FontName } from './widgets/font.ts';
export type {
  FontStyle,
  FontWeight,
  TextDecoration,
  TextDecorationStyle,
  TextStyleOptions
} from './widgets/text_style.ts';
export type {
  DefaultTextStyleOptions,
  ThemeDataFields,
  ThemeDataOptions,
  ThemeOptions,
  ThemeWithFontOptions
} from './widgets/theme.ts';
export type {
  BuildCallback,
  PageOrientation,
  PageThemeOptions
} from './widgets/page_theme.ts';
export type {
  BoxConstraintsInput,
  ConstraintSize,
  Insets,
  InsetsInput,
  Offset
} from './widgets/geometry.ts';
export type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  DocumentContext,
  LayoutBox,
  PositionedBox,
  RenderContext,
  SpanLayout,
  StatelessLayoutData
} from './widgets/widget.ts';
export type {
  AlignLayoutData,
  AlignOptions,
  AspectRatioOptions,
  BasicAlignmentInput,
  BasicAlignmentName,
  BuilderOptions,
  CenterOptions,
  ConstrainedBoxOptions,
  CustomPaintOptions,
  CustomPainter,
  DividerOptions,
  FittedBoxLayoutData,
  FittedBoxOptions,
  FullPageOptions,
  LayoutBuilderOptions,
  LayoutWidgetBuilder,
  LimitedBoxOptions,
  OpacityOptions,
  OverflowBoxLayoutData,
  OverflowBoxOptions,
  PaddingOptions,
  SingleChildLayoutData,
  SizedBoxOptions,
  TransformLayoutData,
  TransformOptions,
  VerticalDividerOptions,
  WidgetBuilder
} from './widgets/basic.ts';
export type {
  Axis,
  ColumnOptions,
  CrossAxisAlignment,
  ExpandedOptions,
  FlexChildLayout,
  FlexibleLayoutData,
  FlexibleOptions,
  FlexFit,
  FlexLayoutData,
  FlexOptions,
  MainAxisAlignment,
  MainAxisSize,
  RowOptions,
  VerticalDirection
} from './widgets/flex.ts';
export type { ContainerOptions } from './widgets/container.ts';
export type {
  ColumnLayout,
  TableBorderInput,
  TableBorderOptions,
  TableBorderSide,
  TableBorderSideInput,
  TableBorderSideOptions,
  TableCellLayout,
  TableCellVerticalAlignment,
  TableColumnWidthMap,
  TableDecorationInput,
  TableLayoutData,
  TableOptions,
  TableRowLayout,
  TableRowOptions,
  TableSpanState,
  TableWidth
} from './widgets/table.ts';
export type {
  OnCell,
  OnCellDecoration,
  OnCellFormat,
  OnCellTextStyle,
  TableAlignmentInput,
  TableAlignmentName,
  TableTextArrayOptions
} from './widgets/table_helper.ts';
export type { TextAlign, TextOptions, TextOverflow } from './widgets/text.ts';
export type { VectorApi, VectorOptions } from './widgets/shape.ts';
export type {
  AlignmentInput,
  AlignmentName,
  BoxFit,
  SvgFittedSize,
  SvgImageLayoutData,
  SvgImageOptions
} from './widgets/svg.ts';
export type { PageOptions, Section } from './widgets/page.ts';
export type { MultiPageOptions } from './widgets/multi_page.ts';
export type { DocumentOptions } from './widgets/document.ts';

/** The widget constructors handed to a `createPdf` build callback. */
export interface PublicApi {
  readonly Document: typeof Document;
  readonly Page: typeof Page;
  readonly MultiPage: typeof MultiPage;
  readonly Text: typeof Text;
  readonly Column: typeof Column;
  readonly Row: typeof Row;
  readonly Flex: typeof Flex;
  readonly Flexible: typeof Flexible;
  readonly Expanded: typeof Expanded;
  readonly Container: typeof Container;
  readonly Spacer: typeof Spacer;
  readonly Vector: typeof Vector;
  readonly Padding: typeof Padding;
  readonly Align: typeof Align;
  readonly Center: typeof Center;
  readonly ConstrainedBox: typeof ConstrainedBox;
  readonly SizedBox: typeof SizedBox;
  readonly Divider: typeof Divider;
  readonly Transform: typeof Transform;
  readonly Opacity: typeof Opacity;
  readonly OverflowBox: typeof OverflowBox;
  readonly FittedBox: typeof FittedBox;
  readonly AspectRatio: typeof AspectRatio;
  readonly FullPage: typeof FullPage;
  readonly Builder: typeof Builder;
  readonly LayoutBuilder: typeof LayoutBuilder;
  readonly CustomPaint: typeof CustomPaint;
  readonly LimitedBox: typeof LimitedBox;
  readonly VerticalDivider: typeof VerticalDivider;
  readonly SvgImage: typeof SvgImage;
  readonly Table: typeof Table;
  readonly TableRow: typeof TableRow;
  readonly TableBorder: typeof TableBorder;
  readonly TableColumnWidth: typeof TableColumnWidth;
  readonly IntrinsicColumnWidth: typeof IntrinsicColumnWidth;
  readonly FixedColumnWidth: typeof FixedColumnWidth;
  readonly FlexColumnWidth: typeof FlexColumnWidth;
  readonly FractionColumnWidth: typeof FractionColumnWidth;
  readonly TableHelper: typeof TableHelper;
  readonly SpanningWidget: typeof SpanningWidget;
  readonly Alignment: typeof Alignment;
  readonly BoxConstraints: typeof BoxConstraints;
  readonly EdgeInsets: typeof EdgeInsets;
  readonly PageFormat: typeof PageFormat;
  readonly PdfType1Font: typeof PdfType1Font;
  readonly PdfTtfFont: typeof PdfTtfFont;
  readonly Font: typeof Font;
  readonly TextStyle: typeof TextStyle;
  readonly Theme: typeof Theme;
  readonly ThemeData: typeof ThemeData;
  readonly DefaultTextStyle: typeof DefaultTextStyle;
  readonly PageTheme: typeof PageTheme;
}

const publicApi: PublicApi = Object.freeze({
  Document,
  Page,
  MultiPage,
  Text,
  Column,
  Row,
  Flex,
  Flexible,
  Expanded,
  Container,
  Spacer,
  Vector,
  Padding,
  Align,
  Center,
  ConstrainedBox,
  SizedBox,
  Divider,
  Transform,
  Opacity,
  OverflowBox,
  FittedBox,
  AspectRatio,
  FullPage,
  Builder,
  LayoutBuilder,
  CustomPaint,
  LimitedBox,
  VerticalDivider,
  SvgImage,
  Table,
  TableRow,
  TableBorder,
  TableColumnWidth,
  IntrinsicColumnWidth,
  FixedColumnWidth,
  FlexColumnWidth,
  FractionColumnWidth,
  TableHelper,
  SpanningWidget,
  Alignment,
  BoxConstraints,
  EdgeInsets,
  PageFormat,
  PdfType1Font,
  PdfTtfFont,
  Font,
  TextStyle,
  Theme,
  ThemeData,
  DefaultTextStyle,
  PageTheme
});

/**
 * Build and serialize a document in one call. `build` receives the widget
 * constructors, so a host script never needs module resolution of its own.
 */
export function createPdf(
  options: DocumentOptions,
  build: (api: PublicApi) => Section | Section[]
): Uint8Array {
  if (typeof build !== 'function') {
    throw new TypeError('createPdf requires a build function');
  }

  const document = new Document(options);
  const sections = build(publicApi);
  const normalized = Array.isArray(sections) ? sections : [sections];

  for (const section of normalized) {
    document.addPage(section);
  }

  return document.save();
}

/** Namespace object, for hosts that prefer a single binding. */
export const js_pdf = Object.freeze({ ...publicApi, createPdf });
