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
 *   - pdf/lib/src/pdf/obj/pdfa/pdfa_date_format.dart
 *
 * Divergence: the fields are read in UTC. Upstream reads the local wall clock,
 * and its embedded-file `/ModDate` then labels that local time `+00'00'`, so
 * the timestamp was off by the zone offset. Every date the port writes is UTC,
 * so `asIso` output takes a `Z` suffix and the compact form matches
 * `PdfString.fromDate`.
 */

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** `yyyyMMddHHmmss`, or `yyyy-MM-ddTHH:mm:ss` with `asIso`, in UTC. */
export class PdfaDateFormat {
  format({ dt, asIso = false }: { readonly dt: Date; readonly asIso?: boolean }): string {
    if (!(dt instanceof Date) || !Number.isFinite(dt.getTime())) throw new RangeError('PDF/A date must be a valid Date');
    const date = `${pad(dt.getUTCFullYear(), 4)}${asIso ? '-' : ''}${pad(dt.getUTCMonth() + 1)}${asIso ? '-' : ''}${pad(dt.getUTCDate())}`;
    const time = `${pad(dt.getUTCHours())}${asIso ? ':' : ''}${pad(dt.getUTCMinutes())}${asIso ? ':' : ''}${pad(dt.getUTCSeconds())}`;
    return asIso ? `${date}T${time}` : date + time;
  }
}
