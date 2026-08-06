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
 *   - pdf/lib/src/widgets/placeholders.dart
 *
 * The default lorem generator is deterministic and host-independent. The text
 * is produced in `Lorem`'s constructor so repeated layout and a table-of-content
 * replay cannot advance caller-supplied random state or change page geometry.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import { BoxConstraints } from './geometry.ts';
import { SvgImage } from './svg.ts';
import type { BoxFit } from './svg.ts';
import { Text } from './text.ts';
import type { TextAlign } from './text.ts';
import type { TextStyle } from './text_style.ts';
import { StatelessWidget, Widget } from './widget.ts';
import type {
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export interface PlaceholderOptions {
  readonly color?: ColorInput;
  readonly strokeWidth?: number;
  readonly fallbackWidth?: number;
  readonly fallbackHeight?: number;
}

/** A crossed box used when a visual resource is deliberately absent. */
export class Placeholder extends Widget<null> {
  readonly color: Rgb;
  readonly strokeWidth: number;
  readonly fallbackWidth: number;
  readonly fallbackHeight: number;

  constructor({
    color = '#455a64',
    strokeWidth = 2,
    fallbackWidth = 400,
    fallbackHeight = 400
  }: PlaceholderOptions = {}) {
    super();
    this.color = normalizeColor(color);
    this.strokeWidth = Number(strokeWidth);
    this.fallbackWidth = Number(fallbackWidth);
    this.fallbackHeight = Number(fallbackHeight);
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const parent = BoxConstraints.from(constraints);
    const size = parent.constrain({
      width: parent.hasBoundedWidth ? parent.maxWidth : this.fallbackWidth,
      height: parent.hasBoundedHeight ? parent.maxHeight : this.fallbackHeight
    });
    return { widget: this, width: size.width, height: size.height, data: null };
  }

  override paint(context: RenderContext, box: PositionedBox<null>): void {
    context.canvas.strokeRect(box.x, box.y, box.width, box.height, this.color, this.strokeWidth);
    context.canvas.line(box.x, box.y, box.x + box.width, box.y + box.height, this.color, this.strokeWidth);
    context.canvas.line(box.x, box.y + box.height, box.x + box.width, box.y, this.color, this.strokeWidth);
  }
}

const PDF_LOGO_PATH = 'M 2.424 26.712 L 2.424 26.712 C 2.076 26.712 1.742 26.599 1.457 26.386 C 0.416 25.605 0.276 24.736 0.342 24.144 C 0.524 22.516 2.537 20.812 6.327 19.076 C 7.831 15.78 9.262 11.719 10.115 8.326 C 9.117 6.154 8.147 3.336 8.854 1.683 C 9.102 1.104 9.411 0.66 9.988 0.468 C 10.216 0.392 10.792 0.296 11.004 0.296 C 11.508 0.296 11.951 0.945 12.265 1.345 C 12.56 1.721 13.229 2.518 11.892 8.147 C 13.24 10.931 15.15 13.767 16.98 15.709 C 18.291 15.472 19.419 15.351 20.338 15.351 C 21.904 15.351 22.853 15.716 23.24 16.468 C 23.56 17.09 23.429 17.817 22.85 18.628 C 22.293 19.407 21.525 19.819 20.63 19.819 C 19.414 19.819 17.998 19.051 16.419 17.534 C 13.582 18.127 10.269 19.185 7.591 20.356 C 6.755 22.13 5.954 23.559 5.208 24.607 C 4.183 26.042 3.299 26.712 2.424 26.712 Z M 5.086 21.586 C 2.949 22.787 2.078 23.774 2.015 24.33 C 2.005 24.422 1.978 24.664 2.446 25.022 C 2.595 24.975 3.465 24.578 5.086 21.586 Z M 18.723 17.144 C 19.538 17.771 19.737 18.088 20.27 18.088 C 20.504 18.088 21.171 18.078 21.48 17.647 C 21.629 17.438 21.687 17.304 21.71 17.232 C 21.587 17.167 21.424 17.035 20.535 17.035 C 20.03 17.036 19.395 17.058 18.723 17.144 Z M 11.253 10.562 C 10.538 13.036 9.594 15.707 8.579 18.126 C 10.669 17.315 12.941 16.607 15.075 16.106 C 13.725 14.538 12.376 12.58 11.253 10.562 Z M 10.646 2.1 C 10.548 2.133 9.316 3.857 10.742 5.316 C 11.691 3.201 10.689 2.086 10.646 2.1 Z';

export interface PdfLogoOptions {
  readonly color?: ColorInput;
  readonly fit?: BoxFit;
}

export class PdfLogo extends StatelessWidget {
  readonly color: Rgb;
  readonly fit: BoxFit;

  constructor({ color = '#ff0000', fit = 'contain' }: PdfLogoOptions = {}) {
    super();
    this.color = normalizeColor(color);
    this.fit = fit;
  }

  override build(): AnyWidget {
    return new SvgImage({
      svg: `<svg viewBox="0 0 24 27"><path d="${PDF_LOGO_PATH}" fill="#000000"/></svg>`,
      fit: this.fit,
      colorFilter: this.color
    });
  }
}

const FLUTTER_LOGO = '<?xml version="1.0" encoding="UTF-8"?><svg version="1.1" viewBox="0 0 256 317"><defs><linearGradient id="a" x1="10%" x2="67%" y1="40%" y2="35%"><stop stop-color="#1a237e" stop-opacity=".4" offset="0"/><stop stop-color="#1a237e" stop-opacity="0" offset="1"/></linearGradient></defs><polygon points="157.67 0 0 157.67 48.801 206.47 255.27 0" fill="#54c5f8"/><polygon points="156.57 145.4 72.149 229.82 121.13 279.53 169.84 230.82 255.27 145.4" fill="#54c5f8"/><polygon points="121.13 279.53 158.21 316.61 255.27 316.61 169.84 230.82" fill="#01579b"/><polygon points="71.6 230.36 120.4 181.56 169.84 230.82 121.13 279.53" fill="#29b6f6"/><polygon points="121.13 279.53 189.44 253.83 167.85 233.75" fill="url(#a)" fill-opacity=".8"/></svg>';

export interface FlutterLogoOptions {
  readonly fit?: BoxFit;
}

export class FlutterLogo extends StatelessWidget {
  readonly fit: BoxFit;

  constructor({ fit = 'contain' }: FlutterLogoOptions = {}) {
    super();
    this.fit = fit;
  }

  override build(): AnyWidget {
    return new SvgImage({ svg: FLUTTER_LOGO, fit: this.fit });
  }
}

export interface LoremRandom {
  nextInt(maximum: number): number;
}

class SeededLoremRandom implements LoremRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextInt(maximum: number): number {
    if (!Number.isInteger(maximum) || maximum <= 0) {
      throw new RangeError('LoremRandom.nextInt maximum must be a positive integer');
    }
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return Math.floor(this.state / 0x100000000 * maximum);
  }
}

export interface LoremTextOptions {
  readonly random?: LoremRandom | null;
}

export class LoremText {
  static readonly words = Object.freeze(
    'ad adipiscing aliqua aliquip amet anim aute cillum commodo consectetur consequat culpa cupidatat deserunt do dolor dolore duis ea eiusmod elit enim esse est et eu ex excepteur exercitation fugiat id in incididunt ipsum irure labore laboris laborum lorem magna minim mollit nisi non nostrud nulla occaecat officia pariatur proident qui quis reprehenderit sed sint sit sunt tempor ullamco ut velit veniam voluptate'.split(' ')
  );

  readonly random: LoremRandom;

  constructor({ random = null }: LoremTextOptions = {}) {
    this.random = random ?? new SeededLoremRandom(978);
  }

  word(): string {
    return LoremText.words[this.random.nextInt(LoremText.words.length)]!;
  }

  sentence(length: number): string {
    const count = Math.max(0, Math.floor(length));
    if (count === 0) return '';
    const words: string[] = [];
    for (let index = 0; index < count; index++) {
      let word = this.word();
      if (index + 1 < count && this.random.nextInt(10) === 0) word += ',';
      words.push(word);
    }
    const value = `${words.join(' ')}.`;
    return value[0]!.toUpperCase() + value.slice(1);
  }

  paragraph(length: number): string {
    const target = Math.max(0, Math.floor(length));
    const sentences: string[] = [];
    let remaining = target;
    while (remaining > 0) {
      const maximum = Math.min(10, remaining);
      const minimum = Math.min(3, maximum);
      const count = minimum + (maximum === minimum ? 0 : this.random.nextInt(maximum - minimum + 1));
      sentences.push(this.sentence(count));
      remaining -= count;
    }
    return sentences.join(' ');
  }
}

export interface LoremOptions {
  readonly length?: number;
  readonly random?: LoremRandom | null;
  readonly style?: TextStyle | null;
  readonly textAlign?: TextAlign;
  readonly softWrap?: boolean;
  readonly textScaleFactor?: number;
  readonly maxLines?: number | null;
}

export class Lorem extends StatelessWidget {
  readonly length: number;
  readonly value: string;
  readonly style: TextStyle | null;
  readonly textAlign: TextAlign;
  readonly softWrap: boolean;
  readonly textScaleFactor: number;
  readonly maxLines: number | null;

  constructor({
    length = 50,
    random = null,
    style = null,
    textAlign = 'left',
    softWrap = true,
    textScaleFactor = 1,
    maxLines = null
  }: LoremOptions = {}) {
    super();
    this.length = Math.max(0, Math.floor(length));
    this.value = new LoremText({ random }).paragraph(this.length);
    this.style = style;
    this.textAlign = textAlign;
    this.softWrap = softWrap;
    this.textScaleFactor = Number(textScaleFactor);
    this.maxLines = maxLines;
  }

  override build(): AnyWidget {
    return new Text(this.value, {
      style: this.style ?? undefined,
      textAlign: this.textAlign,
      softWrap: this.softWrap,
      textScaleFactor: this.textScaleFactor,
      maxLines: this.maxLines ?? undefined
    });
  }
}
