import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export interface ClipWidgetOptions {
    readonly child?: AnyWidget | null;
}
export interface ClipRRectOptions extends ClipWidgetOptions {
    readonly horizontalRadius?: number;
    readonly verticalRadius?: number;
}
export interface ClipLayoutData {
    readonly childBox: AnyLayoutBox | null;
}
declare abstract class ClipWidget extends Widget<ClipLayoutData> {
    readonly child: AnyWidget | null;
    constructor({ child }?: ClipWidgetOptions);
    protected abstract appendClip(context: RenderContext, box: PositionedBox<ClipLayoutData>): void;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<ClipLayoutData>;
    paint(context: RenderContext, box: PositionedBox<ClipLayoutData>): void;
}
export declare class ClipRect extends ClipWidget {
    protected appendClip(context: RenderContext, box: PositionedBox<ClipLayoutData>): void;
}
export declare class ClipRRect extends ClipWidget {
    readonly horizontalRadius: number;
    readonly verticalRadius: number;
    constructor({ child, horizontalRadius, verticalRadius }?: ClipRRectOptions);
    protected appendClip(context: RenderContext, box: PositionedBox<ClipLayoutData>): void;
}
export declare class ClipOval extends ClipWidget {
    protected appendClip(context: RenderContext, box: PositionedBox<ClipLayoutData>): void;
}
export {};
