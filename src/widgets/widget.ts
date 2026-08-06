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
 *   - pdf/lib/src/widgets/widget.dart
 *   - pdf/lib/src/widgets/multi_page.dart
 */

import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PageSize } from '../pdf/page_format.ts';
import type { Document } from './document.ts';
import { BoxConstraints } from './geometry.ts';
import type { ThemeData } from './theme.ts';

/** The context before a page exists: everything a section needs to render. */
export interface DocumentContext {
  readonly document: Document;
  /** Number of physical pages emitted before the current section. */
  readonly pageOffset: number;
  /** Total physical pages, or zero while the first layout pass is running. */
  readonly pagesCount: number;
}

/**
 * The context threaded through `layout` and `paint`.
 *
 * Frequently read theme data keeps its direct field, while general inherited
 * values use an immutable constructor-keyed map. A scoping widget hands its
 * child a copied context; no layout state is retained on the widget instance.
 */
export interface RenderContext extends DocumentContext {
  readonly canvas: PdfCanvas;
  readonly pageFormat: PageSize;
  readonly pageNumber: number;
  /** Viewer page label for this physical page. */
  readonly pageLabel: string;
  readonly pagesCount: number;
  readonly theme: ThemeData;
  /** Values scoped by `InheritedWidget`, keyed by their concrete constructor. */
  readonly inherited?: ReadonlyMap<Function, Inherited>;
  /** Text direction scoped by `Directionality`; individual text may override it. */
  readonly textDirection?: 'ltr' | 'rtl';
}

export interface Constraints {
  readonly minWidth?: number;
  readonly maxWidth: number;
  readonly minHeight?: number;
  readonly maxHeight: number;
}

/**
 * What `layout()` measured. `data` is the widget's private hand-off from
 * measure to paint — wrapped lines, child boxes, a scale factor.
 */
export interface LayoutBox<TData = unknown> {
  readonly widget: Widget<TData>;
  readonly width: number;
  readonly height: number;
  readonly data: TData;
}

/** A `LayoutBox` the parent has placed. `x`/`y` are top-left. */
export type PositionedBox<TData = unknown> = LayoutBox<TData> & {
  readonly x: number;
  readonly y: number;
};

/**
 * A widget of unspecified data type, for heterogeneous child lists.
 *
 * This is sound rather than an escape hatch: `paint` is declared with method
 * syntax, so TypeScript relates it bivariantly and a `Widget<TextLayoutData>`
 * is assignable here without an `any` anywhere in the public types.
 */
export type AnyWidget = Widget<unknown>;
export type AnyLayoutBox = LayoutBox<unknown>;

/**
 * Base class of the layout tree.
 *
 * The port differs from upstream in one structural way: `layout()` is pure and
 * *returns* a box instead of mutating `widget.box`. The parent then calls
 * `paint(context, box)` with the box it chose to place the child at. That keeps
 * widgets reusable across pages, which `MultiPage` relies on when it re-lays a
 * child after a page break.
 *
 * A widget must never cache layout state on `this` — put it in `data`. The
 * `TData` parameter is what makes that hand-off type-safe: the box `layout()`
 * returns is the box `paint()` receives.
 */
export abstract class Widget<TData = unknown> {
  abstract layout(context: RenderContext, constraints: Constraints): LayoutBox<TData>;

  abstract paint(context: RenderContext, box: PositionedBox<TData>): void;
}

/** Marker base for values supplied to a subtree through `InheritedWidget`. */
export class Inherited {}

/** One page-sized fragment and the immutable state needed for the next one. */
export interface SpanLayout<TData, TState> {
  readonly box: LayoutBox<TData>;
  readonly nextState: TState;
  readonly hasMore: boolean;
}

/**
 * A widget that can return successive page-sized layout fragments.
 *
 * Upstream saves and restores a mutable `WidgetContext` held by the widget.
 * That would violate this port's pure layout protocol, so continuation state is
 * an explicit immutable value: the caller supplies one snapshot and receives
 * the next alongside the box it applies to.
 */
export abstract class SpanningWidget<TData = unknown, TState = unknown> extends Widget<TData> {
  get canSpan(): boolean {
    return true;
  }

  abstract initialSpanState(): TState;

  abstract layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: TState
  ): SpanLayout<TData, TState>;
}

/** What a `StatelessWidget` hands from `layout` to `paint`: the built subtree. */
export interface StatelessLayoutData {
  readonly childBox: AnyLayoutBox;
}

export interface StatelessState {
  readonly child: AnyWidget | null;
  readonly childState: unknown;
  readonly done: boolean;
}

/**
 * A widget defined by composition: `build()` returns the subtree that does the
 * real work, and layout and paint delegate to it.
 *
 * `build()` runs during `layout()`, and the widget it returns is carried to
 * `paint()` in `data` rather than stored on `this` — the layout protocol forbids
 * cached state, and `MultiPage` re-lays the same instance after a page break.
 * Upstream can keep the built child in a field because it re-builds on every
 * layout pass; here the pure protocol makes the hand-off explicit.
 *
 */
export abstract class StatelessWidget extends SpanningWidget<StatelessLayoutData, StatelessState> {
  abstract build(context: RenderContext): AnyWidget;

  override initialSpanState(): StatelessState {
    return { child: null, childState: null, done: false };
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: StatelessState
  ): SpanLayout<StatelessLayoutData, StatelessState> {
    const child = state.child ?? this.build(context);
    if (child instanceof SpanningWidget && child.canSpan) {
      const childState = state.child === null
        ? child.initialSpanState()
        : state.childState;
      const fragment = child.layoutSpan(context, constraints, childState);
      return {
        box: {
          widget: this,
          width: fragment.box.width,
          height: fragment.box.height,
          data: { childBox: fragment.box }
        },
        nextState: {
          child,
          childState: fragment.nextState,
          done: !fragment.hasMore
        },
        hasMore: fragment.hasMore
      };
    }

    const parent = BoxConstraints.from(constraints);
    const childBox = child.layout(context, parent.copyWith({
      minHeight: 0,
      maxHeight: Infinity
    }));
    if (childBox.height > parent.maxHeight + 0.001) {
      return {
        box: {
          widget: this,
          width: parent.constrainWidth(childBox.width),
          height: 0,
          data: { childBox: { ...childBox, height: 0 } }
        },
        nextState: { child, childState: null, done: false },
        hasMore: true
      };
    }
    return {
      box: {
        widget: this,
        width: childBox.width,
        height: childBox.height,
        data: { childBox }
      },
      nextState: { child, childState: null, done: true },
      hasMore: false
    };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<StatelessLayoutData> {
    const childBox = this.build(context).layout(context, constraints);

    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<StatelessLayoutData>): void {
    const { childBox } = box.data;
    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

export interface InheritedWidgetOptions {
  readonly build: (context: RenderContext) => AnyWidget;
  readonly inherited?: Inherited | null;
}

export interface InheritedWidgetLayoutData {
  readonly childBox: AnyLayoutBox;
  readonly child: AnyWidget;
}

export interface InheritedWidgetState {
  readonly child: AnyWidget | null;
  readonly childState: unknown;
}

/** Builds a subtree with one additional inherited context value. */
export class InheritedWidget extends SpanningWidget<InheritedWidgetLayoutData, InheritedWidgetState> {
  readonly builder: (context: RenderContext) => AnyWidget;
  readonly inheritedValue: Inherited | null;

  constructor({ build, inherited = null }: InheritedWidgetOptions) {
    super();
    if (typeof build !== 'function') throw new TypeError('InheritedWidget.build must be a function');
    this.builder = build;
    this.inheritedValue = inherited;
  }

  static of<T extends Inherited>(
    context: RenderContext,
    type: abstract new (...args: never[]) => T
  ): T | null {
    return (context.inherited?.get(type) as T | undefined) ?? null;
  }

  private scope(context: RenderContext): RenderContext {
    if (this.inheritedValue === null) return context;
    const inherited = new Map(context.inherited ?? []);
    inherited.set(this.inheritedValue.constructor, this.inheritedValue);
    return { ...context, inherited };
  }

  override initialSpanState(): InheritedWidgetState {
    return { child: null, childState: null };
  }

  override layout(
    context: RenderContext,
    constraints: Constraints
  ): LayoutBox<InheritedWidgetLayoutData> {
    const scoped = this.scope(context);
    const child = this.builder(scoped);
    const childBox = child.layout(scoped, constraints);
    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: { childBox, child }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<InheritedWidgetLayoutData>): void {
    const scoped = this.scope(context);
    box.data.child.paint(scoped, { ...box.data.childBox, x: box.x, y: box.y });
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: InheritedWidgetState
  ): SpanLayout<InheritedWidgetLayoutData, InheritedWidgetState> {
    const scoped = this.scope(context);
    const child = state.child ?? this.builder(scoped);
    if (child instanceof SpanningWidget && child.canSpan) {
      const childState = state.child === null ? child.initialSpanState() : state.childState;
      const fragment = child.layoutSpan(scoped, constraints, childState);
      return {
        box: {
          widget: this,
          width: fragment.box.width,
          height: fragment.box.height,
          data: { childBox: fragment.box, child }
        },
        nextState: { child, childState: fragment.nextState },
        hasMore: fragment.hasMore
      };
    }
    const parent = BoxConstraints.from(constraints);
    const childBox = child.layout(scoped, parent.copyWith({ minHeight: 0, maxHeight: Infinity }));
    if (childBox.height > parent.maxHeight + 0.001) {
      return {
        box: {
          widget: this,
          width: parent.constrainWidth(childBox.width),
          height: 0,
          data: { childBox: { ...childBox, height: 0 }, child }
        },
        nextState: { child, childState: null },
        hasMore: true
      };
    }
    return {
      box: {
        widget: this,
        width: childBox.width,
        height: childBox.height,
        data: { childBox, child }
      },
      nextState: { child, childState: null },
      hasMore: false
    };
  }
}

export interface DelayedWidgetOptions {
  readonly build: (context: RenderContext) => AnyWidget;
}

export interface DelayedWidgetLayoutData extends StatelessLayoutData {
  readonly childState: unknown;
  readonly spanning: boolean;
}

export interface DelayedWidgetState {
  readonly child: AnyWidget | null;
  readonly childState: unknown;
}

/** Rebuilds its child immediately before paint using the final page context. */
export class DelayedWidget extends SpanningWidget<DelayedWidgetLayoutData, DelayedWidgetState> {
  readonly builder: (context: RenderContext) => AnyWidget;

  constructor({ build }: DelayedWidgetOptions) {
    super();
    if (typeof build !== 'function') throw new TypeError('DelayedWidget.build must be a function');
    this.builder = build;
  }

  override initialSpanState(): DelayedWidgetState {
    return { child: null, childState: null };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<DelayedWidgetLayoutData> {
    const childBox = this.builder(context).layout(context, constraints);
    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: { childBox, childState: null, spanning: false }
    };
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: DelayedWidgetState
  ): SpanLayout<DelayedWidgetLayoutData, DelayedWidgetState> {
    const child = state.child ?? this.builder(context);
    if (child instanceof SpanningWidget && child.canSpan) {
      const childState = state.child === null ? child.initialSpanState() : state.childState;
      const fragment = child.layoutSpan(context, constraints, childState);
      return {
        box: {
          widget: this,
          width: fragment.box.width,
          height: fragment.box.height,
          data: { childBox: fragment.box, childState, spanning: true }
        },
        nextState: { child, childState: fragment.nextState },
        hasMore: fragment.hasMore
      };
    }
    const parent = BoxConstraints.from(constraints);
    const childBox = child.layout(context, parent.copyWith({ minHeight: 0, maxHeight: Infinity }));
    if (childBox.height > parent.maxHeight + 0.001) {
      return {
        box: {
          widget: this,
          width: parent.constrainWidth(childBox.width),
          height: 0,
          data: { childBox: { ...childBox, height: 0 }, childState: null, spanning: false }
        },
        nextState: { child, childState: null },
        hasMore: true
      };
    }
    return {
      box: {
        widget: this,
        width: childBox.width,
        height: childBox.height,
        data: { childBox, childState: null, spanning: false }
      },
      nextState: { child, childState: null },
      hasMore: false
    };
  }

  override paint(context: RenderContext, box: PositionedBox<DelayedWidgetLayoutData>): void {
    const child = this.builder(context);
    const childBox = box.data.spanning && child instanceof SpanningWidget && child.canSpan
      ? child.layoutSpan(context, new BoxConstraints({
        maxWidth: box.width,
        maxHeight: box.height
      }), box.data.childState).box
      : child.layout(context, BoxConstraints.tight({ width: box.width, height: box.height }));
    child.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

export interface InseparableOptions {
  readonly child: AnyWidget;
  readonly canSpan?: boolean;
}

export interface InseparableState {
  readonly childState: unknown;
}

/** Keeps its child on one page unless `canSpan` explicitly delegates continuation. */
export class Inseparable extends SpanningWidget<StatelessLayoutData, InseparableState> {
  readonly child: AnyWidget;
  readonly allowSpan: boolean;

  constructor({ child, canSpan = false }: InseparableOptions) {
    super();
    this.child = child;
    this.allowSpan = Boolean(canSpan);
  }

  override get canSpan(): boolean {
    return this.allowSpan && this.child instanceof SpanningWidget && this.child.canSpan;
  }

  override initialSpanState(): InseparableState {
    return {
      childState: this.child instanceof SpanningWidget
        ? this.child.initialSpanState()
        : null
    };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<StatelessLayoutData> {
    const childBox = this.child.layout(context, constraints);
    return { widget: this, width: childBox.width, height: childBox.height, data: { childBox } };
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: InseparableState
  ): SpanLayout<StatelessLayoutData, InseparableState> {
    if (!(this.child instanceof SpanningWidget) || !this.canSpan) {
      return { box: this.layout(context, constraints), nextState: state, hasMore: false };
    }
    const fragment = this.child.layoutSpan(context, constraints, state.childState);
    return {
      box: {
        widget: this,
        width: fragment.box.width,
        height: fragment.box.height,
        data: { childBox: fragment.box }
      },
      nextState: { childState: fragment.nextState },
      hasMore: fragment.hasMore
    };
  }

  override paint(context: RenderContext, box: PositionedBox<StatelessLayoutData>): void {
    const { childBox } = box.data;
    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}
