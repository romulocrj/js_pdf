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
 *   - pdf/lib/pdf.dart
 *   - pdf/lib/widgets.dart
 *
 * Public entry point. Runtime requirements: ECMAScript classes, `Math`,
 * `Uint8Array` and template literals. No DOM, Canvas, Node globals, timers,
 * filesystem or network APIs are referenced anywhere under src/ — tsconfig.json
 * enforces that by compiling against the ES2020 lib alone.
 */

import { PageFormat } from './pdf/page_format.ts';
import { BarcodeFactory } from './barcode/barcode_factory.ts';
import { BarcodeCodabarStartStop } from './barcode/codabar.ts';
import { BarcodeCode128Fnc } from './barcode/code128.ts';
import { Pdf417SecurityLevel } from './barcode/pdf417.ts';
import { BarcodeQRCorrectionLevel } from './barcode/qrcode.ts';
import { PdfType1Font } from './pdf/font/type1_fonts.ts';
import { PdfTtfFont } from './pdf/obj/ttf_font.ts';
import { PdfImage } from './pdf/obj/image.ts';
import { PdfPageLabel } from './pdf/obj/page_label.ts';
import { decodePng, inflateZlib } from './pdf/image/png.ts';
import { parseJpeg } from './pdf/image/jpeg.ts';
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
import { BorderRadius, BorderRadiusDirectional, BorderRadiusGeometry, Radius } from './widgets/border_radius.ts';
import { Border, BorderSide, BorderStyle, BoxBorder } from './widgets/box_border.ts';
import { BarcodeWidget } from './widgets/barcode.ts';
import { Container, DecoratedBox } from './widgets/container.ts';
import { ClipOval, ClipRect, ClipRRect } from './widgets/clip.ts';
import { Bullet, Footer, Header, Paragraph, TableOfContent, Watermark } from './widgets/content.ts';
import {
  Anchor,
  Annotation,
  AnnotationBuilder,
  AnnotationCircle,
  AnnotationInk,
  AnnotationLink,
  AnnotationPolygon,
  AnnotationSquare,
  AnnotationUrl,
  CircleAnnotation,
  InkAnnotation,
  Link,
  Outline,
  PolygonAnnotation,
  PolyLineAnnotation,
  SquareAnnotation,
  UrlLink
} from './widgets/annotations.ts';
import { BarDataSet } from './widgets/chart/bar_chart.ts';
import { Chart, ChartFrame, ChartGrid, Dataset } from './widgets/chart/chart.ts';
import { FixedAxis, GridAxis } from './widgets/chart/grid_axis.ts';
import { CartesianFrame, CartesianGrid } from './widgets/chart/grid_cartesian.ts';
import { RadialFrame, RadialGrid } from './widgets/chart/grid_radial.ts';
import { ChartLegend } from './widgets/chart/legend.ts';
import { LineDataSet } from './widgets/chart/line_chart.ts';
import { PieDataSet, PieFrame, PieGrid } from './widgets/chart/pie_chart.ts';
import { PointChartValue, PointDataSet } from './widgets/chart/point_chart.ts';
import {
  BoxDecoration,
  BoxShadow,
  DecorationGraphic,
  DecorationImage,
  Gradient,
  LinearGradient,
  RadialGradient
} from './widgets/decoration.ts';
import { Document } from './widgets/document.ts';
import { Column, Expanded, Flex, Flexible, ListView, Row, Spacer } from './widgets/flex.ts';
import { Font } from './widgets/font.ts';
import { Alignment, BoxConstraints, EdgeInsets } from './widgets/geometry.ts';
import { MultiPage, NewPage } from './widgets/multi_page.ts';
import { GridView } from './widgets/grid_view.ts';
import { GridPaper } from './widgets/grid_paper.ts';
import { Partition, Partitions } from './widgets/partitions.ts';
import { Page } from './widgets/page.ts';
import type { Section } from './widgets/page.ts';
import { PageTheme } from './widgets/page_theme.ts';
import { Image, Shape } from './widgets/image.ts';
import { ImageProvider, ImageProxy, MemoryImage, RawImage } from './widgets/image_provider.ts';
import { Icon, IconData, IconThemeData } from './widgets/icon.ts';
import { CircularProgressIndicator, LinearProgressIndicator } from './widgets/progress.ts';
import { Checkbox, ChoiceField, FlatButton, TextField } from './widgets/forms.ts';
import { FlutterLogo, Lorem, LoremText, PdfLogo, Placeholder } from './widgets/placeholders.ts';
import { Circle, InkList, Polygon, Rectangle, Vector } from './widgets/shape.ts';
import { Positioned, PositionedDirectional, Stack } from './widgets/stack.ts';
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
import { InlineSpan, RichText, Text, TextSpan, WidgetSpan } from './widgets/text.ts';
import { TextStyle } from './widgets/text_style.ts';
import { Directionality, InheritedDirectionality } from './widgets/directionality.ts';
import { DefaultTextStyle, Theme, ThemeData } from './widgets/theme.ts';
import {
  DelayedWidget,
  Inherited,
  InheritedWidget,
  Inseparable,
  SpanningWidget,
  StatelessWidget,
  Widget
} from './widgets/widget.ts';
import { Wrap } from './widgets/wrap.ts';
import type { DocumentOptions } from './widgets/document.ts';

export {
  Align,
  Alignment,
  Anchor,
  Annotation,
  AnnotationBuilder,
  AnnotationCircle,
  AnnotationInk,
  AnnotationLink,
  AnnotationPolygon,
  AnnotationSquare,
  AnnotationUrl,
  AspectRatio,
  BarcodeFactory as Barcode,
  BarcodeCodabarStartStop,
  BarcodeCode128Fnc,
  BarcodeQRCorrectionLevel,
  BarcodeWidget,
  Border,
  BorderRadius,
  BorderRadiusDirectional,
  BorderRadiusGeometry,
  BorderSide,
  BorderStyle,
  BoxBorder,
  BoxConstraints,
  BoxDecoration,
  BoxShadow,
  DecorationGraphic,
  DecorationImage,
  Bullet,
  BarDataSet,
  Builder,
  CartesianFrame,
  CartesianGrid,
  Center,
  Circle,
  CircleAnnotation,
  CircularProgressIndicator,
  Chart,
  ChartFrame,
  ChartGrid,
  ChartLegend,
  Checkbox,
  ChoiceField,
  ClipOval,
  ClipRect,
  ClipRRect,
  Column,
  ConstrainedBox,
  Container,
  CustomPaint,
  Dataset,
  DefaultTextStyle,
  DelayedWidget,
  DecoratedBox,
  Divider,
  Directionality,
  Document,
  EdgeInsets,
  Expanded,
  FixedColumnWidth,
  FlexColumnWidth,
  FittedBox,
  Flex,
  Flexible,
  FlatButton,
  Font,
  Footer,
  FlutterLogo,
  FixedAxis,
  FractionColumnWidth,
  FullPage,
  Gradient,
  GridAxis,
  GridPaper,
  GridView,
  Header,
  Icon,
  IconData,
  IconThemeData,
  Image,
  ImageProvider,
  ImageProxy,
  Inherited,
  InheritedDirectionality,
  InheritedWidget,
  InkAnnotation,
  InkList,
  Inseparable,
  IntrinsicColumnWidth,
  LayoutBuilder,
  Link,
  ListView,
  LineDataSet,
  LimitedBox,
  LinearProgressIndicator,
  LinearGradient,
  Lorem,
  LoremText,
  MemoryImage,
  MultiPage,
  NewPage,
  Opacity,
  Outline,
  OverflowBox,
  Padding,
  Paragraph,
  Page,
  PageFormat,
  PageTheme,
  Partition,
  Partitions,
  PdfLogo,
  PdfPageLabel,
  Pdf417SecurityLevel,
  PdfImage,
  PdfTtfFont,
  PdfType1Font,
  PieDataSet,
  PieFrame,
  PieGrid,
  PointChartValue,
  PointDataSet,
  Polygon,
  PolygonAnnotation,
  PolyLineAnnotation,
  RadialFrame,
  RadialGradient,
  RadialGrid,
  Radius,
  Positioned,
  PositionedDirectional,
  Placeholder,
  Row,
  SizedBox,
  Spacer,
  Stack,
  SpanningWidget,
  StatelessWidget,
  SvgImage,
  Table,
  TableBorder,
  TableColumnWidth,
  TableHelper,
  TableOfContent,
  TableRow,
  InlineSpan,
  RichText,
  Text,
  TextField,
  TextSpan,
  TextStyle,
  Theme,
  ThemeData,
  Transform,
  UrlLink,
  RawImage,
  Rectangle,
  Shape,
  SquareAnnotation,
  Vector,
  VerticalDivider,
  Watermark,
  Widget,
  WidgetSpan,
  Wrap
};

export { decodePng, inflateZlib, parseJpeg };
export { deflateRaw, deflateZlib } from './pdf/format/deflate.ts';
export {
  pdfDiagnosticHandler,
  reportPdfDiagnostic,
  setPdfDiagnosticHandler
} from './pdf/diagnostics.ts';
export type { PdfDiagnosticHandler } from './pdf/diagnostics.ts';
export type { PdfSettings } from './pdf/format/object_base.ts';
export type { DecodedPng } from './pdf/image/png.ts';
export type { JpegColorSpace, JpegInfo } from './pdf/image/jpeg.ts';
export type { PdfImageOptions, PdfImageOrientation } from './pdf/obj/image.ts';
export type { PdfPageLabelOptions, PdfPageLabelStyle } from './pdf/obj/page_label.ts';
export type { Barcode as BarcodeGenerator, BarcodeType } from './barcode/barcode.ts';
export type {
  CodabarFactoryOptions,
  Code128FactoryOptions,
  Gs128FactoryOptions,
  ItfFactoryOptions,
  ItfFixedFactoryOptions
} from './barcode/barcode_factory.ts';
export type { BarcodeWidgetOptions } from './widgets/barcode.ts';
export type {
  CheckboxOptions,
  ChoiceFieldOptions,
  FlatButtonOptions,
  PdfFieldFlag,
  TextFieldOptions
} from './widgets/forms.ts';
export type {
  AnchorOptions,
  AnnotationLayoutData,
  AnnotationOptions,
  AnnotationRect,
  GeometricAnnotationOptions,
  InkAnnotationBuilderOptions,
  InkAnnotationOptions,
  LinkOptions,
  OutlineOptions,
  PdfBorder,
  PointAnnotationOptions,
  PolygonAnnotationOptions,
  ShapeAnnotationOptions
} from './widgets/annotations.ts';

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
  TextDecorationName,
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
  EdgeInsetsConstructor,
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
  StatelessLayoutData,
  DelayedWidgetLayoutData,
  DelayedWidgetOptions,
  DelayedWidgetState,
  InheritedWidgetLayoutData,
  InheritedWidgetOptions,
  InheritedWidgetState,
  InseparableOptions
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
  IndexedWidgetBuilder,
  ListViewOptions,
  MainAxisAlignment,
  MainAxisSize,
  RowOptions,
  VerticalDirection
} from './widgets/flex.ts';
export type { ContainerLayoutData, ContainerOptions, DecoratedBoxOptions } from './widgets/container.ts';
export type { ClipLayoutData, ClipRRectOptions, ClipWidgetOptions } from './widgets/clip.ts';
export type {
  BulletOptions,
  HeaderOptions,
  ParagraphOptions,
  TableOfContentOptions,
  FooterOptions,
  WatermarkOptions
} from './widgets/content.ts';
export type { BarDataSetOptions } from './widgets/chart/bar_chart.ts';
export type {
  AnyChartGrid,
  AnyDataset,
  ChartGridLayoutData,
  ChartLayoutData,
  ChartOptions,
  ChartPoint,
  ChartRect,
  ChartScope,
  DatasetOptions
} from './widgets/chart/chart.ts';
export type {
  AxisLayout,
  AxisPositions,
  FixedAxisOptions,
  GridAxisBuildLabel,
  GridAxisFormat,
  GridAxisOptions
} from './widgets/chart/grid_axis.ts';
export type { CartesianGridLayoutData, CartesianGridOptions } from './widgets/chart/grid_cartesian.ts';
export type { RadialGridLayoutData } from './widgets/chart/grid_radial.ts';
export type { ChartLegendOptions, LegendPosition } from './widgets/chart/legend.ts';
export type { LineDataSetOptions } from './widgets/chart/line_chart.ts';
export type {
  PieDataSetOptions,
  PieGridLayoutData,
  PieGridOptions,
  PieLegendPosition,
  PieSliceLayout
} from './widgets/chart/pie_chart.ts';
export type {
  PointDataSetOptions,
  PointShapeBuilder,
  PointValueBuilder,
  ValuePosition
} from './widgets/chart/point_chart.ts';
export type {
  BorderRadiusDirectionalOnlyOptions,
  BorderRadiusOnlyOptions,
  RadiusInput,
  RadiusValue,
  TextDirection
} from './widgets/border_radius.ts';
export type {
  BorderOptions,
  BorderSideInput,
  BorderSideOptions,
  BorderStyleInput,
  BorderStyleOptions,
  BoxBorderInput,
  BoxBorderPaintOptions
} from './widgets/box_border.ts';
export type {
  BoxDecorationInput,
  BoxDecorationOptions,
  BoxShadowInput,
  BoxShadowOptions,
  BoxShape,
  DecorationPosition,
  DecorationImageOptions,
  GradientOptions,
  LinearGradientOptions,
  PaintPhase,
  RadialGradientOptions,
  TileMode
} from './widgets/decoration.ts';
export type {
  GridChildLayout,
  GridViewLayoutData,
  GridViewOptions,
  GridViewState
} from './widgets/grid_view.ts';
export type {
  PartitionChildLayout,
  PartitionLayoutData,
  PartitionOptions,
  PartitionsLayoutData,
  PartitionsOptions,
  PartitionsState,
  PartitionState
} from './widgets/partitions.ts';
export type {
  PositionedDirectionalOptions,
  PositionedLayoutData,
  PositionedOptions,
  StackChildLayout,
  StackFit,
  StackLayoutData,
  StackOptions,
  StackOverflow
} from './widgets/stack.ts';
export type {
  WrapAlignment,
  WrapChildLayout,
  WrapCrossAlignment,
  WrapLayoutData,
  WrapOptions,
  WrapState
} from './widgets/wrap.ts';
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
export type {
  InlineSpanOptions,
  InlineSpanVisitor,
  RichTextLayoutData,
  RichTextLineLayout,
  RichTextOptions,
  RichTextRunLayout,
  RichTextState,
  TextAlign,
  TextLayoutData,
  TextOptions,
  TextOverflow,
  TextSpanOptions,
  WidgetSpanOptions
} from './widgets/text.ts';
export type {
  InkListOptions,
  PaintedShapeOptions,
  PolygonOptions,
  VectorApi,
  VectorOptions
} from './widgets/shape.ts';
export type {
  ImageLayoutData,
  ImageOptions,
  ShapeLayoutData,
  ShapeOptions
} from './widgets/image.ts';
export type { DirectionalityOptions } from './widgets/directionality.ts';
export type { GridPaperLayoutData, GridPaperOptions } from './widgets/grid_paper.ts';
export type {
  IconDataOptions,
  IconOptions,
  IconThemeDataOptions
} from './widgets/icon.ts';
export type {
  CircularProgressIndicatorOptions,
  LinearProgressIndicatorOptions
} from './widgets/progress.ts';
export type {
  MemoryImageOptions,
  RawImageOptions
} from './widgets/image_provider.ts';
export type {
  AlignmentInput,
  AlignmentName,
  BoxFit,
  SvgFittedSize,
  SvgImageLayoutData,
  SvgImageOptions
} from './widgets/svg.ts';
export type { PageOptions, Section } from './widgets/page.ts';
export type { MultiPageOptions, NewPageOptions } from './widgets/multi_page.ts';
export type {
  FlutterLogoOptions,
  LoremOptions,
  LoremRandom,
  LoremTextOptions,
  PdfLogoOptions,
  PlaceholderOptions
} from './widgets/placeholders.ts';
export type {
  DocumentDestinationEntry,
  DocumentOptions,
  DocumentOutlineEntry
} from './widgets/document.ts';
export type {
  PdfPageMode,
  SerializedDestination,
  SerializedOutline,
  SerializedPageLabel
} from './pdf/document.ts';
export type { PdfFormHighlighting, PdfTextFieldAlign } from './pdf/obj/annotation.ts';
export type { PdfOutlineStyle } from './pdf/obj/outline.ts';

/** The widget constructors handed to a `createPdf` build callback. */
export interface PublicApi {
  readonly Barcode: typeof BarcodeFactory;
  readonly BarcodeWidget: typeof BarcodeWidget;
  readonly BarcodeCodabarStartStop: typeof BarcodeCodabarStartStop;
  readonly BarcodeCode128Fnc: typeof BarcodeCode128Fnc;
  readonly BarcodeQRCorrectionLevel: typeof BarcodeQRCorrectionLevel;
  readonly Pdf417SecurityLevel: typeof Pdf417SecurityLevel;
  readonly Document: typeof Document;
  readonly Icon: typeof Icon;
  readonly IconData: typeof IconData;
  readonly IconThemeData: typeof IconThemeData;
  readonly CircularProgressIndicator: typeof CircularProgressIndicator;
  readonly LinearProgressIndicator: typeof LinearProgressIndicator;
  readonly Checkbox: typeof Checkbox;
  readonly ChoiceField: typeof ChoiceField;
  readonly FlatButton: typeof FlatButton;
  readonly TextField: typeof TextField;
  readonly Anchor: typeof Anchor;
  readonly Annotation: typeof Annotation;
  readonly AnnotationBuilder: typeof AnnotationBuilder;
  readonly AnnotationCircle: typeof AnnotationCircle;
  readonly AnnotationInk: typeof AnnotationInk;
  readonly AnnotationLink: typeof AnnotationLink;
  readonly AnnotationPolygon: typeof AnnotationPolygon;
  readonly AnnotationSquare: typeof AnnotationSquare;
  readonly AnnotationUrl: typeof AnnotationUrl;
  readonly CircleAnnotation: typeof CircleAnnotation;
  readonly InkAnnotation: typeof InkAnnotation;
  readonly Link: typeof Link;
  readonly Outline: typeof Outline;
  readonly PolygonAnnotation: typeof PolygonAnnotation;
  readonly PolyLineAnnotation: typeof PolyLineAnnotation;
  readonly SquareAnnotation: typeof SquareAnnotation;
  readonly UrlLink: typeof UrlLink;
  readonly Page: typeof Page;
  readonly MultiPage: typeof MultiPage;
  readonly NewPage: typeof NewPage;
  readonly Text: typeof Text;
  readonly InlineSpan: typeof InlineSpan;
  readonly RichText: typeof RichText;
  readonly TextSpan: typeof TextSpan;
  readonly WidgetSpan: typeof WidgetSpan;
  readonly Header: typeof Header;
  readonly Paragraph: typeof Paragraph;
  readonly Bullet: typeof Bullet;
  readonly TableOfContent: typeof TableOfContent;
  readonly Footer: typeof Footer;
  readonly Watermark: typeof Watermark;
  readonly Chart: typeof Chart;
  readonly ChartGrid: typeof ChartGrid;
  readonly ChartFrame: typeof ChartFrame;
  readonly CartesianGrid: typeof CartesianGrid;
  readonly CartesianFrame: typeof CartesianFrame;
  readonly PieGrid: typeof PieGrid;
  readonly PieFrame: typeof PieFrame;
  readonly RadialGrid: typeof RadialGrid;
  readonly RadialFrame: typeof RadialFrame;
  readonly GridAxis: typeof GridAxis;
  readonly FixedAxis: typeof FixedAxis;
  readonly PointChartValue: typeof PointChartValue;
  readonly Dataset: typeof Dataset;
  readonly PointDataSet: typeof PointDataSet;
  readonly BarDataSet: typeof BarDataSet;
  readonly LineDataSet: typeof LineDataSet;
  readonly PieDataSet: typeof PieDataSet;
  readonly ChartLegend: typeof ChartLegend;
  readonly ClipRect: typeof ClipRect;
  readonly ClipRRect: typeof ClipRRect;
  readonly ClipOval: typeof ClipOval;
  readonly Placeholder: typeof Placeholder;
  readonly PdfLogo: typeof PdfLogo;
  readonly FlutterLogo: typeof FlutterLogo;
  readonly LoremText: typeof LoremText;
  readonly Lorem: typeof Lorem;
  readonly Column: typeof Column;
  readonly Row: typeof Row;
  readonly Flex: typeof Flex;
  readonly Flexible: typeof Flexible;
  readonly Expanded: typeof Expanded;
  readonly ListView: typeof ListView;
  readonly Container: typeof Container;
  readonly DecoratedBox: typeof DecoratedBox;
  readonly BoxDecoration: typeof BoxDecoration;
  readonly BoxShadow: typeof BoxShadow;
  readonly DecorationGraphic: typeof DecorationGraphic;
  readonly DecorationImage: typeof DecorationImage;
  readonly Gradient: typeof Gradient;
  readonly LinearGradient: typeof LinearGradient;
  readonly RadialGradient: typeof RadialGradient;
  readonly BoxBorder: typeof BoxBorder;
  readonly Border: typeof Border;
  readonly BorderSide: typeof BorderSide;
  readonly BorderStyle: typeof BorderStyle;
  readonly BorderRadiusGeometry: typeof BorderRadiusGeometry;
  readonly BorderRadius: typeof BorderRadius;
  readonly BorderRadiusDirectional: typeof BorderRadiusDirectional;
  readonly Radius: typeof Radius;
  readonly GridView: typeof GridView;
  readonly GridPaper: typeof GridPaper;
  readonly Stack: typeof Stack;
  readonly Positioned: typeof Positioned;
  readonly PositionedDirectional: typeof PositionedDirectional;
  readonly Wrap: typeof Wrap;
  readonly Partition: typeof Partition;
  readonly Partitions: typeof Partitions;
  readonly Spacer: typeof Spacer;
  readonly Vector: typeof Vector;
  readonly Circle: typeof Circle;
  readonly Rectangle: typeof Rectangle;
  readonly Polygon: typeof Polygon;
  readonly InkList: typeof InkList;
  readonly Shape: typeof Shape;
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
  readonly Image: typeof Image;
  readonly ImageProvider: typeof ImageProvider;
  readonly ImageProxy: typeof ImageProxy;
  readonly MemoryImage: typeof MemoryImage;
  readonly RawImage: typeof RawImage;
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
  readonly Inherited: typeof Inherited;
  readonly InheritedWidget: typeof InheritedWidget;
  readonly Inseparable: typeof Inseparable;
  readonly DelayedWidget: typeof DelayedWidget;
  readonly Directionality: typeof Directionality;
  readonly InheritedDirectionality: typeof InheritedDirectionality;
  readonly Alignment: typeof Alignment;
  readonly BoxConstraints: typeof BoxConstraints;
  readonly EdgeInsets: typeof EdgeInsets;
  readonly PageFormat: typeof PageFormat;
  readonly PdfType1Font: typeof PdfType1Font;
  readonly PdfTtfFont: typeof PdfTtfFont;
  readonly PdfPageLabel: typeof PdfPageLabel;
  readonly Font: typeof Font;
  readonly TextStyle: typeof TextStyle;
  readonly Theme: typeof Theme;
  readonly ThemeData: typeof ThemeData;
  readonly DefaultTextStyle: typeof DefaultTextStyle;
  readonly PageTheme: typeof PageTheme;
}

const publicApi: PublicApi = Object.freeze({
  Barcode: BarcodeFactory,
  BarcodeWidget,
  BarcodeCodabarStartStop,
  BarcodeCode128Fnc,
  BarcodeQRCorrectionLevel,
  Pdf417SecurityLevel,
  Document,
  Icon,
  IconData,
  IconThemeData,
  CircularProgressIndicator,
  LinearProgressIndicator,
  Checkbox,
  ChoiceField,
  FlatButton,
  TextField,
  Anchor,
  Annotation,
  AnnotationBuilder,
  AnnotationCircle,
  AnnotationInk,
  AnnotationLink,
  AnnotationPolygon,
  AnnotationSquare,
  AnnotationUrl,
  CircleAnnotation,
  InkAnnotation,
  Link,
  Outline,
  PolygonAnnotation,
  PolyLineAnnotation,
  SquareAnnotation,
  UrlLink,
  Page,
  MultiPage,
  NewPage,
  Text,
  InlineSpan,
  RichText,
  TextSpan,
  WidgetSpan,
  Header,
  Paragraph,
  Bullet,
  TableOfContent,
  Footer,
  Watermark,
  Chart,
  ChartGrid,
  ChartFrame,
  CartesianGrid,
  CartesianFrame,
  PieGrid,
  PieFrame,
  RadialGrid,
  RadialFrame,
  GridAxis,
  FixedAxis,
  PointChartValue,
  Dataset,
  PointDataSet,
  BarDataSet,
  LineDataSet,
  PieDataSet,
  ChartLegend,
  ClipRect,
  ClipRRect,
  ClipOval,
  Placeholder,
  PdfLogo,
  FlutterLogo,
  LoremText,
  Lorem,
  Column,
  Row,
  Flex,
  Flexible,
  Expanded,
  ListView,
  Container,
  DecoratedBox,
  BoxDecoration,
  BoxShadow,
  DecorationGraphic,
  DecorationImage,
  Gradient,
  LinearGradient,
  RadialGradient,
  BoxBorder,
  Border,
  BorderSide,
  BorderStyle,
  BorderRadiusGeometry,
  BorderRadius,
  BorderRadiusDirectional,
  Radius,
  GridView,
  GridPaper,
  Stack,
  Positioned,
  PositionedDirectional,
  Wrap,
  Partition,
  Partitions,
  Spacer,
  Vector,
  Circle,
  Rectangle,
  Polygon,
  InkList,
  Shape,
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
  Image,
  ImageProvider,
  ImageProxy,
  MemoryImage,
  RawImage,
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
  Inherited,
  InheritedWidget,
  Inseparable,
  DelayedWidget,
  Directionality,
  InheritedDirectionality,
  Alignment,
  BoxConstraints,
  EdgeInsets,
  PageFormat,
  PdfType1Font,
  PdfTtfFont,
  PdfPageLabel,
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
