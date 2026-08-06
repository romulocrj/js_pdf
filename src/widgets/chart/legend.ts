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
 *   - pdf/lib/src/widgets/chart/legend.dart
 */

import { Align, resolveBasicAlignment } from '../basic.ts';
import type { BasicAlignmentInput } from '../basic.ts';
import { Container } from '../container.ts';
import { BoxDecoration, normalizeBoxDecoration } from '../decoration.ts';
import type { BoxDecorationInput } from '../decoration.ts';
import { Row } from '../flex.ts';
import type { Axis } from '../flex.ts';
import { Alignment, EdgeInsets, normalizeInsets } from '../geometry.ts';
import type { Insets, InsetsInput } from '../geometry.ts';
import { Text } from '../text.ts';
import type { TextStyle } from '../text_style.ts';
import { StatelessWidget } from '../widget.ts';
import type { AnyWidget, RenderContext } from '../widget.ts';
import { CHART_WHITE, chartOf } from './chart.ts';
import type { AnyDataset } from './chart.ts';
import { Wrap } from '../wrap.ts';

/** Upstream takes an `AlignmentGeometry`; a raw `[x, y]` pair is accepted too. */
export type LegendPosition = BasicAlignmentInput | readonly [number, number];

function resolveLegendPosition(value: LegendPosition): Alignment {
  if (Array.isArray(value)) return { x: Number(value[0]), y: Number(value[1]) };
  return resolveBasicAlignment(value as BasicAlignmentInput);
}

export interface ChartLegendOptions {
  readonly textStyle?: TextStyle | null;
  readonly position?: LegendPosition;
  readonly direction?: Axis;
  readonly decoration?: BoxDecorationInput | null;
  readonly padding?: InsetsInput;
}

/** The colour swatches and labels of a chart's data sets. */
export class ChartLegend extends StatelessWidget {
  readonly textStyle: TextStyle | null;
  readonly position: Alignment;
  readonly direction: Axis;
  readonly decoration: BoxDecoration | null;
  readonly padding: Insets;

  constructor({
    textStyle = null,
    position = Alignment.topRight,
    direction = 'vertical',
    decoration = null,
    padding = EdgeInsets.all(5)
  }: ChartLegendOptions = {}) {
    super();
    this.textStyle = textStyle;
    this.position = resolveLegendPosition(position);
    this.direction = direction;
    this.decoration = normalizeBoxDecoration(decoration);
    this.padding = normalizeInsets(padding);
  }

  private buildLegend(context: RenderContext, dataset: AnyDataset): AnyWidget {
    const style = context.theme.defaultTextStyle.merge(this.textStyle);

    return new Row({
      mainAxisSize: 'min',
      children: [
        new Container({
          width: style.fontSize ?? undefined,
          height: style.fontSize ?? undefined,
          margin: EdgeInsets.only({ right: 5 }),
          child: dataset.legendShape(context)
        }),
        new Text(dataset.legend ?? '', this.textStyle === null ? {} : { style: this.textStyle })
      ]
    });
  }

  override build(context: RenderContext): AnyWidget {
    const datasets = chartOf(context).datasets;

    const wrap = new Wrap({
      direction: this.direction,
      spacing: 10,
      runSpacing: 10,
      crossAxisAlignment: this.direction === 'horizontal' ? 'center' : 'start',
      children: datasets
        .filter(dataset => dataset.legend !== null)
        .map(dataset => this.buildLegend(context, dataset))
    });

    return new Align({
      alignment: this.position,
      child: new Container({
        decoration: this.decoration ?? new BoxDecoration({ color: CHART_WHITE }),
        padding: this.padding,
        child: wrap
      })
    });
  }
}
