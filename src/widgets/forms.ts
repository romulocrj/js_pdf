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
 *   - pdf/lib/src/widgets/forms.dart
 *
 * Appearance canvases are immutable serialized layout data here rather than
 * state retained by a widget. The same control chrome is painted into page
 * content so empty fields remain visible in readers that hide annotations.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import { PdfCanvas } from '../pdf/graphics.ts';
import type {
  PdfFormAppearance,
  PdfFormHighlighting,
  PdfTextFieldAlign
} from '../pdf/obj/annotation.ts';
import { Container } from './container.ts';
import type { InsetsInput } from './geometry.ts';
import { BoxConstraints } from './geometry.ts';
import { Text } from './text.ts';
import { TextStyle } from './text_style.ts';
import { DefaultTextStyle } from './theme.ts';
import { Widget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export type PdfFieldFlag =
  | 'readOnly' | 'mandatory' | 'noExport' | 'multiline' | 'password'
  | 'noToggleToOff' | 'radio' | 'pushButton' | 'combo' | 'edit' | 'sort'
  | 'fileSelect' | 'multiSelect' | 'doNotSpellCheck' | 'doNotScroll' | 'comb'
  | 'radiosInUnison' | 'commitOnSelChange';

const fieldFlagBits: Readonly<Record<PdfFieldFlag, number>> = {
  readOnly: 0,
  mandatory: 1,
  noExport: 2,
  multiline: 12,
  password: 13,
  noToggleToOff: 14,
  radio: 15,
  pushButton: 16,
  combo: 17,
  edit: 18,
  sort: 19,
  fileSelect: 20,
  multiSelect: 21,
  doNotSpellCheck: 22,
  doNotScroll: 23,
  comb: 24,
  radiosInUnison: 25,
  commitOnSelChange: 26
};

function fieldFlagsValue(flags: readonly PdfFieldFlag[]): number {
  let value = 0;
  for (const flag of flags) {
    const bit = fieldFlagBits[flag];
    if (bit === undefined) throw new TypeError(`Unknown form field flag: ${String(flag)}`);
    value |= 1 << bit;
  }
  return value;
}

function requireName(name: string): string {
  const result = String(name);
  if (result.length === 0) throw new RangeError('Form field name cannot be empty');
  return result;
}

interface FormLayoutData {
  readonly childBox: AnyLayoutBox;
}

function resolvedStyle(context: RenderContext, style: TextStyle | null): TextStyle {
  return context.theme.defaultTextStyle.merge(style);
}

function appearanceFor(
  context: RenderContext,
  width: number,
  height: number,
  child: AnyWidget
): PdfFormAppearance {
  const canvas = new PdfCanvas(height);
  const scoped: RenderContext = {
    ...context,
    canvas,
    pageFormat: { width, height }
  };
  const childBox = child.layout(scoped, BoxConstraints.tight({ width, height }));
  childBox.widget.paint(scoped, { ...childBox, x: 0, y: 0 });
  return {
    width,
    height,
    content: canvas.output(),
    fonts: canvas.fonts,
    graphicStates: canvas.graphicStates,
    patterns: canvas.patterns,
    images: canvas.images
  };
}

export interface ChoiceFieldOptions {
  readonly name: string;
  readonly items: readonly string[];
  readonly value?: string | null;
  readonly width?: number;
  readonly height?: number;
  readonly textStyle?: TextStyle | null;
}

export class ChoiceField extends Widget<FormLayoutData> {
  readonly name: string;
  readonly items: readonly string[];
  readonly value: string | null;
  readonly width: number;
  readonly height: number;
  readonly textStyle: TextStyle | null;

  constructor({ name, items, value = null, width = 120, height = 13, textStyle = null }: ChoiceFieldOptions) {
    super();
    this.name = requireName(name);
    this.items = items.map(String);
    this.value = value;
    this.width = Number(width);
    this.height = Number(height);
    this.textStyle = textStyle;
    if (value !== null && !this.items.includes(value)) {
      throw new RangeError('ChoiceField value must be one of its items');
    }
  }

  private child(): AnyWidget {
    return new Container({
      width: this.width,
      height: this.height,
      padding: { left: 4, right: 16, top: 2, bottom: 2 },
      borderColor: '#777777',
      background: '#ffffff',
      child: null
    });
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<FormLayoutData> {
    const childBox = this.child().layout(context, BoxConstraints.from(constraints));
    return { widget: this, width: childBox.width, height: childBox.height, data: { childBox } };
  }

  override paint(context: RenderContext, box: PositionedBox<FormLayoutData>): void {
    box.data.childBox.widget.paint(context, { ...box.data.childBox, x: box.x, y: box.y });
    const style = resolvedStyle(context, this.textStyle);
    context.canvas.addFormField({
      kind: 'form',
      fieldType: 'choice',
      name: this.name,
      items: this.items,
      value: this.value,
      fieldFlags: fieldFlagsValue(['combo']),
      font: style.font === null ? context.document.font : context.document.resolveFont(style.font),
      fontSize: style.fontSize ?? 12,
      textColor: style.color ?? [0, 0, 0],
      appearances: this.value === null ? undefined : {
        normal: appearanceFor(context, box.width, box.height, new Container({
          padding: { left: 4, right: 16, top: 2, bottom: 2 },
          child: new Text(this.value, { style: this.textStyle ?? undefined })
        }))
      }
    }, box.x, box.y, box.width, box.height);
  }
}

export interface CheckboxOptions {
  readonly name: string;
  readonly value: boolean;
  readonly tristate?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly activeColor?: ColorInput;
  readonly checkColor?: ColorInput;
  readonly borderColor?: ColorInput;
}

export class Checkbox extends Widget<null> {
  readonly name: string;
  readonly value: boolean;
  readonly tristate: boolean;
  readonly width: number;
  readonly height: number;
  readonly activeColor: Rgb;
  readonly checkColor: Rgb;
  readonly borderColor: Rgb;

  constructor({
    name,
    value,
    tristate = false,
    width = 13,
    height = 13,
    activeColor = '#2196f3',
    checkColor = '#ffffff',
    borderColor = '#757575'
  }: CheckboxOptions) {
    super();
    this.name = requireName(name);
    this.value = Boolean(value);
    this.tristate = Boolean(tristate);
    this.width = Number(width);
    this.height = Number(height);
    this.activeColor = normalizeColor(activeColor);
    this.checkColor = normalizeColor(checkColor);
    this.borderColor = normalizeColor(borderColor);
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const size = BoxConstraints.from(constraints).constrain({ width: this.width, height: this.height });
    return { widget: this, width: size.width, height: size.height, data: null };
  }

  override paint(context: RenderContext, box: PositionedBox<null>): void {
    this.paintState(context, box, this.value);
    const on = new CheckboxAppearance(this.activeColor, this.checkColor, this.borderColor, true);
    const off = new CheckboxAppearance(this.activeColor, this.checkColor, this.borderColor, false);
    context.canvas.addFormField({
      kind: 'form',
      fieldType: 'checkbox',
      name: this.name,
      value: this.value ? '/Yes' : null,
      defaultValue: this.value ? '/Yes' : null,
      appearances: {
        normalStates: new Map([
          ['/Yes', appearanceFor(context, box.width, box.height, on)],
          ['/Off', appearanceFor(context, box.width, box.height, off)]
        ])
      }
    }, box.x, box.y, box.width, box.height);
  }

  private paintState(context: RenderContext, box: PositionedBox<null>, selected: boolean): void {
    paintCheckbox(context, box.x, box.y, box.width, box.height, selected,
      this.activeColor, this.checkColor, this.borderColor);
  }
}

function paintCheckbox(
  context: RenderContext,
  x: number,
  y: number,
  width: number,
  height: number,
  selected: boolean,
  activeColor: Rgb,
  checkColor: Rgb,
  borderColor: Rgb
): void {
  context.canvas.fillRect(x, y, width, height, selected ? activeColor : '#ffffff');
  if (selected) {
    context.canvas.line(x + 2, y + height * 0.55, x + width * 0.42, y + height - 3, checkColor, 2);
    context.canvas.line(x + width * 0.42, y + height - 3, x + width - 2, y + 3, checkColor, 2);
  }
  context.canvas.strokeRect(x, y, width, height, borderColor, 1);
}

class CheckboxAppearance extends Widget<null> {
  private readonly activeColor: Rgb;
  private readonly checkColor: Rgb;
  private readonly borderColor: Rgb;
  private readonly selected: boolean;

  constructor(
    activeColor: Rgb,
    checkColor: Rgb,
    borderColor: Rgb,
    selected: boolean
  ) {
    super();
    this.activeColor = activeColor;
    this.checkColor = checkColor;
    this.borderColor = borderColor;
    this.selected = selected;
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const size = BoxConstraints.from(constraints).biggest;
    return { widget: this, width: size.width, height: size.height, data: null };
  }

  override paint(context: RenderContext, box: PositionedBox<null>): void {
    paintCheckbox(context, box.x, box.y, box.width, box.height, this.selected,
      this.activeColor, this.checkColor, this.borderColor);
  }
}

export interface FlatButtonOptions {
  readonly name: string;
  readonly child: AnyWidget;
  readonly textColor?: ColorInput;
  readonly color?: ColorInput;
  readonly colorDown?: ColorInput;
  readonly colorRollover?: ColorInput;
  readonly padding?: InsetsInput;
  readonly fieldFlags?: readonly PdfFieldFlag[];
}

export class FlatButton extends Widget<FormLayoutData> {
  readonly name: string;
  readonly childWidget: AnyWidget;
  readonly textColor: Rgb;
  readonly color: Rgb;
  readonly colorDown: Rgb;
  readonly colorRollover: Rgb;
  readonly padding: InsetsInput;
  readonly fieldFlags: readonly PdfFieldFlag[];

  constructor({
    name,
    child,
    textColor = '#ffffff',
    color = '#2196f3',
    colorDown = '#f44336',
    colorRollover = '#448aff',
    padding = { left: 20, right: 20, top: 5, bottom: 5 },
    fieldFlags = ['pushButton']
  }: FlatButtonOptions) {
    super();
    this.name = requireName(name);
    this.childWidget = child;
    this.textColor = normalizeColor(textColor);
    this.color = normalizeColor(color);
    this.colorDown = normalizeColor(colorDown);
    this.colorRollover = normalizeColor(colorRollover);
    this.padding = padding;
    this.fieldFlags = fieldFlags;
  }

  private child(color: Rgb = this.color): AnyWidget {
    return new Container({
      background: color,
      padding: this.padding,
      child: new DefaultTextStyle({
        style: new TextStyle({ color: this.textColor }),
        child: this.childWidget
      })
    });
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<FormLayoutData> {
    const childBox = this.child().layout(context, constraints);
    return { widget: this, width: childBox.width, height: childBox.height, data: { childBox } };
  }

  override paint(context: RenderContext, box: PositionedBox<FormLayoutData>): void {
    box.data.childBox.widget.paint(context, { ...box.data.childBox, x: box.x, y: box.y });
    context.canvas.addFormField({
      kind: 'form',
      fieldType: 'button',
      name: this.name,
      fieldFlags: fieldFlagsValue(this.fieldFlags),
      highlighting: 'push',
      appearances: {
        normal: appearanceFor(context, box.width, box.height, this.child()),
        down: appearanceFor(context, box.width, box.height, this.child(this.colorDown)),
        rollover: appearanceFor(context, box.width, box.height, this.child(this.colorRollover))
      }
    }, box.x, box.y, box.width, box.height);
  }
}

export interface TextFieldOptions {
  readonly name: string;
  readonly child?: AnyWidget | null;
  readonly width?: number;
  readonly height?: number;
  readonly value?: string | null;
  readonly defaultValue?: string | null;
  readonly textStyle?: TextStyle | null;
  readonly maxLength?: number | null;
  readonly alternateName?: string | null;
  readonly mappingName?: string | null;
  readonly fieldFlags?: readonly PdfFieldFlag[];
  readonly textAlign?: PdfTextFieldAlign | null;
  readonly color?: ColorInput | null;
  readonly backgroundColor?: ColorInput | null;
  readonly highlighting?: PdfFormHighlighting | null;
}

export class TextField extends Widget<FormLayoutData> {
  readonly options: TextFieldOptions;
  readonly name: string;

  constructor(options: TextFieldOptions) {
    super();
    this.options = options;
    this.name = requireName(options.name);
    if (options.maxLength !== null && options.maxLength !== undefined
      && (!Number.isInteger(options.maxLength) || options.maxLength < 0)) {
      throw new RangeError('TextField maxLength must be a non-negative integer');
    }
  }

  private child(): AnyWidget {
    if (this.options.child !== null && this.options.child !== undefined) return this.options.child;
    return new Container({
      width: this.options.width ?? 120,
      height: this.options.height ?? 13,
      padding: { left: 4, right: 4, top: 2, bottom: 2 },
      borderColor: this.options.color ?? '#777777',
      background: this.options.backgroundColor ?? '#ffffff',
      child: null
    });
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<FormLayoutData> {
    const childBox = this.child().layout(context, constraints);
    return { widget: this, width: childBox.width, height: childBox.height, data: { childBox } };
  }

  override paint(context: RenderContext, box: PositionedBox<FormLayoutData>): void {
    box.data.childBox.widget.paint(context, { ...box.data.childBox, x: box.x, y: box.y });
    const style = resolvedStyle(context, this.options.textStyle ?? null);
    context.canvas.addFormField({
      kind: 'form',
      fieldType: 'text',
      name: this.name,
      value: this.options.value ?? null,
      defaultValue: this.options.defaultValue ?? null,
      maxLength: this.options.maxLength ?? null,
      alternateName: this.options.alternateName ?? null,
      mappingName: this.options.mappingName ?? null,
      fieldFlags: fieldFlagsValue(this.options.fieldFlags ?? []),
      textAlign: this.options.textAlign ?? null,
      borderColor: this.options.color == null ? null : normalizeColor(this.options.color),
      backgroundColor: this.options.backgroundColor == null
        ? null
        : normalizeColor(this.options.backgroundColor),
      highlighting: this.options.highlighting ?? null,
      font: style.font === null ? context.document.font : context.document.resolveFont(style.font),
      fontSize: style.fontSize ?? 12,
      textColor: style.color ?? [0, 0, 0],
      appearances: this.options.value === null || this.options.value === undefined
        ? undefined
        : {
          normal: appearanceFor(context, box.width, box.height, new Container({
            padding: { left: 4, right: 4, top: 2, bottom: 2 },
            child: new Text(this.options.value, { style: this.options.textStyle ?? undefined })
          }))
        }
    }, box.x, box.y, box.width, box.height);
  }
}
