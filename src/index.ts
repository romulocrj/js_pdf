/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN
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
import { Container } from './widgets/container.ts';
import { Document } from './widgets/document.ts';
import { Column, Row, Spacer } from './widgets/flex.ts';
import { MultiPage } from './widgets/multi_page.ts';
import { Page } from './widgets/page.ts';
import type { Section } from './widgets/page.ts';
import { Vector } from './widgets/shape.ts';
import { Text } from './widgets/text.ts';
import { Widget } from './widgets/widget.ts';
import type { DocumentOptions } from './widgets/document.ts';

export {
  Column,
  Container,
  Document,
  MultiPage,
  Page,
  PageFormat,
  Row,
  Spacer,
  Text,
  Vector,
  Widget
};

export type { ColorInput, Rgb } from './pdf/color.ts';
export type { PageSize } from './pdf/page_format.ts';
export type { TextStyle } from './pdf/graphics.ts';
export type { PdfCanvas } from './pdf/graphics.ts';
export type { Insets, InsetsInput } from './widgets/geometry.ts';
export type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  DocumentContext,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widgets/widget.ts';
export type { ColumnOptions, RowOptions } from './widgets/flex.ts';
export type { ContainerOptions } from './widgets/container.ts';
export type { TextAlign, TextOptions } from './widgets/text.ts';
export type { VectorApi, VectorOptions } from './widgets/shape.ts';
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
  readonly Container: typeof Container;
  readonly Spacer: typeof Spacer;
  readonly Vector: typeof Vector;
  readonly PageFormat: typeof PageFormat;
}

const publicApi: PublicApi = Object.freeze({
  Document,
  Page,
  MultiPage,
  Text,
  Column,
  Row,
  Container,
  Spacer,
  Vector,
  PageFormat
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
