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
 *   - pdf/lib/src/widgets/text_style.dart
 */

import type { TextDirection } from './border_radius.ts';
import {
  Inherited,
  InheritedWidget,
  StatelessWidget
} from './widget.ts';
import type { AnyWidget, RenderContext } from './widget.ts';

export class InheritedDirectionality extends Inherited {
  readonly textDirection: TextDirection;

  constructor(textDirection: TextDirection) {
    super();
    this.textDirection = textDirection;
  }
}

export interface DirectionalityOptions {
  readonly textDirection: TextDirection;
  readonly child: AnyWidget;
}

/** Supplies the text direction used by direction-sensitive descendants. */
export class Directionality extends StatelessWidget {
  readonly textDirection: TextDirection;
  readonly child: AnyWidget;

  constructor({ textDirection, child }: DirectionalityOptions) {
    super();
    if (textDirection !== 'ltr' && textDirection !== 'rtl') {
      throw new TypeError(`Unknown text direction: ${String(textDirection)}`);
    }
    this.textDirection = textDirection;
    this.child = child;
  }

  static of(context: RenderContext): TextDirection {
    return InheritedWidget.of(context, InheritedDirectionality)?.textDirection
      ?? context.textDirection
      ?? 'ltr';
  }

  override build(_context: RenderContext): AnyWidget {
    return new InheritedWidget({
      inherited: new InheritedDirectionality(this.textDirection),
      build: () => this.child
    });
  }
}
