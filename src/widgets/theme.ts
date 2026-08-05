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
 *   - pdf/lib/src/widgets/theme.dart
 *
 * `ThemeData` is the set of complete text styles a document draws with, and
 * `ThemeData.withFont` is how a caller says "use these faces for everything".
 * Every style it holds has `inherit: false`, so merging a partial style onto one
 * of them always yields a complete style.
 *
 * The port has no `InheritedWidget` and no `Context.dependsOn`. Inherited values
 * ride on the render context instead: `Theme` and `DefaultTextStyle` lay out and
 * paint their child with a context carrying a different `theme`, which is the
 * same scoping with none of the machinery. `Theme.of(context)` is therefore just
 * a field read.
 *
 * PORT GAP: no `iconTheme`. `IconThemeData` belongs with the `Icon` widget in
 * roadmap phase 5.4, and nothing can consume it before then.
 */

import type { TextAlign, TextOverflow } from './text.ts';
import { TextStyle } from './text_style.ts';
import type { Font } from './font.ts';
import { Widget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export interface ThemeDataFields {
  readonly defaultTextStyle: TextStyle;
  readonly paragraphStyle: TextStyle;
  readonly header0: TextStyle;
  readonly header1: TextStyle;
  readonly header2: TextStyle;
  readonly header3: TextStyle;
  readonly header4: TextStyle;
  readonly header5: TextStyle;
  readonly bulletStyle: TextStyle;
  readonly tableHeader: TextStyle;
  readonly tableCell: TextStyle;
  readonly softWrap: boolean;
  readonly overflow: TextOverflow;
  readonly textAlign: TextAlign | null;
  readonly maxLines: number | null;
}

export interface ThemeDataOptions {
  readonly defaultTextStyle?: TextStyle;
  readonly paragraphStyle?: TextStyle;
  readonly header0?: TextStyle;
  readonly header1?: TextStyle;
  readonly header2?: TextStyle;
  readonly header3?: TextStyle;
  readonly header4?: TextStyle;
  readonly header5?: TextStyle;
  readonly bulletStyle?: TextStyle;
  readonly tableHeader?: TextStyle;
  readonly tableCell?: TextStyle;
  readonly softWrap?: boolean;
  readonly overflow?: TextOverflow;
  readonly textAlign?: TextAlign | null;
  readonly maxLines?: number | null;
}

export interface ThemeWithFontOptions {
  readonly base?: Font | null;
  readonly bold?: Font | null;
  readonly italic?: Font | null;
  readonly boldItalic?: Font | null;

  /** Accepted for API parity; consumed by `Icon` in roadmap phase 5.4. */
  readonly icons?: Font | null;
  readonly fontFallback?: readonly Font[] | null;
}

export class ThemeData {
  readonly defaultTextStyle: TextStyle;
  readonly paragraphStyle: TextStyle;
  readonly header0: TextStyle;
  readonly header1: TextStyle;
  readonly header2: TextStyle;
  readonly header3: TextStyle;
  readonly header4: TextStyle;
  readonly header5: TextStyle;
  readonly bulletStyle: TextStyle;
  readonly tableHeader: TextStyle;
  readonly tableCell: TextStyle;
  readonly softWrap: boolean;
  readonly overflow: TextOverflow;
  readonly textAlign: TextAlign | null;
  readonly maxLines: number | null;

  /**
   * Upstream's public constructor is a factory that merges onto
   * `ThemeData.base()`; a TypeScript constructor cannot return a different
   * object, so that shape is `ThemeData.create` and this one takes the complete
   * field set. `withFont` is the constructor callers actually want.
   */
  constructor(fields: ThemeDataFields) {
    this.defaultTextStyle = fields.defaultTextStyle;
    this.paragraphStyle = fields.paragraphStyle;
    this.header0 = fields.header0;
    this.header1 = fields.header1;
    this.header2 = fields.header2;
    this.header3 = fields.header3;
    this.header4 = fields.header4;
    this.header5 = fields.header5;
    this.bulletStyle = fields.bulletStyle;
    this.tableHeader = fields.tableHeader;
    this.tableCell = fields.tableCell;
    this.softWrap = fields.softWrap;
    this.overflow = fields.overflow;
    this.textAlign = fields.textAlign;
    this.maxLines = fields.maxLines;
  }

  /** Every style derived from one set of faces — the usual entry point. */
  static withFont({
    base = null,
    bold = null,
    italic = null,
    boldItalic = null,
    fontFallback = null
  }: ThemeWithFontOptions = {}): ThemeData {
    const defaultStyle = TextStyle.defaultStyle().copyWith({
      font: base,
      fontNormal: base,
      fontBold: bold,
      fontItalic: italic,
      fontBoldItalic: boldItalic,
      fontFallback
    });
    const fontSize = defaultStyle.fontSize ?? 12;

    return new ThemeData({
      defaultTextStyle: defaultStyle,
      paragraphStyle: defaultStyle.copyWith({ lineSpacing: 5 }),
      bulletStyle: defaultStyle.copyWith({ lineSpacing: 5 }),
      header0: defaultStyle.copyWith({ fontSize: fontSize * 2.0 }),
      header1: defaultStyle.copyWith({ fontSize: fontSize * 1.5 }),
      header2: defaultStyle.copyWith({ fontSize: fontSize * 1.4 }),
      header3: defaultStyle.copyWith({ fontSize: fontSize * 1.3 }),
      header4: defaultStyle.copyWith({ fontSize: fontSize * 1.2 }),
      header5: defaultStyle.copyWith({ fontSize: fontSize * 1.1 }),
      tableHeader: defaultStyle.copyWith({ fontSize: fontSize * 0.8, fontWeight: 'bold' }),
      tableCell: defaultStyle.copyWith({ fontSize: fontSize * 0.8 }),
      softWrap: true,
      overflow: 'visible',
      textAlign: null,
      maxLines: null
    });
  }

  /** The theme a document uses when it names none: Helvetica in four faces. */
  static base(): ThemeData {
    return ThemeData.withFont();
  }

  /** Upstream's `ThemeData({...})` factory: overrides merged onto the base. */
  static create(options: ThemeDataOptions = {}): ThemeData {
    return ThemeData.base().copyWith(options);
  }

  copyWith(options: ThemeDataOptions = {}): ThemeData {
    return new ThemeData({
      defaultTextStyle: this.defaultTextStyle.merge(options.defaultTextStyle),
      paragraphStyle: this.paragraphStyle.merge(options.paragraphStyle),
      bulletStyle: this.bulletStyle.merge(options.bulletStyle),
      header0: this.header0.merge(options.header0),
      header1: this.header1.merge(options.header1),
      header2: this.header2.merge(options.header2),
      header3: this.header3.merge(options.header3),
      header4: this.header4.merge(options.header4),
      header5: this.header5.merge(options.header5),
      tableHeader: this.tableHeader.merge(options.tableHeader),
      tableCell: this.tableCell.merge(options.tableCell),
      softWrap: options.softWrap ?? this.softWrap,
      overflow: options.overflow ?? this.overflow,
      textAlign: options.textAlign ?? this.textAlign,
      maxLines: options.maxLines ?? this.maxLines
    });
  }
}

/** What a theme-scoping widget hands from `layout` to `paint`. */
export interface ThemeLayoutData {
  readonly childBox: AnyLayoutBox;
}

/**
 * Base of the widgets that replace the theme for their subtree. The child is
 * laid out and painted with a context carrying `themeFor(context)`, so nothing
 * below sees the outer theme and nothing above sees the inner one.
 */
abstract class InheritedTheme extends Widget<ThemeLayoutData> {
  readonly child: AnyWidget;

  constructor(child: AnyWidget) {
    super();
    this.child = child;
  }

  protected abstract themeFor(context: RenderContext): ThemeData;

  private scope(context: RenderContext): RenderContext {
    return { ...context, theme: this.themeFor(context) };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<ThemeLayoutData> {
    const childBox = this.child.layout(this.scope(context), constraints);

    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<ThemeLayoutData>): void {
    const { childBox } = box.data;
    childBox.widget.paint(this.scope(context), { ...childBox, x: box.x, y: box.y });
  }
}

export interface ThemeOptions {
  readonly data: ThemeData;
  readonly child: AnyWidget;
}

export class Theme extends InheritedTheme {
  readonly data: ThemeData;

  constructor({ data, child }: ThemeOptions) {
    super(child);
    this.data = data;
  }

  /** The theme in force at `context`. */
  static of(context: RenderContext): ThemeData {
    return context.theme;
  }

  protected override themeFor(): ThemeData {
    return this.data;
  }
}

export interface DefaultTextStyleOptions {
  readonly style: TextStyle;
  readonly child: AnyWidget;
  readonly textAlign?: TextAlign | null;
  readonly softWrap?: boolean;
  readonly overflow?: TextOverflow | null;
  readonly maxLines?: number | null;
}

/**
 * Replace the default text style for a subtree, leaving the rest of the theme
 * alone. `Theme.of` below this widget reports the merged theme.
 */
export class DefaultTextStyle extends InheritedTheme {
  readonly style: TextStyle;
  readonly textAlign: TextAlign | null;
  readonly softWrap: boolean;
  readonly overflow: TextOverflow | null;
  readonly maxLines: number | null;

  constructor({
    style,
    child,
    textAlign = null,
    softWrap = true,
    overflow = null,
    maxLines = null
  }: DefaultTextStyleOptions) {
    super(child);
    this.style = style;
    this.textAlign = textAlign;
    this.softWrap = softWrap;
    this.overflow = overflow;
    this.maxLines = maxLines;
  }

  protected override themeFor(context: RenderContext): ThemeData {
    return context.theme.copyWith({
      defaultTextStyle: this.style,
      textAlign: this.textAlign,
      softWrap: this.softWrap,
      overflow: this.overflow ?? undefined,
      maxLines: this.maxLines
    });
  }
}
