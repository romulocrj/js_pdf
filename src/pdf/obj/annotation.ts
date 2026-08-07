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
 */

import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum } from '../format/num.ts';
import { PdfString } from '../format/string.ts';
import type { Rgb } from '../color.ts';
import type { PdfFont } from '../font/font.ts';
import type { PdfImage } from './image.ts';
import type { PdfXObject } from './xobject.ts';
import type { PdfRect } from '../rect.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPage } from './page.ts';

export interface PdfUrlLinkAnnotation {
  readonly kind: 'url';
  readonly rect: PdfRect;
  readonly destination: string;
}

export interface PdfNamedLinkAnnotation {
  readonly kind: 'destination';
  readonly rect: PdfRect;
  readonly destination: string;
}

export type PdfLinkAnnotation = PdfUrlLinkAnnotation | PdfNamedLinkAnnotation;

export type PdfGeometricAnnotationKind = 'square' | 'circle' | 'polygon' | 'polyline' | 'ink';

export interface PdfGeometricAnnotation {
  readonly kind: 'geometric';
  readonly shape: PdfGeometricAnnotationKind;
  readonly rect: PdfRect;
  readonly points?: readonly { readonly x: number; readonly y: number }[];
  readonly inkList?: readonly (readonly { readonly x: number; readonly y: number }[])[];
  readonly color?: Rgb | null;
  readonly interiorColor?: Rgb | null;
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
  readonly borderColor?: Rgb | null;
  readonly backgroundColor?: Rgb | null;
  readonly highlighting?: PdfFormHighlighting | null;
  readonly fontSize?: number;
  readonly font?: PdfFont;
  readonly textColor?: Rgb;
  readonly appearances?: PdfFormAppearances;
}

export type PdfAnnotationSpec = PdfLinkAnnotation | PdfFormFieldAnnotation | PdfGeometricAnnotation;

/** One invisible clickable rectangle in a page's `/Annots` array. */
export class PdfAnnotation extends PdfObject<PdfDict> {
  readonly page: PdfPage;
  readonly annotation: PdfAnnotationSpec;
  readonly defaultAppearanceName: string | null;
  readonly appearances: PdfResolvedFormAppearances | null;

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
    page.annotations.push(this);
  }

  override prepare(): void {
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
    this.params.set('/BS', new PdfDict([
      ['/W', new PdfNum(annotation.borderWidth ?? 1)],
      ['/S', new PdfName('/S')]
    ]));
    if (annotation.color !== null && annotation.color !== undefined) {
      this.params.set('/C', PdfArray.fromNum(annotation.color));
    }
    if (annotation.interiorColor !== null && annotation.interiorColor !== undefined) {
      this.params.set('/IC', PdfArray.fromNum(annotation.interiorColor));
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
    this.params.set('/FT', new PdfName(fieldNames[field.fieldType]));
    this.params.set('/T', new PdfString(field.name));
    this.params.set('/Ff', new PdfNum(field.fieldFlags ?? 0));

    if (field.alternateName) this.params.set('/TU', new PdfString(field.alternateName));
    if (field.mappingName) this.params.set('/TM', new PdfString(field.mappingName));
    if (field.maxLength !== null && field.maxLength !== undefined) {
      this.params.set('/MaxLen', new PdfNum(field.maxLength));
    }
    if (field.textAlign !== null && field.textAlign !== undefined) {
      this.params.set('/Q', new PdfNum(['left', 'center', 'right'].indexOf(field.textAlign)));
    }
    if (field.items !== undefined) {
      this.params.set('/Opt', new PdfArray(field.items.map(item => new PdfString(item))));
    }

    const isButton = field.fieldType === 'checkbox' || field.fieldType === 'button';
    if (field.value) {
      this.params.set('/V', isButton ? new PdfName(field.value) : new PdfString(field.value));
    }
    if (field.defaultValue) {
      this.params.set('/DV', isButton
        ? new PdfName(field.defaultValue)
        : new PdfString(field.defaultValue));
    }
    if (field.fieldType === 'checkbox') {
      this.params.set('/AS', new PdfName(field.value ?? '/Off'));
    }

    if (this.defaultAppearanceName !== null) {
      const [r, g, b] = field.textColor ?? [0, 0, 0];
      this.params.set('/DA', new PdfString(
        `${this.defaultAppearanceName} ${field.fontSize ?? 12} Tf ${r} ${g} ${b} rg`
      ));
    }

    const appearance = new PdfDict();
    if (field.borderColor !== null && field.borderColor !== undefined) {
      appearance.set('/BC', PdfArray.fromNum(field.borderColor));
    }
    if (field.backgroundColor !== null && field.backgroundColor !== undefined) {
      appearance.set('/BG', PdfArray.fromNum(field.backgroundColor));
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
      if (this.appearances.normal !== undefined) {
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
