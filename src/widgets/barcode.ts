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
 *   - pdf/lib/src/widgets/barcode.dart
 *
 * Barcode drawing operations are generated during pure layout and carried to
 * paint in the layout data. The widget never caches a measured symbol.
 */

import { utf8Encode } from '../base/utf8.ts';
import type { Barcode } from '../barcode/barcode.ts';
import { BarcodeBar, BarcodeText } from '../barcode/barcode_operations.ts';
import type { BarcodeElement } from '../barcode/barcode_operations.ts';
import type { ColorInput } from '../pdf/color.ts';
import { normalizeColor } from '../pdf/color.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { Padding, SizedBox } from './basic.ts';
import { DecoratedBox } from './container.ts';
import type { BoxDecorationInput } from './decoration.ts';
import { Font } from './font.ts';
import { BoxConstraints } from './geometry.ts';
import type { InsetsInput } from './geometry.ts';
import { TextStyle } from './text_style.ts';
import { StatelessWidget, Widget } from './widget.ts';
import type {
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export interface BarcodeWidgetOptions {
  readonly data: string | Uint8Array;
  readonly barcode: Barcode;
  readonly color?: ColorInput;
  readonly backgroundColor?: ColorInput | null;
  readonly decoration?: BoxDecorationInput | null;
  readonly margin?: InsetsInput | null;
  readonly padding?: InsetsInput | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly drawText?: boolean;
  readonly textStyle?: TextStyle | null;
  readonly textPadding?: number;
}

interface BarcodeLayoutData {
  readonly elements: readonly BarcodeElement[];
  readonly font: PdfFont | null;
}

class BarcodePainter extends Widget<BarcodeLayoutData> {
  readonly data: string | Uint8Array;
  readonly barcode: Barcode;
  readonly color: ReturnType<typeof normalizeColor>;
  readonly drawText: boolean;
  readonly textStyle: TextStyle;
  readonly textPadding: number;

  constructor(
    data: string | Uint8Array,
    barcode: Barcode,
    color: ColorInput,
    drawText: boolean,
    textStyle: TextStyle,
    textPadding: number
  ) {
    super();
    this.data = data;
    this.barcode = barcode;
    this.color = normalizeColor(color);
    this.drawText = drawText;
    this.textStyle = textStyle;
    this.textPadding = textPadding;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<BarcodeLayoutData> {
    const size = BoxConstraints.from(constraints).biggest;
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
      throw new Error('BarcodeWidget needs bounded width and height');
    }
    const fontSize = this.textStyle.fontSize ?? 12;
    const options = {
      width: size.width,
      height: size.height,
      drawText: this.drawText,
      fontHeight: fontSize,
      textPadding: this.textPadding
    };
    const elements = this.data instanceof Uint8Array
      ? this.barcode.makeBytes(this.data, options)
      : this.barcode.make(this.data, options);
    const font = this.drawText ? this.textStyle.font?.getFont(context) ?? null : null;
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { elements, font }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<BarcodeLayoutData>): void {
    for (const element of box.data.elements) {
      if (element instanceof BarcodeBar && element.black) {
        context.canvas.fillRect(
          box.x + element.left,
          box.y + element.top,
          element.width,
          element.height,
          this.color
        );
      }
    }

    if (!this.drawText || box.data.font === null) return;
    const fontSize = this.textStyle.fontSize ?? 12;
    const textColor = this.textStyle.color ?? this.color;
    for (const element of box.data.elements) {
      if (!(element instanceof BarcodeText)) continue;
      const metrics = box.data.font.stringMetrics(element.text, fontSize);
      let x = box.x + element.left;
      if (element.align === 'center') x += (element.width - metrics.advanceWidth) / 2;
      if (element.align === 'right') x += element.width - metrics.advanceWidth;
      const baseline = box.y + element.top + element.height + metrics.descent;
      context.canvas.text(element.text, x, baseline, {
        font: box.data.font,
        fontSize,
        color: textColor
      });
    }
  }
}

/** Draw a one- or two-dimensional barcode inside the widget tree. */
export class BarcodeWidget extends StatelessWidget {
  readonly dataString: string | null;
  readonly dataBytes: Uint8Array | null;
  readonly barcode: Barcode;
  readonly color: ColorInput;
  readonly backgroundColor: ColorInput | null;
  readonly decoration: BoxDecorationInput | null;
  readonly margin: InsetsInput | null;
  readonly padding: InsetsInput | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly drawText: boolean;
  readonly textStyle: TextStyle | null;
  readonly textPadding: number;

  constructor({
    data,
    barcode,
    color = '#000000',
    backgroundColor = null,
    decoration = null,
    margin = null,
    padding = null,
    width = null,
    height = null,
    drawText = true,
    textStyle = null,
    textPadding = 0
  }: BarcodeWidgetOptions) {
    super();
    if (width !== null && (!Number.isFinite(width) || width < 0)) {
      throw new RangeError('BarcodeWidget width must be non-negative');
    }
    if (height !== null && (!Number.isFinite(height) || height < 0)) {
      throw new RangeError('BarcodeWidget height must be non-negative');
    }
    if (!Number.isFinite(textPadding) || textPadding < 0) {
      throw new RangeError('BarcodeWidget textPadding must be non-negative');
    }
    this.dataString = typeof data === 'string' ? data : null;
    this.dataBytes = data instanceof Uint8Array ? data : null;
    this.barcode = barcode;
    this.color = color;
    this.backgroundColor = backgroundColor;
    this.decoration = decoration;
    this.margin = margin;
    this.padding = padding;
    this.width = width;
    this.height = height;
    this.drawText = drawText;
    this.textStyle = textStyle;
    this.textPadding = textPadding;
  }

  get data(): Uint8Array {
    return this.dataBytes ?? utf8Encode(this.dataString ?? '');
  }

  override build(context: RenderContext): AnyWidget {
    const defaultStyle = context.theme.defaultTextStyle.copyWith({
      font: Font.courier(),
      fontNormal: Font.courier(),
      fontBold: Font.courierBold(),
      fontItalic: Font.courierOblique(),
      fontBoldItalic: Font.courierBoldOblique(),
      lineSpacing: 1,
      fontSize: this.height === null ? null : this.height * 0.2
    });
    const style = defaultStyle.merge(this.textStyle);
    let child: AnyWidget = new BarcodePainter(
      this.dataBytes ?? this.dataString ?? '',
      this.barcode,
      this.color,
      this.drawText,
      style,
      this.textPadding
    );

    if (this.padding !== null) child = new Padding({ padding: this.padding, child });
    if (this.decoration !== null) {
      child = new DecoratedBox({ decoration: this.decoration, child });
    } else if (this.backgroundColor !== null) {
      child = new DecoratedBox({ decoration: { color: this.backgroundColor }, child });
    }
    if (this.width !== null || this.height !== null) {
      child = new SizedBox({ width: this.width, height: this.height, child });
    }
    if (this.margin !== null) child = new Padding({ padding: this.margin, child });
    return child;
  }
}
