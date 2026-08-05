import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PageSize } from '../pdf/page_format.ts';
import type { Document } from './document.ts';
import type { ThemeData } from './theme.ts';
/** The context before a page exists: everything a section needs to render. */
export interface DocumentContext {
    readonly document: Document;
}
/**
 * The context threaded through `layout` and `paint`.
 *
 * `theme` is the port's stand-in for upstream's inherited values: a widget that
 * scopes something for its subtree hands the child a context with that field
 * replaced, instead of registering an `InheritedWidget` the child looks up. See
 * `theme.ts`.
 */
export interface RenderContext extends DocumentContext {
    readonly canvas: PdfCanvas;
    readonly pageFormat: PageSize;
    readonly pageNumber: number;
    readonly theme: ThemeData;
}
export interface Constraints {
    readonly maxWidth: number;
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
export declare abstract class Widget<TData = unknown> {
    abstract layout(context: RenderContext, constraints: Constraints): LayoutBox<TData>;
    abstract paint(context: RenderContext, box: PositionedBox<TData>): void;
}
/** What a `StatelessWidget` hands from `layout` to `paint`: the built subtree. */
export interface StatelessLayoutData {
    readonly childBox: AnyLayoutBox;
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
 * PORT GAP: upstream mixes in `SpanningWidget` so a stateless widget can split
 * across pages. Spanning is phase 3.2.
 */
export declare abstract class StatelessWidget extends Widget<StatelessLayoutData> {
    abstract build(context: RenderContext): AnyWidget;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<StatelessLayoutData>;
    paint(context: RenderContext, box: PositionedBox<StatelessLayoutData>): void;
}
