import type { TextDirection } from './border_radius.ts';
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
