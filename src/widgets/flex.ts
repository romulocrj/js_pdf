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
 *   - pdf/lib/src/widgets/flex.dart
 *
 * Layout results and child offsets live in `FlexLayoutData`; unlike upstream,
 * no child box or continuation cursor is written back onto a widget instance.
 * The port keeps its pre-existing `gap`, `margin` and `Row.widths` conveniences
 * on top of the upstream flex allocation algorithm.
 */

import { BoxConstraints, normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { Padding, SizedBox } from './basic.ts';
import { SpanningWidget, StatelessWidget, Widget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext,
  SpanLayout
} from './widget.ts';

export type Axis = 'horizontal' | 'vertical';
export type FlexFit = 'tight' | 'loose';
export type MainAxisSize = 'min' | 'max';
export type MainAxisAlignment =
  | 'start'
  | 'end'
  | 'center'
  | 'spaceBetween'
  | 'spaceAround'
  | 'spaceEvenly';
export type CrossAxisAlignment = 'start' | 'end' | 'center' | 'stretch';
export type VerticalDirection = 'up' | 'down';

export interface FlexOptions {
  readonly direction: Axis;
  readonly children?: readonly AnyWidget[];
  readonly mainAxisAlignment?: MainAxisAlignment;
  readonly mainAxisSize?: MainAxisSize;
  readonly crossAxisAlignment?: CrossAxisAlignment;
  readonly verticalDirection?: VerticalDirection;
  readonly gap?: number;
  readonly margin?: InsetsInput;
  /** Legacy weighted tracks. Only valid for a horizontal flex. */
  readonly widths?: readonly number[] | null;
}

export interface ColumnOptions extends Omit<FlexOptions, 'direction' | 'widths'> {}

export interface RowOptions extends Omit<FlexOptions, 'direction'> {}

export interface FlexibleOptions {
  readonly flex?: number;
  readonly fit?: FlexFit;
  readonly child: AnyWidget;
}

export interface ExpandedOptions extends Omit<FlexibleOptions, 'fit'> {
  readonly fit?: FlexFit;
}

export interface FlexChildLayout {
  readonly box: AnyLayoutBox;
  readonly dx: number;
  readonly dy: number;
}

export interface FlexLayoutData {
  readonly children: readonly FlexChildLayout[];
}

export interface FlexState {
  readonly firstChild: number;
}

export interface FlexibleLayoutData {
  readonly childBox: AnyLayoutBox;
}

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
  return value;
}

function childMain(box: AnyLayoutBox, direction: Axis): number {
  return direction === 'horizontal' ? box.width : box.height;
}

function childCross(box: AnyLayoutBox, direction: Axis): number {
  return direction === 'horizontal' ? box.height : box.width;
}

function axisConstraints(
  direction: Axis,
  minMain: number,
  maxMain: number,
  minCross: number,
  maxCross: number
): BoxConstraints {
  return direction === 'horizontal'
    ? new BoxConstraints({
      minWidth: minMain,
      maxWidth: maxMain,
      minHeight: minCross,
      maxHeight: maxCross
    })
    : new BoxConstraints({
      minWidth: minCross,
      maxWidth: maxCross,
      minHeight: minMain,
      maxHeight: maxMain
    });
}

class EmptyFlexChild extends Widget<null> {
  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const size = BoxConstraints.from(constraints).smallest;
    return { widget: this, width: size.width, height: size.height, data: null };
  }

  override paint(): void {}
}

/** Controls how a direct child of `Flex`, `Row` or `Column` uses free space. */
export class Flexible extends Widget<FlexibleLayoutData> {
  readonly flex: number;
  readonly fit: FlexFit;
  readonly child: AnyWidget;

  constructor({ flex = 1, fit = 'loose', child }: FlexibleOptions) {
    super();
    this.flex = finiteNonNegative(Number(flex), 'flex');
    if (fit !== 'tight' && fit !== 'loose') {
      throw new TypeError(`Unknown FlexFit: ${fit}`);
    }
    this.fit = fit;
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<FlexibleLayoutData> {
    const childBox = this.child.layout(context, constraints);
    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<FlexibleLayoutData>): void {
    const { childBox } = box.data;
    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

/** A flexible child that fills its allocated main-axis extent by default. */
export class Expanded extends Flexible {
  constructor({ flex = 1, fit = 'tight', child }: ExpandedOptions) {
    super({ flex, fit, child });
  }
}

/** Empty proportional space inside a flex container. */
export class Spacer extends Expanded {
  constructor(options: number | { readonly flex?: number } = 1) {
    const flex = typeof options === 'number' ? options : options.flex ?? 1;
    super({ flex, child: new EmptyFlexChild() });
  }
}

/** The shared upstream flex algorithm behind `Row` and `Column`. */
export class Flex extends SpanningWidget<FlexLayoutData, FlexState> {
  readonly direction: Axis;
  readonly children: readonly AnyWidget[];
  readonly mainAxisAlignment: MainAxisAlignment;
  readonly mainAxisSize: MainAxisSize;
  readonly crossAxisAlignment: CrossAxisAlignment;
  readonly verticalDirection: VerticalDirection;
  readonly gap: number;
  readonly margin: Insets;
  readonly widths: readonly number[] | null;

  override get canSpan(): boolean {
    return this.direction === 'vertical';
  }

  constructor({
    direction,
    children = [],
    mainAxisAlignment = 'start',
    mainAxisSize = 'max',
    crossAxisAlignment = 'center',
    verticalDirection = 'down',
    gap = 0,
    margin = 0,
    widths = null
  }: FlexOptions) {
    super();
    if (direction !== 'horizontal' && direction !== 'vertical') {
      throw new TypeError(`Unknown Axis: ${direction}`);
    }
    if (!['start', 'end', 'center', 'spaceBetween', 'spaceAround', 'spaceEvenly']
      .includes(mainAxisAlignment)) {
      throw new TypeError(`Unknown MainAxisAlignment: ${mainAxisAlignment}`);
    }
    if (mainAxisSize !== 'min' && mainAxisSize !== 'max') {
      throw new TypeError(`Unknown MainAxisSize: ${mainAxisSize}`);
    }
    if (!['start', 'end', 'center', 'stretch'].includes(crossAxisAlignment)) {
      throw new TypeError(`Unknown CrossAxisAlignment: ${crossAxisAlignment}`);
    }
    if (verticalDirection !== 'up' && verticalDirection !== 'down') {
      throw new TypeError(`Unknown VerticalDirection: ${verticalDirection}`);
    }
    if (widths !== null && direction !== 'horizontal') {
      throw new TypeError('Flex.widths is only valid on a horizontal flex');
    }
    this.direction = direction;
    this.children = children;
    this.mainAxisAlignment = mainAxisAlignment;
    this.mainAxisSize = mainAxisSize;
    this.crossAxisAlignment = crossAxisAlignment;
    this.verticalDirection = verticalDirection;
    this.gap = finiteNonNegative(Number(gap), 'gap');
    this.margin = normalizeInsets(margin);
    this.widths = widths;
  }

  private crossConstraints(constraints: BoxConstraints): readonly [number, number] {
    const maximum = this.direction === 'horizontal'
      ? constraints.maxHeight
      : constraints.maxWidth;
    if (this.crossAxisAlignment === 'stretch' && Number.isFinite(maximum)) {
      return [maximum, maximum];
    }
    return [0, maximum];
  }

  override initialSpanState(): FlexState {
    return { firstChild: 0 };
  }

  override layoutSpan(
    context: RenderContext,
    incoming: Constraints,
    state: FlexState
  ): SpanLayout<FlexLayoutData, FlexState> {
    if (this.direction === 'horizontal' || state.firstChild >= this.children.length) {
      const box = this.layout(context, incoming);
      return {
        box,
        nextState: { firstChild: this.children.length },
        hasMore: false
      };
    }

    const outer = BoxConstraints.from(incoming);
    const constraints = outer.deflate(this.margin);
    const [, childMaxCross] = this.crossConstraints(constraints);
    const childMinCross = this.crossAxisAlignment === 'stretch' && Number.isFinite(childMaxCross)
      ? childMaxCross
      : 0;
    const available = constraints.maxHeight;
    let allocated = 0;
    let lastChild = state.firstChild;

    for (let index = state.firstChild; index < this.children.length; index++) {
      const child = this.children[index]!;
      if (child instanceof Flexible && child.flex > 0) {
        lastChild = index + 1;
        continue;
      }
      const childBox = child.layout(context, axisConstraints(
        this.direction,
        0,
        Infinity,
        childMinCross,
        childMaxCross
      ));
      const next = allocated
        + (lastChild > state.firstChild ? this.gap : 0)
        + childBox.height;
      if (next > available && lastChild > state.firstChild) break;
      allocated = next;
      lastChild = index + 1;
      if (next > available) break;
    }

    if (lastChild === state.firstChild && state.firstChild < this.children.length) {
      lastChild++;
    }

    const fragment = new Flex({
      direction: this.direction,
      children: this.children.slice(state.firstChild, lastChild),
      mainAxisAlignment: this.mainAxisAlignment,
      mainAxisSize: this.mainAxisSize,
      crossAxisAlignment: this.crossAxisAlignment,
      verticalDirection: this.verticalDirection,
      gap: this.gap,
      margin: this.margin,
      widths: this.widths
    }).layout(context, incoming);
    const nextState = { firstChild: lastChild };
    return {
      box: { ...fragment, widget: this },
      nextState,
      hasMore: lastChild < this.children.length
    };
  }

  override layout(context: RenderContext, incoming: Constraints): LayoutBox<FlexLayoutData> {
    const outer = BoxConstraints.from(incoming);
    const constraints = outer.deflate(this.margin);
    const horizontal = this.direction === 'horizontal';
    const maxMain = horizontal ? constraints.maxWidth : constraints.maxHeight;
    const minMain = horizontal ? constraints.minWidth : constraints.minHeight;
    const maxCross = horizontal ? constraints.maxHeight : constraints.maxWidth;
    const minCross = horizontal ? constraints.minHeight : constraints.minWidth;
    const canFlex = Number.isFinite(maxMain);
    const baseGap = this.gap * Math.max(0, this.children.length - 1);
    const measured: AnyLayoutBox[] = new Array(this.children.length);
    let allocated = 0;
    let crossSize = 0;

    const measure = (index: number, childConstraints: BoxConstraints): AnyLayoutBox => {
      const box = this.children[index]!.layout(context, childConstraints);
      measured[index] = box;
      allocated += childMain(box, this.direction);
      crossSize = Math.max(crossSize, childCross(box, this.direction));
      return box;
    };

    if (this.widths !== null) {
      if (!canFlex) throw new RangeError('Row.widths requires a bounded width');
      const available = Math.max(0, maxMain - baseGap);
      const weights = this.children.map((_, index) => finiteNonNegative(
        Number(this.widths?.[index] ?? 1),
        `widths[${index}]`
      ));
      const total = weights.reduce((sum, value) => sum + value, 0) || 1;
      const [childMinCross, childMaxCross] = this.crossConstraints(constraints);
      let used = 0;
      for (let index = 0; index < this.children.length; index++) {
        const extent = index === this.children.length - 1
          ? available - used
          : available * weights[index]! / total;
        used += extent;
        measure(index, axisConstraints(
          this.direction,
          extent,
          extent,
          childMinCross,
          childMaxCross
        ));
      }
    } else {
      let totalFlex = 0;
      const flexible: number[] = [];
      const [childMinCross, childMaxCross] = this.crossConstraints(constraints);

      for (let index = 0; index < this.children.length; index++) {
        const child = this.children[index]!;
        if (child instanceof Flexible && child.flex > 0) {
          if (!canFlex && (this.mainAxisSize === 'max' || child.fit === 'tight')) {
            throw new RangeError('Flex children require a bounded main-axis constraint');
          }
          totalFlex += child.flex;
          flexible.push(index);
        } else {
          measure(index, axisConstraints(
            this.direction,
            0,
            Infinity,
            childMinCross,
            childMaxCross
          ));
        }
      }

      const freeSpace = Math.max(0, (canFlex ? maxMain : 0) - allocated - baseGap);
      let allocatedFlex = 0;
      for (let flexIndex = 0; flexIndex < flexible.length; flexIndex++) {
        const index = flexible[flexIndex]!;
        const child = this.children[index] as Flexible;
        const extent = canFlex
          ? (flexIndex === flexible.length - 1
            ? freeSpace - allocatedFlex
            : freeSpace * child.flex / totalFlex)
          : Infinity;
        allocatedFlex += extent;
        measure(index, axisConstraints(
          this.direction,
          child.fit === 'tight' ? extent : 0,
          extent,
          childMinCross,
          childMaxCross
        ));
      }
    }

    allocated += baseGap;
    const idealMain = canFlex && this.mainAxisSize === 'max' ? maxMain : allocated;
    const actualMain = Math.min(maxMain, Math.max(minMain, idealMain));
    const actualCross = Math.min(maxCross, Math.max(minCross, crossSize));
    const remaining = Math.max(0, actualMain - allocated);
    let leading = 0;
    let between = this.gap;
    const count = this.children.length;

    switch (this.mainAxisAlignment) {
      case 'end':
        leading = remaining;
        break;
      case 'center':
        leading = remaining / 2;
        break;
      case 'spaceBetween':
        between += count > 1 ? remaining / (count - 1) : 0;
        break;
      case 'spaceAround': {
        const extra = count > 0 ? remaining / count : 0;
        leading = extra / 2;
        between += extra;
        break;
      }
      case 'spaceEvenly': {
        const extra = count > 0 ? remaining / (count + 1) : 0;
        leading = extra;
        between += extra;
        break;
      }
      case 'start':
        break;
    }

    const reverse = this.direction === 'vertical' && this.verticalDirection === 'up';
    let cursor = reverse ? actualMain - leading : leading;
    const children: FlexChildLayout[] = [];
    for (let index = 0; index < measured.length; index++) {
      const box = measured[index]!;
      const main = childMain(box, this.direction);
      const cross = childCross(box, this.direction);
      const crossPosition = this.crossAxisAlignment === 'end'
        ? actualCross - cross
        : this.crossAxisAlignment === 'center'
          ? (actualCross - cross) / 2
          : 0;
      const mainPosition = reverse ? cursor - main : cursor;
      children.push({
        box,
        dx: this.margin.left + (horizontal ? mainPosition : crossPosition),
        dy: this.margin.top + (horizontal ? crossPosition : mainPosition)
      });
      cursor += reverse ? -(main + between) : main + between;
    }

    const innerWidth = horizontal ? actualMain : actualCross;
    const innerHeight = horizontal ? actualCross : actualMain;
    const size = outer.constrain({
      width: innerWidth + this.margin.left + this.margin.right,
      height: innerHeight + this.margin.top + this.margin.bottom
    });
    return { widget: this, width: size.width, height: size.height, data: { children } };
  }

  override paint(context: RenderContext, box: PositionedBox<FlexLayoutData>): void {
    for (const child of box.data.children) {
      child.box.widget.paint(context, {
        ...child.box,
        x: box.x + child.dx,
        y: box.y + child.dy
      });
    }
  }
}

export class Row extends Flex {
  constructor(options: RowOptions = {}) {
    super({ ...options, direction: 'horizontal' });
  }
}

export class Column extends Flex {
  constructor(options: ColumnOptions = {}) {
    super({ ...options, direction: 'vertical' });
  }
}

export type IndexedWidgetBuilder = (context: RenderContext, index: number) => AnyWidget;

export interface ListViewOptions {
  readonly direction?: Axis;
  readonly reverse?: boolean;
  readonly spacing?: number | null;
  readonly padding?: InsetsInput | null;
  readonly children?: readonly AnyWidget[];
  readonly itemBuilder?: IndexedWidgetBuilder | null;
  readonly separatorBuilder?: IndexedWidgetBuilder | null;
  readonly itemCount?: number;
}

/** A flex list that can be supplied eagerly, by builder, or with separators. */
export class ListView extends StatelessWidget {
  readonly direction: Axis;
  readonly reverse: boolean;
  readonly spacing: number | null;
  readonly padding: InsetsInput | null;
  readonly children: readonly AnyWidget[] | null;
  readonly itemBuilder: IndexedWidgetBuilder | null;
  readonly separatorBuilder: IndexedWidgetBuilder | null;
  readonly itemCount: number;

  constructor({
    direction = 'vertical',
    reverse = false,
    spacing = 0,
    padding = null,
    children = [],
    itemBuilder = null,
    separatorBuilder = null,
    itemCount = undefined
  }: ListViewOptions = {}) {
    super();
    this.direction = direction;
    this.reverse = Boolean(reverse);
    this.spacing = spacing === null ? null : finiteNonNegative(Number(spacing), 'spacing');
    this.padding = padding;
    this.children = itemBuilder === null ? children : null;
    this.itemBuilder = itemBuilder;
    this.separatorBuilder = separatorBuilder;
    this.itemCount = itemCount === undefined ? children.length : Math.trunc(Number(itemCount));
    if (this.itemCount < 0 || !Number.isFinite(this.itemCount)) {
      throw new RangeError('ListView.itemCount must be a finite non-negative integer');
    }
    if (this.children === null && this.itemBuilder === null) {
      throw new TypeError('ListView.builder requires itemBuilder');
    }
    if (this.spacing === null && this.separatorBuilder === null) {
      throw new TypeError('ListView.separated requires separatorBuilder');
    }
  }

  static builder(options: Omit<ListViewOptions, 'children' | 'separatorBuilder'> & {
    readonly itemBuilder: IndexedWidgetBuilder;
    readonly itemCount: number;
  }): ListView {
    return new ListView({ ...options, children: [], separatorBuilder: null });
  }

  static separated(options: Omit<ListViewOptions, 'children' | 'spacing'> & {
    readonly itemBuilder: IndexedWidgetBuilder;
    readonly separatorBuilder: IndexedWidgetBuilder;
    readonly itemCount: number;
  }): ListView {
    return new ListView({ ...options, children: [], spacing: null });
  }

  private item(context: RenderContext, index: number): AnyWidget {
    return this.children === null ? this.itemBuilder!(context, index) : this.children[index]!;
  }

  private separator(context: RenderContext, index: number): AnyWidget {
    if (this.spacing === null) return this.separatorBuilder!(context, index);
    return this.direction === 'vertical'
      ? new SizedBox({ height: this.spacing })
      : new SizedBox({ width: this.spacing });
  }

  override build(context: RenderContext): AnyWidget {
    const children: AnyWidget[] = [];
    const indexes = Array.from({ length: this.itemCount }, (_, index) => index);
    if (this.reverse) indexes.reverse();
    for (let position = 0; position < indexes.length; position++) {
      const index = indexes[position]!;
      children.push(this.item(context, index));
      if (position < indexes.length - 1 && this.spacing !== 0) {
        children.push(this.separator(context, index));
      }
    }
    const list = new Flex({
      direction: this.direction,
      mainAxisAlignment: 'start',
      mainAxisSize: 'max',
      crossAxisAlignment: 'center',
      verticalDirection: 'down',
      children
    });
    return this.padding === null ? list : new Padding({ padding: this.padding, child: list });
  }
}
