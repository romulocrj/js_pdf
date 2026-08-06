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
 *   - pdf/lib/src/widgets/wrap.dart
 *
 * Run continuation is an immutable child index instead of upstream's mutable
 * `WrapContext`, following the port's pure layout protocol.
 */

import type { Axis, VerticalDirection } from './flex.ts';
import { BoxConstraints } from './geometry.ts';
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

export type WrapAlignment =
  | 'start'
  | 'end'
  | 'center'
  | 'spaceBetween'
  | 'spaceAround'
  | 'spaceEvenly';
export type WrapCrossAlignment = 'start' | 'end' | 'center';

export interface WrapOptions {
  readonly direction?: Axis;
  readonly alignment?: WrapAlignment;
  readonly spacing?: number;
  readonly runAlignment?: WrapAlignment;
  readonly runSpacing?: number;
  readonly crossAxisAlignment?: WrapCrossAlignment;
  readonly verticalDirection?: VerticalDirection;
  readonly children?: readonly AnyWidget[];
}

export interface WrapState {
  readonly firstChild: number;
}

export interface WrapChildLayout {
  readonly box: AnyLayoutBox;
  readonly dx: number;
  readonly dy: number;
}

export interface WrapLayoutData {
  readonly children: readonly WrapChildLayout[];
  readonly firstChild: number;
  readonly lastChild: number;
  readonly runCount: number;
}

interface MeasuredChild {
  readonly index: number;
  readonly box: AnyLayoutBox;
  readonly main: number;
  readonly cross: number;
}

interface Run {
  readonly children: readonly MeasuredChild[];
  readonly main: number;
  readonly cross: number;
}

function validateAlignment(value: WrapAlignment, name: string): void {
  if (!['start', 'end', 'center', 'spaceBetween', 'spaceAround', 'spaceEvenly'].includes(value)) {
    throw new TypeError(`Unknown ${name}: ${value}`);
  }
}

function spaces(alignment: WrapAlignment, free: number, count: number): readonly [number, number] {
  switch (alignment) {
    case 'end': return [free, 0];
    case 'center': return [free / 2, 0];
    case 'spaceBetween': return [0, count > 1 ? free / (count - 1) : 0];
    case 'spaceAround': {
      const between = count > 0 ? free / count : 0;
      return [between / 2, between];
    }
    case 'spaceEvenly': {
      const between = free / (count + 1);
      return [between, between];
    }
    default: return [0, 0];
  }
}

/** Places children into successive runs and can resume at a run boundary. */
export class Wrap extends SpanningWidget<WrapLayoutData, WrapState> {
  readonly direction: Axis;
  readonly alignment: WrapAlignment;
  readonly spacing: number;
  readonly runAlignment: WrapAlignment;
  readonly runSpacing: number;
  readonly crossAxisAlignment: WrapCrossAlignment;
  readonly verticalDirection: VerticalDirection;
  readonly children: readonly AnyWidget[];

  constructor({
    direction = 'horizontal',
    alignment = 'start',
    spacing = 0,
    runAlignment = 'start',
    runSpacing = 0,
    crossAxisAlignment = 'start',
    verticalDirection = 'down',
    children = []
  }: WrapOptions = {}) {
    super();
    if (direction !== 'horizontal' && direction !== 'vertical') {
      throw new TypeError(`Unknown Wrap axis: ${direction}`);
    }
    validateAlignment(alignment, 'WrapAlignment');
    validateAlignment(runAlignment, 'runAlignment');
    if (!['start', 'end', 'center'].includes(crossAxisAlignment)) {
      throw new TypeError(`Unknown WrapCrossAlignment: ${crossAxisAlignment}`);
    }
    if (verticalDirection !== 'down' && verticalDirection !== 'up') {
      throw new TypeError(`Unknown verticalDirection: ${verticalDirection}`);
    }
    this.direction = direction;
    this.alignment = alignment;
    this.spacing = Math.max(0, Number(spacing));
    this.runAlignment = runAlignment;
    this.runSpacing = Math.max(0, Number(runSpacing));
    this.crossAxisAlignment = crossAxisAlignment;
    this.verticalDirection = verticalDirection;
    this.children = children;
  }

  override initialSpanState(): WrapState {
    return { firstChild: 0 };
  }

  private fragment(
    context: RenderContext,
    incoming: Constraints,
    state: WrapState
  ): SpanLayout<WrapLayoutData, WrapState> {
    const constraints = BoxConstraints.from(incoming);
    const horizontal = this.direction === 'horizontal';
    const maxMain = horizontal ? constraints.maxWidth : constraints.maxHeight;
    const maxCross = horizontal ? constraints.maxHeight : constraints.maxWidth;
    const childConstraints = horizontal
      ? new BoxConstraints({ maxWidth: maxMain })
      : new BoxConstraints({ maxHeight: maxMain });
    const runs: Run[] = [];
    let current: MeasuredChild[] = [];
    let currentMain = 0;
    let currentCross = 0;

    const closeRun = (): void => {
      if (current.length === 0) return;
      runs.push({ children: current, main: currentMain, cross: currentCross });
      current = [];
      currentMain = 0;
      currentCross = 0;
    };

    for (let index = state.firstChild; index < this.children.length; index++) {
      const box = this.children[index]!.layout(context, childConstraints);
      const main = horizontal ? box.width : box.height;
      const cross = horizontal ? box.height : box.width;
      if (current.length > 0 && currentMain + this.spacing + main > maxMain) {
        closeRun();
      }
      const nextCrossTotal = runs.reduce((sum, run) => sum + run.cross, 0)
        + this.runSpacing * runs.length
        + Math.max(currentCross, cross);
      if (current.length === 0 && runs.length > 0 && nextCrossTotal > maxCross + 0.000001) {
        break;
      }
      current.push({ index, box, main, cross });
      currentMain += (current.length > 1 ? this.spacing : 0) + main;
      currentCross = Math.max(currentCross, cross);
    }
    closeRun();

    let usedCross = runs.reduce((sum, run) => sum + run.cross, 0)
      + this.runSpacing * Math.max(0, runs.length - 1);
    while (runs.length > 0 && Number.isFinite(maxCross) && usedCross > maxCross + 0.000001) {
      const removed = runs.pop()!;
      usedCross -= removed.cross + (runs.length > 0 ? this.runSpacing : 0);
    }

    const maxRunMain = runs.reduce((value, run) => Math.max(value, run.main), 0);
    const natural = horizontal
      ? { width: maxRunMain, height: usedCross }
      : { width: usedCross, height: maxRunMain };
    const size = constraints.constrain(natural);
    const containerMain = horizontal ? size.width : size.height;
    const containerCross = horizontal ? size.height : size.width;
    const [runLeading, runBetweenExtra] = spaces(
      this.runAlignment,
      Math.max(0, containerCross - usedCross),
      runs.length
    );
    const reverseRuns = horizontal && this.verticalDirection === 'up';
    let crossCursor = reverseRuns ? containerCross - runLeading : runLeading;
    const placed: WrapChildLayout[] = [];

    for (const run of runs) {
      if (reverseRuns) crossCursor -= run.cross;
      const [childLeading, childBetweenExtra] = spaces(
        this.alignment,
        Math.max(0, containerMain - run.main),
        run.children.length
      );
      const reverseChildren = !horizontal && this.verticalDirection === 'up';
      let mainCursor = reverseChildren ? containerMain - childLeading : childLeading;
      for (const child of run.children) {
        if (reverseChildren) mainCursor -= child.main;
        const freeCross = run.cross - child.cross;
        const childCross = this.crossAxisAlignment === 'end'
          ? freeCross
          : this.crossAxisAlignment === 'center'
            ? freeCross / 2
            : 0;
        placed.push({
          box: child.box,
          dx: horizontal ? mainCursor : crossCursor + childCross,
          dy: horizontal ? crossCursor + childCross : mainCursor
        });
        const advance = child.main + this.spacing + childBetweenExtra;
        mainCursor += reverseChildren ? -advance : advance;
      }
      const runAdvance = run.cross + this.runSpacing + runBetweenExtra;
      crossCursor += reverseRuns ? -runAdvance : runAdvance;
    }

    const lastChild = placed.length === 0
      ? state.firstChild
      : Math.max(...runs.flatMap(run => run.children.map(child => child.index))) + 1;
    const data: WrapLayoutData = {
      children: placed,
      firstChild: state.firstChild,
      lastChild,
      runCount: runs.length
    };
    const nextState = { firstChild: lastChild };
    return {
      box: { widget: this, width: size.width, height: size.height, data },
      nextState,
      hasMore: lastChild < this.children.length
    };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<WrapLayoutData> {
    return this.fragment(context, constraints, this.initialSpanState()).box;
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: WrapState
  ): SpanLayout<WrapLayoutData, WrapState> {
    return this.fragment(context, constraints, state);
  }

  override paint(context: RenderContext, box: PositionedBox<WrapLayoutData>): void {
    for (const child of box.data.children) {
      child.box.widget.paint(context, {
        ...child.box,
        x: box.x + child.dx,
        y: box.y + child.dy
      });
    }
  }
}
