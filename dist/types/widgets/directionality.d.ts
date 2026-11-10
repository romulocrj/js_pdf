import type { TextDirection } from './border_radius.ts';
import type { Alignment, AlignmentGeometry, Insets, InsetsGeometry } from './geometry.ts';
import { Inherited, StatelessWidget } from './widget.ts';
import type { AnyWidget, RenderContext } from './widget.ts';
export declare class InheritedDirectionality extends Inherited {
    readonly textDirection: TextDirection;
    constructor(textDirection: TextDirection);
}
export interface DirectionalityOptions {
    readonly textDirection: TextDirection;
    readonly child: AnyWidget;
}
/** Supplies the text direction used by direction-sensitive descendants. */
export declare class Directionality extends StatelessWidget {
    readonly textDirection: TextDirection;
    readonly child: AnyWidget;
    constructor({ textDirection, child }: DirectionalityOptions);
    static of(context: RenderContext): TextDirection;
    build(_context: RenderContext): AnyWidget;
}
/** Upstream's `padding.resolve(Directionality.of(context))`. */
export declare function insetsIn(context: RenderContext, value: InsetsGeometry): Insets;
/** Upstream's `alignment.resolve(Directionality.of(context))`. */
export declare function alignmentIn(context: RenderContext, value: AlignmentGeometry): Alignment;
