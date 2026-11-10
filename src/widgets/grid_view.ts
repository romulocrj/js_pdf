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
 *   - pdf/lib/src/widgets/grid_view.dart
 *
 * Continuation state is immutable. The upstream `hasMoreWidgets` getter always
 * returns true; the port reports the actual remaining child count so a complete
 * grid cannot create empty pages forever.
 */

import type { Axis } from './flex.ts';
import { Directionality } from './directionality.ts';
import { BoxConstraints, normalizeInsetsGeometry, resolveInsets } from './geometry.ts';
import type { InsetsGeometry, InsetsInput } from './geometry.ts';
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
  readonly padding: InsetsGeometry;
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
    this.padding = normalizeInsetsGeometry(padding);
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
    state: GridViewState,
    spanning: boolean
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

    const direction = Directionality.of(context);
    const padding = resolveInsets(this.padding, direction);
    const inner = parent.deflate(padding);
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

    /*
     * Outside a MultiPage nothing continues on a later page, so a run taller
     * than the space is still drawn, overflowing, as upstream PR #1980 does; it
     * used to draw nothing at all. A MultiPage fragment keeps a zero capacity,
     * which moves the grid to a fresh page or fails there, so it terminates.
     */
    const runCapacity = Number.isFinite(maxMain)
      ? Math.max(
        spanning ? 0 : 1,
        Math.floor((maxMain + this.mainAxisSpacing + 0.000001) / (childMainAxis + this.mainAxisSpacing))
      )
      : neededRuns;
    const childCapacity = runCapacity * this.crossAxisCount;
    const count = Math.min(remaining, childCapacity);
    const runCount = count === 0 ? 0 : Math.ceil(count / this.crossAxisCount);
    const children: GridChildLayout[] = [];
    const totalMain = runCount === 0
      ? 0
      : runCount * childMainAxis + (runCount - 1) * this.mainAxisSpacing;
    const totalCross = this.crossAxisCount * childCrossAxis
      + (this.crossAxisCount - 1) * this.crossAxisSpacing;
    const band = vertical ? totalCross : totalMain;

    for (let local = 0; local < count; local++) {
      const index = state.firstChild + local;
      const run = Math.floor(local / this.crossAxisCount);
      const cross = local % this.crossAxisCount;
      const childConstraints = vertical
        ? BoxConstraints.tight({ width: childCrossAxis, height: childMainAxis })
        : BoxConstraints.tight({ width: childMainAxis, height: childCrossAxis });
      const childBox = this.children[index]!.layout(context, childConstraints);
      const dx = padding.left + (vertical
        ? cross * (childCrossAxis + this.crossAxisSpacing)
        : run * (childMainAxis + this.mainAxisSpacing));
      children.push({
        box: childBox,
        /*
         * RTL mirrors the ltr position about the padded band, as upstream PR
         * #1980 does (CHANGELOG L83). Upstream wrote the rtl position as a
         * second formula, which shifted children by about a cell and, from
         * four columns on, put them outside the grid.
         */
        dx: direction === 'rtl' ? 2 * padding.left + band - dx - childBox.width : dx,
        dy: padding.top + (vertical
          ? run * (childMainAxis + this.mainAxisSpacing)
          : cross * (childCrossAxis + this.crossAxisSpacing))
      });
    }

    const natural = vertical
      ? {
        width: totalCross + padding.left + padding.right,
        height: totalMain + padding.top + padding.bottom
      }
      : {
        width: totalMain + padding.left + padding.right,
        height: totalCross + padding.top + padding.bottom
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
    return this.fragment(context, constraints, this.initialSpanState(), false).box;
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: GridViewState
  ): SpanLayout<GridViewLayoutData, GridViewState> {
    return this.fragment(context, constraints, state, true);
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
