/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/widgets/grid_view.dart
 *
 * Continuation state is immutable. The upstream `hasMoreWidgets` getter always
 * returns true; the port reports the actual remaining child count so a complete
 * grid cannot create empty pages forever.
 */

import type { Axis } from './flex.ts';
import { BoxConstraints, normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { SpanningWidget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext,
  SpanLayout
} from './widget.ts';

export interface GridViewOptions {
  readonly direction?: Axis;
  readonly padding?: InsetsInput;
  readonly crossAxisCount: number;
  readonly mainAxisSpacing?: number;
  readonly crossAxisSpacing?: number;
  readonly childAspectRatio?: number;
  readonly children?: readonly AnyWidget[];
}

export interface GridViewState {
  readonly firstChild: number;
  readonly childCrossAxis: number | null;
  readonly childMainAxis: number | null;
}

export interface GridChildLayout {
  readonly box: AnyLayoutBox;
  readonly dx: number;
  readonly dy: number;
}

export interface GridViewLayoutData {
  readonly children: readonly GridChildLayout[];
  readonly firstChild: number;
  readonly lastChild: number;
  readonly childCrossAxis: number;
  readonly childMainAxis: number;
}

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
  return value;
}

/** A fixed-track grid that can continue on later `MultiPage` pages. */
export class GridView extends SpanningWidget<GridViewLayoutData, GridViewState> {
  readonly direction: Axis;
  readonly padding: Insets;
  readonly crossAxisCount: number;
  readonly mainAxisSpacing: number;
  readonly crossAxisSpacing: number;
  readonly childAspectRatio: number;
  readonly children: readonly AnyWidget[];

  constructor({
    direction = 'vertical',
    padding = 0,
    crossAxisCount,
    mainAxisSpacing = 0,
    crossAxisSpacing = 0,
    childAspectRatio = Infinity,
    children = []
  }: GridViewOptions) {
    super();
    if (direction !== 'horizontal' && direction !== 'vertical') {
      throw new TypeError(`Unknown GridView axis: ${direction}`);
    }
    this.direction = direction;
    this.padding = normalizeInsets(padding);
    this.crossAxisCount = Math.trunc(Number(crossAxisCount));
    if (!Number.isFinite(this.crossAxisCount) || this.crossAxisCount <= 0) {
      throw new RangeError('GridView.crossAxisCount must be a positive integer');
    }
    this.mainAxisSpacing = finiteNonNegative(Number(mainAxisSpacing), 'mainAxisSpacing');
    this.crossAxisSpacing = finiteNonNegative(Number(crossAxisSpacing), 'crossAxisSpacing');
    this.childAspectRatio = Number(childAspectRatio);
    if (!(this.childAspectRatio > 0)) {
      throw new RangeError('GridView.childAspectRatio must be positive');
    }
    this.children = children;
  }

  override initialSpanState(): GridViewState {
    return { firstChild: 0, childCrossAxis: null, childMainAxis: null };
  }

  private fragment(
    context: RenderContext,
    incoming: Constraints,
    state: GridViewState
  ): SpanLayout<GridViewLayoutData, GridViewState> {
    const parent = BoxConstraints.from(incoming);
    if (state.firstChild >= this.children.length) {
      const size = parent.constrain({ width: 0, height: 0 });
      const data: GridViewLayoutData = {
        children: [],
        firstChild: state.firstChild,
        lastChild: state.firstChild,
        childCrossAxis: state.childCrossAxis ?? 0,
        childMainAxis: state.childMainAxis ?? 0
      };
      return {
        box: { widget: this, width: size.width, height: size.height, data },
        nextState: state,
        hasMore: false
      };
    }

    const inner = parent.deflate(this.padding);
    const vertical = this.direction === 'vertical';
    const maxMain = vertical ? inner.maxHeight : inner.maxWidth;
    const maxCross = vertical ? inner.maxWidth : inner.maxHeight;
    if (!Number.isFinite(maxCross)) {
      throw new RangeError('GridView requires a bounded cross axis');
    }

    const childCrossAxis = state.childCrossAxis ?? Math.max(
      0,
      (maxCross - this.crossAxisSpacing * (this.crossAxisCount - 1)) / this.crossAxisCount
    );
    const remaining = this.children.length - state.firstChild;
    const neededRuns = Math.ceil(remaining / this.crossAxisCount);
    let childMainAxis = state.childMainAxis;
    if (childMainAxis === null) {
      if (Number.isFinite(this.childAspectRatio)) {
        childMainAxis = childCrossAxis * this.childAspectRatio;
      } else {
        if (!Number.isFinite(maxMain)) {
          throw new RangeError('GridView needs a bounded main axis or childAspectRatio');
        }
        childMainAxis = Math.max(
          0,
          (maxMain - this.mainAxisSpacing * (neededRuns - 1)) / neededRuns
        );
      }
    }

    const runCapacity = Number.isFinite(maxMain)
      ? Math.max(0, Math.floor((maxMain + this.mainAxisSpacing + 0.000001) / (childMainAxis + this.mainAxisSpacing)))
      : neededRuns;
    const childCapacity = runCapacity * this.crossAxisCount;
    const count = Math.min(remaining, childCapacity);
    const runCount = count === 0 ? 0 : Math.ceil(count / this.crossAxisCount);
    const children: GridChildLayout[] = [];

    for (let local = 0; local < count; local++) {
      const index = state.firstChild + local;
      const run = Math.floor(local / this.crossAxisCount);
      const cross = local % this.crossAxisCount;
      const childConstraints = vertical
        ? BoxConstraints.tight({ width: childCrossAxis, height: childMainAxis })
        : BoxConstraints.tight({ width: childMainAxis, height: childCrossAxis });
      const childBox = this.children[index]!.layout(context, childConstraints);
      children.push({
        box: childBox,
        dx: this.padding.left + (vertical
          ? cross * (childCrossAxis + this.crossAxisSpacing)
          : run * (childMainAxis + this.mainAxisSpacing)),
        dy: this.padding.top + (vertical
          ? run * (childMainAxis + this.mainAxisSpacing)
          : cross * (childCrossAxis + this.crossAxisSpacing))
      });
    }

    const totalMain = runCount === 0
      ? 0
      : runCount * childMainAxis + (runCount - 1) * this.mainAxisSpacing;
    const totalCross = this.crossAxisCount * childCrossAxis
      + (this.crossAxisCount - 1) * this.crossAxisSpacing;
    const natural = vertical
      ? {
        width: totalCross + this.padding.left + this.padding.right,
        height: totalMain + this.padding.top + this.padding.bottom
      }
      : {
        width: totalMain + this.padding.left + this.padding.right,
        height: totalCross + this.padding.top + this.padding.bottom
      };
    const size = parent.constrain(natural);
    const lastChild = state.firstChild + count;
    const data: GridViewLayoutData = {
      children,
      firstChild: state.firstChild,
      lastChild,
      childCrossAxis,
      childMainAxis
    };
    const nextState: GridViewState = { firstChild: lastChild, childCrossAxis, childMainAxis };
    return {
      box: { widget: this, width: size.width, height: size.height, data },
      nextState,
      hasMore: lastChild < this.children.length
    };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<GridViewLayoutData> {
    return this.fragment(context, constraints, this.initialSpanState()).box;
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: GridViewState
  ): SpanLayout<GridViewLayoutData, GridViewState> {
    return this.fragment(context, constraints, state);
  }

  override paint(context: RenderContext, box: PositionedBox<GridViewLayoutData>): void {
    for (const child of box.data.children) {
      child.box.widget.paint(context, {
        ...child.box,
        x: box.x + child.dx,
        y: box.y + child.dy
      });
    }
  }
}
