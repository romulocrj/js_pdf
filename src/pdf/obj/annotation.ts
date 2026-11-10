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
 *   - pdf/lib/src/pdf/obj/annotation.dart
 *
 * Link annotations landed in phase 5.3, form fields in phase 5.6, and phase
 * 5.7 adds the geometric annotations consumed by the remaining widgets.
 *
 * Under PDF/A (phase 6.11) every annotation but a link needs an `/AP` holding
 * only `/N` (ISO 19005-2 6.3.3). The document hands markup and empty fields an
 * empty appearance - the widget's own painted child is what shows - and drops
 * the down and rollover states; here a push button's `/N` becomes a one-state
 * dictionary, since `/FT /Btn` requires one.
 */

import { PdfBorder } from './border.ts';
import type { PdfBorderOptions } from './border.ts';
import type { PdfFormXObject } from './formxobject.ts';
import { PdfBool } from '../format/bool.ts';
import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum, formatNumber } from '../format/num.ts';
import { PdfString } from '../format/string.ts';
import { colorOperator } from '../color.ts';
import type { PaintColor } from '../color.ts';
import type { PdfFont } from '../font/font.ts';
import type { PdfImage } from './image.ts';
import type { PdfXObject } from './xobject.ts';
import type { PdfRect } from '../rect.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPage } from './page.ts';

export interface PdfUrlLinkAnnotation {
  readonly border?: PdfBorderOptions | null;
  readonly kind: 'url';
  readonly rect: PdfRect;
  readonly destination: string;
}

export interface PdfNamedLinkAnnotation {
  readonly border?: PdfBorderOptions | null;
  readonly kind: 'destination';
  readonly rect: PdfRect;
  readonly destination: string;
}

export type PdfLinkAnnotation = PdfUrlLinkAnnotation | PdfNamedLinkAnnotation;

export type PdfGeometricAnnotationKind = 'square' | 'circle' | 'polygon' | 'polyline' | 'ink';

export interface PdfGeometricAnnotation {
  readonly border?: PdfBorderOptions | null;
  readonly kind: 'geometric';
  readonly shape: PdfGeometricAnnotationKind;
  readonly rect: PdfRect;
  readonly points?: readonly { readonly x: number; readonly y: number }[];
  readonly inkList?: readonly (readonly { readonly x: number; readonly y: number }[])[];
  readonly color?: PaintColor | null;
  readonly interiorColor?: PaintColor | null;
  readonly borderWidth?: number;
  readonly author?: string | null;
  readonly subject?: string | null;
  readonly content?: string | null;
  readonly date?: string | null;
}

export type PdfFormFieldType = 'text' | 'choice' | 'checkbox' | 'button';
export type PdfFormHighlighting = 'none' | 'invert' | 'outline' | 'push' | 'toggle';
export type PdfTextFieldAlign = 'left' | 'center' | 'right';

export interface PdfFormAppearance {
  readonly forms?: ReadonlyMap<PdfFormXObject, string>;
  readonly width: number;
  readonly height: number;
  readonly content: string;
  readonly fonts: ReadonlyMap<PdfFont, string>;
  readonly graphicStates: ReadonlyMap<string, PdfDict>;
  readonly patterns: ReadonlyMap<string, PdfDict>;
  readonly shadings: ReadonlyMap<string, PdfDict>;
  readonly images: ReadonlyMap<PdfImage, string>;
}

export interface PdfFormAppearances {
  readonly normal?: PdfFormAppearance;
  readonly normalStates?: ReadonlyMap<string, PdfFormAppearance>;
  readonly down?: PdfFormAppearance;
  readonly rollover?: PdfFormAppearance;
}

export interface PdfResolvedFormAppearances {
  readonly normal?: PdfXObject;
  readonly normalStates?: ReadonlyMap<string, PdfXObject>;
  readonly down?: PdfXObject;
  readonly rollover?: PdfXObject;
}

export interface PdfFormFieldAnnotation {
  readonly border?: PdfBorderOptions | null;
  readonly kind: 'form';
  readonly fieldType: PdfFormFieldType;
  readonly rect: PdfRect;
  readonly name: string;
  readonly value?: string | null;
  readonly defaultValue?: string | null;
  readonly items?: readonly string[];
  readonly fieldFlags?: number;
  readonly maxLength?: number | null;
  readonly alternateName?: string | null;
  readonly mappingName?: string | null;
  readonly textAlign?: PdfTextFieldAlign | null;
  readonly borderColor?: PaintColor | null;
  readonly backgroundColor?: PaintColor | null;
  readonly highlighting?: PdfFormHighlighting | null;
  readonly fontSize?: number;
  readonly font?: PdfFont;
  readonly textColor?: PaintColor;
  readonly appearances?: PdfFormAppearances;
}

export interface PdfTextAnnotation extends Omit<PdfGeometricAnnotation, 'kind' | 'shape'> {
  readonly kind: 'text';
  readonly content: string;
  readonly open?: boolean;
  readonly icon?: string;
}
export type PdfAnnotationSpec = PdfLinkAnnotation | PdfFormFieldAnnotation | PdfGeometricAnnotation | PdfTextAnnotation;

/** One invisible clickable rectangle in a page's `/Annots` array. */
export class PdfAnnotation extends PdfObject<PdfDict> {
  readonly page: PdfPage;
  readonly annotation: PdfAnnotationSpec;
  readonly defaultAppearanceName: string | null;
  readonly appearances: PdfResolvedFormAppearances | null;

  /**
   * The field this widget displays when several widgets share its name; set
   * by `PdfDocument`. Null means the widget is its own field, the merged form
   * ISO 32000-1 12.7.3.1 allows only for a single-widget field.
   */
  parent: PdfObject<PdfDict> | null = null;
  private readonly pdfa: boolean;

  constructor(
    document: PdfObjectRegistry,
    page: PdfPage,
    annotation: PdfAnnotationSpec,
    defaultAppearanceName: string | null = null,
    appearances: PdfResolvedFormAppearances | null = null
  ) {
    super(document, new PdfDict([['/Type', new PdfName('/Annot')]]));
    this.page = page;
    this.annotation = annotation;
    this.defaultAppearanceName = defaultAppearanceName;
    this.appearances = appearances;
    this.pdfa = document.settings.pdfa !== undefined;
    page.annotations.push(this);
  }

  override prepare(): void {
    if (this.annotation.border != null) this.params.set('/BS', new PdfBorder(this.annotation.border).output());
    if (this.annotation.kind === 'text') {
      const note = this.annotation;
      this.prepareGeometric({ ...note, kind: 'geometric', shape: 'square' });
      this.params.set('/Subtype', new PdfName('/Text'));
      this.params.set('/Open', new PdfBool(note.open ?? false));
      this.params.set('/Name', new PdfName('/' + (note.icon ?? 'Note')));
      return;
    }
    if (this.annotation.kind === 'form') {
      this.prepareForm(this.annotation);
      return;
    }
    if (this.annotation.kind === 'geometric') {
      this.prepareGeometric(this.annotation);
      return;
    }
    const { rect, destination, kind } = this.annotation;
    this.params.set('/Subtype', new PdfName('/Link'));
    this.params.set('/Rect', PdfArray.fromNum([
      rect.x,
      rect.y,
      rect.x + rect.width,
      rect.y + rect.height
    ]));
    this.params.set('/P', this.page.ref());
    this.params.set('/Border', PdfArray.fromNum([0, 0, 0]));
    this.params.set('/F', new PdfNum(4));
    this.params.set('/A', new PdfDict([
      ['/S', new PdfName(kind === 'url' ? '/URI' : '/GoTo')],
      [kind === 'url' ? '/URI' : '/D', new PdfString(destination)]
    ]));
  }

  private prepareGeometric(annotation: PdfGeometricAnnotation): void {
    const subtypes: Readonly<Record<PdfGeometricAnnotationKind, string>> = {
      square: '/Square',
      circle: '/Circle',
      polygon: '/Polygon',
      polyline: '/PolyLine',
      ink: '/Ink'
    };
    this.params.set('/Subtype', new PdfName(subtypes[annotation.shape]));
    this.params.set('/Rect', PdfArray.fromNum([
      annotation.rect.x,
      annotation.rect.y,
      annotation.rect.x + annotation.rect.width,
      annotation.rect.y + annotation.rect.height
    ]));
    this.params.set('/P', this.page.ref());
    this.params.set('/F', new PdfNum(4));
    this.params.set('/BS', new PdfBorder(annotation.border ?? { width: annotation.borderWidth ?? 1 }).output());
    if (annotation.color !== null && annotation.color !== undefined) {
      this.params.set('/C', PdfArray.fromColor(annotation.color));
    }
    if (annotation.interiorColor !== null && annotation.interiorColor !== undefined) {
      this.params.set('/IC', PdfArray.fromColor(annotation.interiorColor));
    }
    if (annotation.author) this.params.set('/T', new PdfString(annotation.author));
    if (annotation.subject) this.params.set('/Subj', new PdfString(annotation.subject));
    if (annotation.content) this.params.set('/Contents', new PdfString(annotation.content));
    if (annotation.date) this.params.set('/M', new PdfString(annotation.date));
    if (annotation.points !== undefined) {
      this.params.set('/Vertices', PdfArray.fromNum(annotation.points.flatMap(point => [point.x, point.y])));
    }
    if (annotation.inkList !== undefined) {
      this.params.set('/InkList', new PdfArray(annotation.inkList.map(points =>
        PdfArray.fromNum(points.flatMap(point => [point.x, point.y]))
      )));
    }
    if (this.appearances?.normal !== undefined) this.params.set('/AP', new PdfDict([['/N', this.appearances.normal.ref()]]));
  }

  private prepareForm(field: PdfFormFieldAnnotation): void {
    const fieldNames: Readonly<Record<PdfFormFieldType, string>> = {
      text: '/Tx',
      choice: '/Ch',
      checkbox: '/Btn',
      button: '/Btn'
    };
    this.params.set('/Subtype', new PdfName('/Widget'));
    this.params.set('/Rect', PdfArray.fromNum([
      field.rect.x,
      field.rect.y,
      field.rect.x + field.rect.width,
      field.rect.y + field.rect.height
    ]));
    this.params.set('/P', this.page.ref());
    this.params.set('/F', new PdfNum(4));
    // The field keys go on the shared parent when there is one; the kid keeps
    // its rectangle, page, state and appearances, and names its field by
    // `/Parent` instead of `/T`. As upstream #1980 does.
    const fieldParams = this.parent?.params ?? this.params;
    fieldParams.set('/FT', new PdfName(fieldNames[field.fieldType]));
    if (this.parent === null) this.params.set('/T', new PdfString(field.name));
    else this.params.set('/Parent', this.parent.ref());
    fieldParams.set('/Ff', new PdfNum(field.fieldFlags ?? 0));

    if (field.alternateName) fieldParams.set('/TU', new PdfString(field.alternateName));
    if (field.mappingName) fieldParams.set('/TM', new PdfString(field.mappingName));
    if (field.maxLength !== null && field.maxLength !== undefined) {
      fieldParams.set('/MaxLen', new PdfNum(field.maxLength));
    }
    if (field.textAlign !== null && field.textAlign !== undefined) {
      fieldParams.set('/Q', new PdfNum(['left', 'center', 'right'].indexOf(field.textAlign)));
    }
    if (field.items !== undefined) {
      fieldParams.set('/Opt', new PdfArray(field.items.map(item => new PdfString(item))));
    }

    const isButton = field.fieldType === 'checkbox' || field.fieldType === 'button';
    if (field.value) {
      fieldParams.set('/V', isButton ? new PdfName(field.value) : new PdfString(field.value));
    }
    if (field.defaultValue) {
      fieldParams.set('/DV', isButton
        ? new PdfName(field.defaultValue)
        : new PdfString(field.defaultValue));
    }
    if (field.fieldType === 'checkbox') {
      this.params.set('/AS', new PdfName(field.value ?? '/Off'));
    }

    if (this.defaultAppearanceName !== null) {
      // Through `formatNumber` like every other number the port writes, so a
      // non-finite size or a long fraction cannot leave the operator unreadable.
      fieldParams.set('/DA', new PdfString(
        `${this.defaultAppearanceName} ${formatNumber(field.fontSize ?? 12)} Tf ${colorOperator(field.textColor ?? [0, 0, 0])}`
      ));
    }

    const appearance = new PdfDict();
    if (field.borderColor !== null && field.borderColor !== undefined) {
      appearance.set('/BC', PdfArray.fromColor(field.borderColor));
    }
    if (field.backgroundColor !== null && field.backgroundColor !== undefined) {
      appearance.set('/BG', PdfArray.fromColor(field.backgroundColor));
    }
    if (!appearance.isEmpty) this.params.set('/MK', appearance);

    const highlights: Readonly<Record<PdfFormHighlighting, string>> = {
      none: '/N', invert: '/I', outline: '/O', push: '/P', toggle: '/T'
    };
    if (field.highlighting !== null && field.highlighting !== undefined) {
      this.params.set('/H', new PdfName(highlights[field.highlighting]));
    }

    if (this.appearances !== null) {
      const appearances = new PdfDict();
      if (this.appearances.normal !== undefined && this.pdfa && field.fieldType === 'button') {
        appearances.set('/N', new PdfDict([['/On', this.appearances.normal.ref()]]));
        this.params.set('/AS', new PdfName('/On'));
      } else if (this.appearances.normal !== undefined) {
        appearances.set('/N', this.appearances.normal.ref());
      } else if (this.appearances.normalStates !== undefined) {
        const states = new PdfDict();
        for (const [name, appearance] of this.appearances.normalStates) {
          states.set(name, appearance.ref());
        }
        appearances.set('/N', states);
      }
      if (this.appearances.down !== undefined) appearances.set('/D', this.appearances.down.ref());
      if (this.appearances.rollover !== undefined) {
        appearances.set('/R', this.appearances.rollover.ref());
      }
      if (!appearances.isEmpty) this.params.set('/AP', appearances);
    }
  }
}
