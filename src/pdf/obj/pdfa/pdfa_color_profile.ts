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
 *   - pdf/lib/src/pdf/obj/pdfa/pdfa_color_profile.dart
 *
 * Divergences. `/N` comes from the profile header; upstream writes 3 for any
 * profile, so a CMYK profile was declared as three components. The header and
 * tag table are checked first, so a malformed profile fails here rather than
 * in a validator. The output condition is the caller's, defaulting to
 * `Custom`; upstream names every profile `sRGB2014.icc`. The stream follows
 * the document's compression setting, which PDF/A permits for ICC data;
 * upstream never compresses it.
 */

import { PdfArray } from '../../format/array.ts';
import { PdfDict } from '../../format/dict.ts';
import { PdfName } from '../../format/name.ts';
import { PdfNum } from '../../format/num.ts';
import { PdfString } from '../../format/string.ts';
import type { PdfObjectRegistry } from '../object.ts';
import { PdfObjectStream } from '../object_stream.ts';
import type { PdfCatalog } from '../catalog.ts';

/** The device space an output intent describes; see `iccProfileInfo`. */
export type PdfaColorSpace = 'RGB' | 'CMYK' | 'GRAY';

const SPACES: Readonly<Record<string, readonly [PdfaColorSpace, number]>> = {
  'RGB ': ['RGB', 3], CMYK: ['CMYK', 4], GRAY: ['GRAY', 1]
};

/**
 * Check an ICC profile's header and tag table, and return its colour space.
 * PDF/A output intents take a monitor or output profile (ISO 19005-2 6.2.3)
 * for an RGB, CMYK or gray device.
 */
export function iccProfileInfo(icc: Uint8Array): { readonly colorSpace: PdfaColorSpace; readonly components: number } {
  if (!(icc instanceof Uint8Array) || icc.length < 132) {
    throw new TypeError('PDF/A colorProfile must be ICC profile bytes');
  }
  const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength);
  const signature = (offset: number): string => String.fromCharCode(icc[offset]!, icc[offset + 1]!, icc[offset + 2]!, icc[offset + 3]!);
  const size = view.getUint32(0);
  if (size !== icc.length) throw new RangeError(`ICC profile size ${size} is not its length ${icc.length}`);
  if (signature(36) !== 'acsp') throw new RangeError('ICC profile has no acsp signature');
  if (icc[8]! < 2 || icc[8]! > 4) throw new RangeError(`ICC profile version ${icc[8]} is not 2 to 4`);
  const deviceClass = signature(12);
  if (deviceClass !== 'mntr' && deviceClass !== 'prtr') {
    throw new RangeError(`PDF/A needs a mntr or prtr ICC profile class, not '${deviceClass}'`);
  }
  const space = SPACES[signature(16)];
  if (space === undefined) throw new RangeError(`ICC colour space '${signature(16)}' is not RGB, CMYK or GRAY`);
  if (signature(20) !== 'XYZ ' && signature(20) !== 'Lab ') throw new RangeError('ICC connection space is not XYZ or Lab');
  const count = view.getUint32(128);
  if (132 + count * 12 > size) throw new RangeError('ICC tag table overruns the profile');
  for (let index = 0; index < count; index++) {
    const entry = 132 + index * 12;
    if (view.getUint32(entry + 4) + view.getUint32(entry + 8) > size) {
      throw new RangeError(`ICC tag '${signature(entry)}' overruns the profile`);
    }
  }
  return { colorSpace: space[0], components: space[1] };
}

/** The `/DestOutputProfile` stream and the PDF/A output intent naming it. */
export class PdfaColorProfile extends PdfObjectStream {
  readonly icc: Uint8Array;
  readonly colorSpace: PdfaColorSpace;
  readonly outputCondition: string;

  constructor(document: PdfObjectRegistry & { readonly catalog: PdfCatalog }, icc: Uint8Array, outputCondition = 'Custom') {
    const info = iccProfileInfo(icc);
    super(document, icc);
    this.icc = icc;
    this.colorSpace = info.colorSpace;
    this.outputCondition = outputCondition;
    this.params.set('/N', new PdfNum(info.components));
    document.catalog.colorProfile = this;
  }

  outputIntents(): PdfArray {
    return new PdfArray([new PdfDict([
      ['/Type', new PdfName('/OutputIntent')],
      ['/S', new PdfName('/GTS_PDFA1')],
      ['/OutputConditionIdentifier', new PdfString(this.outputCondition)],
      ['/Info', new PdfString(this.outputCondition)],
      ['/RegistryName', new PdfString('http://www.color.org')],
      ['/DestOutputProfile', this.ref()]
    ])]);
  }
}
