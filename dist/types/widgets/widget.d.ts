import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PageSize } from '../pdf/page_format.ts';
import type { Document } from './document.ts';
/** The context before a page exists: everything a section needs to render. */
export interface DocumentContext {
    readonly document: Document;
}
/** The context threaded through `layout` and `paint`. */
export interface RenderContext extends DocumentContext {
    readonly canvas: PdfCanvas;
    readonly pageFormat: PageSize;
    readonly pageNumber: number;
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
