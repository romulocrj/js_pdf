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
 *   - pdf/lib/src/pdf/obj/catalog.dart
 *
 * Named destinations and outlines landed with phase 3.8. Phase 5.6 adds XML
 * metadata, page labels and the AcroForm assembled from widget annotations.
 * Phase 6.11 adds the PDF/A output intent and the PDF/A-3 `/AF` array; the
 * `/EmbeddedFiles` tree hangs off `PdfNames`.
 */

import { PdfArray } from '../format/array.ts';
import { PdfBool } from '../format/bool.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPageList } from './page_list.ts';
import type { PdfNames } from './names.ts';
import type { PdfOutline } from './outline.ts';
import type { PdfMetadata } from './metadata.ts';
import type { PdfPageLabels } from './page_label.ts';
import type { PdfaColorProfile } from './pdfa/pdfa_color_profile.ts';
import type { PdfaAttachedFiles } from './pdfa/pdfa_attached_files.ts';

/** The document catalog: the `/Root` the trailer points at. */
export class PdfCatalog extends PdfObject<PdfDict> {
  readonly pageList: PdfPageList;
  names: PdfNames | null = null;
  outline: PdfOutline | null = null;
  metadata: PdfMetadata | null = null;
  pageLabels: PdfPageLabels | null = null;
  /** The PDF/A output intent profile. */
  colorProfile: PdfaColorProfile | null = null;
  /** PDF/A-3 attachments. */
  attached: PdfaAttachedFiles | null = null;
  /** The root fields: a widget that is its own field, or a shared parent. */
  readonly formFields: PdfObject<PdfDict>[] = [];
  readonly formFonts = new Map<string, PdfObject<PdfDict>>();
  showOutlines = false;

  constructor(document: PdfObjectRegistry, pageList: PdfPageList, objser?: number) {
    super(document, new PdfDict([['/Type', new PdfName('/Catalog')]]), objser);
    this.pageList = pageList;
  }

  override prepare(): void {
    this.params.set('/Pages', this.pageList.ref());
    if (this.names !== null) this.params.set('/Names', this.names.ref());
    if (this.outline !== null) this.params.set('/Outlines', this.outline.ref());
    if (this.metadata !== null) this.params.set('/Metadata', this.metadata.ref());
    if (this.pageLabels !== null && this.pageLabels.labels.size > 0) {
      this.params.set('/PageLabels', this.pageLabels.ref());
    }
    if (this.formFields.length > 0) {
      const form = new PdfDict([
        ['/Fields', PdfArray.fromObjects(this.formFields)],
        // Widgets paint a deterministic printable appearance into page content.
        // A viewer may replace it after the user edits the interactive field.
        ['/NeedAppearances', new PdfBool(false)]
      ]);
      if (this.formFonts.size > 0) {
        form.set('/DR', new PdfDict([
          ['/Font', PdfDict.fromObjectMap(this.formFonts)]
        ]));
      }
      this.params.set('/AcroForm', form);
    }
    if (this.showOutlines) this.params.set('/PageMode', new PdfName('/UseOutlines'));
    if (this.attached !== null && this.attached.isNotEmpty) this.params.set('/AF', this.attached.catalogAF());
    if (this.colorProfile !== null) this.params.set('/OutputIntents', this.colorProfile.outputIntents());
  }
}
