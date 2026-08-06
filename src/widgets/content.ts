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
 *   - pdf/lib/src/widgets/content.dart
 *
 * `TableOfContent` can precede the headings it lists. It requests one replay
 * from `Document`: the first render collects outline positions and the second
 * paints the completed table. Documents without a table stay single-pass.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import { PageUnit } from '../pdf/page_format.ts';
import type { PdfOutlineStyle } from '../pdf/obj/outline.ts';
import { Divider, Padding, SizedBox } from './basic.ts';
import { Border, BorderSide } from './box_border.ts';
import { Container } from './container.ts';
import { BoxDecoration } from './decoration.ts';
import type { BoxDecorationInput, BoxShape } from './decoration.ts';
import { Column, Expanded, Row } from './flex.ts';
import type { InsetsInput } from './geometry.ts';
import { Link } from './annotations.ts';
import { Text } from './text.ts';
import type { TextAlign } from './text.ts';
import type { TextStyle } from './text_style.ts';
import { StatelessWidget } from './widget.ts';
import type {
  AnyWidget,
  PositionedBox,
  RenderContext,
  StatelessLayoutData
} from './widget.ts';

export interface HeaderOptions {
  readonly level?: number;
  readonly text?: string | null;
  readonly child?: AnyWidget | null;
  readonly decoration?: BoxDecorationInput | null;
  readonly margin?: InsetsInput;
  readonly padding?: InsetsInput;
  readonly textStyle?: TextStyle | null;
  readonly title?: string | null;
  readonly outlineColor?: ColorInput | null;
  readonly outlineStyle?: PdfOutlineStyle;
}

/** A themed heading that also records a named destination and outline node. */
export class Header extends StatelessWidget {
  readonly level: number;
  readonly text: string | null;
  readonly child: AnyWidget | null;
  readonly decoration: BoxDecorationInput | null;
  readonly margin: InsetsInput | undefined;
  readonly padding: InsetsInput | undefined;
  readonly textStyle: TextStyle | null;
  readonly title: string | null;
  readonly outlineColor: Rgb | null;
  readonly outlineStyle: PdfOutlineStyle;

  constructor({
    level = 1,
    text = null,
    child = null,
    decoration = null,
    margin = undefined,
    padding = undefined,
    textStyle = null,
    title = undefined,
    outlineColor = null,
    outlineStyle = 'normal'
  }: HeaderOptions = {}) {
    super();
    if (!Number.isInteger(level) || level < 0 || level > 5) {
      throw new RangeError('Header.level must be an integer from 0 through 5');
    }
    if (child === null && text === null) throw new Error('Header needs text or a child');
    this.level = level;
    this.text = text;
    this.child = child;
    this.decoration = decoration;
    this.margin = margin;
    this.padding = padding;
    this.textStyle = textStyle;
    this.title = title === undefined ? text : title;
    this.outlineColor = outlineColor === null ? null : normalizeColor(outlineColor);
    this.outlineStyle = outlineStyle;
  }

  override build(context: RenderContext): AnyWidget {
    const millimeter = PageUnit.mm;
    let margin = this.margin;
    let padding = this.padding;
    let decoration = this.decoration;
    let style = this.textStyle;

    if (this.level === 0) {
      margin ??= { bottom: 5 * millimeter };
      padding ??= { bottom: millimeter };
      decoration ??= new BoxDecoration({
        border: new Border({ bottom: new BorderSide() })
      });
      style ??= context.theme.header0;
    } else if (this.level === 1) {
      margin ??= { top: 3 * millimeter, bottom: 5 * millimeter };
      decoration ??= new BoxDecoration({
        border: new Border({ bottom: new BorderSide({ width: 0.2 }) })
      });
      style ??= context.theme.header1;
    } else {
      margin ??= { top: 2 * millimeter, bottom: 4 * millimeter };
      style ??= [
        context.theme.header0,
        context.theme.header1,
        context.theme.header2,
        context.theme.header3,
        context.theme.header4,
        context.theme.header5
      ][this.level] ?? context.theme.header5;
    }

    return new Container({
      alignment: 'topLeft',
      margin: margin ?? 0,
      padding: padding ?? 0,
      decoration,
      child: this.child ?? new Text(this.text ?? '', { style })
    });
  }

  override paint(context: RenderContext, box: PositionedBox<StatelessLayoutData>): void {
    if (this.title !== null) {
      context.document.registerOutline({
        title: this.title,
        level: this.level,
        pageNumber: context.pageNumber,
        y: context.pageFormat.height - box.y,
        color: this.outlineColor,
        style: this.outlineStyle
      });
    }
    super.paint(context, box);
  }
}

export interface ParagraphOptions {
  readonly text?: string | null;
  readonly textAlign?: TextAlign;
  readonly style?: TextStyle | null;
  readonly margin?: InsetsInput;
  readonly padding?: InsetsInput;
}

export class Paragraph extends StatelessWidget {
  readonly text: string;
  readonly textAlign: TextAlign;
  readonly style: TextStyle | null;
  readonly margin: InsetsInput;
  readonly padding: InsetsInput;

  constructor({
    text = '',
    textAlign = 'justify',
    style = null,
    margin = { bottom: 5 * PageUnit.mm },
    padding = 0
  }: ParagraphOptions = {}) {
    super();
    this.text = text ?? '';
    this.textAlign = textAlign;
    this.style = style;
    this.margin = margin;
    this.padding = padding;
  }

  override build(context: RenderContext): AnyWidget {
    return new Container({
      margin: this.margin,
      padding: this.padding,
      child: new Text(this.text, {
        textAlign: this.textAlign,
        style: this.style ?? context.theme.paragraphStyle,
        overflow: 'span'
      })
    });
  }
}

export interface BulletOptions extends ParagraphOptions {
  readonly bulletMargin?: InsetsInput;
  readonly bulletSize?: number;
  readonly bulletShape?: BoxShape;
  readonly bulletColor?: ColorInput;
}

export class Bullet extends StatelessWidget {
  readonly text: string | null;
  readonly textAlign: TextAlign;
  readonly style: TextStyle | null;
  readonly margin: InsetsInput;
  readonly padding: InsetsInput;
  readonly bulletMargin: InsetsInput;
  readonly bulletSize: number;
  readonly bulletShape: BoxShape;
  readonly bulletColor: Rgb;

  constructor({
    text = null,
    textAlign = 'left',
    style = null,
    margin = { bottom: 2 * PageUnit.mm },
    padding = 0,
    bulletMargin = {
      top: 1.5 * PageUnit.mm,
      left: 5 * PageUnit.mm,
      right: 2 * PageUnit.mm
    },
    bulletSize = 2 * PageUnit.mm,
    bulletShape = 'circle',
    bulletColor = '#000000'
  }: BulletOptions = {}) {
    super();
    this.text = text;
    this.textAlign = textAlign;
    this.style = style;
    this.margin = margin;
    this.padding = padding;
    this.bulletMargin = bulletMargin;
    this.bulletSize = Number(bulletSize);
    this.bulletShape = bulletShape;
    this.bulletColor = normalizeColor(bulletColor);
  }

  override build(context: RenderContext): AnyWidget {
    return new Container({
      margin: this.margin,
      padding: this.padding,
      child: new Row({
        crossAxisAlignment: 'start',
        children: [
          new Container({
            width: this.bulletSize,
            height: this.bulletSize,
            margin: this.bulletMargin,
            decoration: new BoxDecoration({ color: this.bulletColor, shape: this.bulletShape })
          }),
          new Expanded({
            child: this.text === null
              ? new SizedBox()
              : new Text(this.text, {
                textAlign: this.textAlign,
                style: context.theme.bulletStyle.merge(this.style)
              })
          })
        ]
      })
    });
  }
}

export interface TableOfContentOptions {
  readonly indent?: number;
  readonly gap?: number;
  readonly textStyle?: TextStyle | null;
}

/** A visual table generated from real PDF outline destinations. */
export class TableOfContent extends StatelessWidget {
  readonly indent: number;
  readonly gap: number;
  readonly textStyle: TextStyle | null;

  constructor({ indent = 10, gap = 8, textStyle = null }: TableOfContentOptions = {}) {
    super();
    this.indent = Number(indent);
    this.gap = Number(gap);
    this.textStyle = textStyle;
  }

  override build(context: RenderContext): AnyWidget {
    context.document.requestOutlineRerender();
    const rows = context.document.outlines.map(entry => new Link({
      destination: entry.anchor,
      child: new Padding({
        padding: { bottom: 2 },
        child: new Row({
          children: [
            new SizedBox({ width: this.indent * entry.level }),
            new Text(entry.title, { style: this.textStyle ?? undefined }),
            new SizedBox({ width: this.gap }),
            new Expanded({ child: new Divider({ height: 4, thickness: 0.2 }) }),
            new SizedBox({ width: this.gap }),
            new Text(String(entry.page), { style: this.textStyle ?? undefined })
          ]
        })
      })
    }));

    return new Column({ crossAxisAlignment: 'start', mainAxisSize: 'min', children: rows });
  }
}
