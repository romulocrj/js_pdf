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
 *   - barcode/lib/src/barcode.dart
 *
 * Factories are separate from the abstract generator so concrete generators
 * can extend that base without an ES module initialization cycle.
 */

import type { Barcode, BarcodeType } from './barcode.ts';
import { BarcodeCodabar, BarcodeCodabarStartStop } from './codabar.ts';
import type { BarcodeCodabarStartStop as CodabarStartStop } from './codabar.ts';
import { BarcodeCode128 } from './code128.ts';
import { BarcodeCode39 } from './code39.ts';
import { BarcodeCode93 } from './code93.ts';
import { BarcodeEan13 } from './ean13.ts';
import { BarcodeEan2 } from './ean2.ts';
import { BarcodeEan5 } from './ean5.ts';
import { BarcodeEan8 } from './ean8.ts';
import { BarcodeIsbn } from './isbn.ts';
import { BarcodeItf } from './itf.ts';
import { BarcodeItf14 } from './itf14.ts';
import { BarcodeItf16 } from './itf16.ts';
import { BarcodePDF417, Pdf417SecurityLevel } from './pdf417.ts';
import type { Pdf417SecurityLevel as Pdf417Level } from './pdf417.ts';
import { BarcodePostnet } from './postnet.ts';
import { BarcodeQR, BarcodeQRCorrectionLevel } from './qrcode.ts';
import type { BarcodeQRCorrectionLevel as QrCorrectionLevel } from './qrcode.ts';
import { BarcodeRm4scc } from './rm4scc.ts';
import { BarcodeTelepen } from './telepen.ts';
import { BarcodeUpcA } from './upca.ts';
import { BarcodeUpcE } from './upce.ts';

export interface Code128FactoryOptions {
  readonly useCode128A?: boolean;
  readonly useCode128B?: boolean;
  readonly useCode128C?: boolean;
  readonly escapes?: boolean;
}

export interface Gs128FactoryOptions extends Code128FactoryOptions {
  readonly addSpaceAfterParenthesis?: boolean;
  readonly keepParenthesis?: boolean;
}

export interface ItfFactoryOptions {
  readonly addChecksum?: boolean;
  readonly zeroPrepend?: boolean;
  readonly drawBorder?: boolean;
  readonly borderWidth?: number | null;
  readonly quietWidth?: number | null;
  readonly fixedLength?: number | null;
}

export interface ItfFixedFactoryOptions {
  readonly drawBorder?: boolean;
  readonly borderWidth?: number | null;
  readonly quietWidth?: number | null;
}

export interface CodabarFactoryOptions {
  readonly start?: CodabarStartStop;
  readonly stop?: CodabarStartStop;
  readonly printStartStop?: boolean;
  readonly explicitStartStop?: boolean;
}

/** Static constructor surface compatible with `Barcode.foo()` upstream. */
export class BarcodeFactory {
  private constructor() {}

  static fromType(type: BarcodeType): Barcode {
    switch (type) {
      case 'Code39': return this.code39();
      case 'Code93': return this.code93();
      case 'Code128': return this.code128();
      case 'GS128': return this.gs128();
      case 'Itf': return this.itf();
      case 'CodeITF14': return this.itf14();
      case 'CodeITF16': return this.itf16();
      case 'CodeEAN13': return this.ean13();
      case 'CodeEAN8': return this.ean8();
      case 'CodeEAN5': return this.ean5();
      case 'CodeEAN2': return this.ean2();
      case 'CodeISBN': return this.isbn();
      case 'CodeUPCA': return this.upcA();
      case 'CodeUPCE': return this.upcE();
      case 'Telepen': return this.telepen();
      case 'Codabar': return this.codabar();
      case 'Rm4scc': return this.rm4scc();
      case 'Postnet': return this.postnet();
      case 'QrCode': return this.qrCode();
      case 'PDF417': return this.pdf417();
      default: throw new RangeError(`Barcode ${type} is not supported`);
    }
  }

  static code39({ drawSpacers = true }: { readonly drawSpacers?: boolean } = {}): Barcode {
    return new BarcodeCode39(drawSpacers);
  }

  static code93(): Barcode { return new BarcodeCode93(); }

  static code128({
    useCode128A = true,
    useCode128B = true,
    useCode128C = true,
    escapes = false
  }: Code128FactoryOptions = {}): Barcode {
    return new BarcodeCode128({
      useCode128A,
      useCode128B,
      useCode128C,
      escapes,
      isGS1: false,
      addSpaceAfterParenthesis: false,
      keepParenthesis: false
    });
  }

  static gs128({
    useCode128A = true,
    useCode128B = true,
    useCode128C = true,
    escapes = false,
    addSpaceAfterParenthesis = true,
    keepParenthesis = false
  }: Gs128FactoryOptions = {}): Barcode {
    return new BarcodeCode128({
      useCode128A,
      useCode128B,
      useCode128C,
      escapes,
      isGS1: true,
      addSpaceAfterParenthesis,
      keepParenthesis
    });
  }

  static itf({
    addChecksum = false,
    zeroPrepend = false,
    drawBorder = false,
    borderWidth = null,
    quietWidth = null,
    fixedLength = null
  }: ItfFactoryOptions = {}): Barcode {
    return new BarcodeItf(
      addChecksum,
      zeroPrepend,
      drawBorder,
      borderWidth,
      quietWidth,
      fixedLength
    );
  }

  static itf14({
    drawBorder = true,
    borderWidth = null,
    quietWidth = null
  }: ItfFixedFactoryOptions = {}): Barcode {
    return new BarcodeItf14(drawBorder, borderWidth, quietWidth);
  }

  static itf16({
    drawBorder = true,
    borderWidth = null,
    quietWidth = null
  }: ItfFixedFactoryOptions = {}): Barcode {
    return new BarcodeItf16(drawBorder, borderWidth, quietWidth);
  }

  static ean13({ drawEndChar = false }: { readonly drawEndChar?: boolean } = {}): Barcode {
    return new BarcodeEan13(drawEndChar);
  }

  static ean8({ drawSpacers = false }: { readonly drawSpacers?: boolean } = {}): Barcode {
    return new BarcodeEan8(drawSpacers);
  }

  static ean5(): Barcode { return new BarcodeEan5(); }
  static ean2(): Barcode { return new BarcodeEan2(); }

  static isbn({
    drawEndChar = false,
    drawIsbn = true
  }: { readonly drawEndChar?: boolean; readonly drawIsbn?: boolean } = {}): Barcode {
    return new BarcodeIsbn(drawEndChar, drawIsbn);
  }

  static upcA(): Barcode { return new BarcodeUpcA(); }

  static upcE({ fallback = false }: { readonly fallback?: boolean } = {}): Barcode {
    return new BarcodeUpcE(fallback);
  }

  static telepen(): Barcode { return new BarcodeTelepen(); }

  static qrCode({
    typeNumber = null,
    errorCorrectLevel = BarcodeQRCorrectionLevel.low
  }: {
    readonly typeNumber?: number | null;
    readonly errorCorrectLevel?: QrCorrectionLevel;
  } = {}): Barcode {
    return new BarcodeQR(typeNumber, errorCorrectLevel);
  }

  static pdf417({
    securityLevel = Pdf417SecurityLevel.level2,
    moduleHeight = 2,
    preferredRatio = 3
  }: {
    readonly securityLevel?: Pdf417Level;
    readonly moduleHeight?: number;
    readonly preferredRatio?: number;
  } = {}): Barcode {
    return new BarcodePDF417(securityLevel, moduleHeight, preferredRatio);
  }

  static codabar({
    start = BarcodeCodabarStartStop.A,
    stop = BarcodeCodabarStartStop.B,
    printStartStop = false,
    explicitStartStop = false
  }: CodabarFactoryOptions = {}): Barcode {
    return new BarcodeCodabar(start, stop, printStartStop, explicitStartStop);
  }

  static rm4scc(): Barcode { return new BarcodeRm4scc(); }
  static postnet(): Barcode { return new BarcodePostnet(); }
}
