import type { BasicAlignmentInput } from '../basic.ts';
import { BoxDecoration } from '../decoration.ts';
import type { BoxDecorationInput } from '../decoration.ts';
import type { Axis } from '../flex.ts';
import { Alignment } from '../geometry.ts';
import type { Insets, InsetsInput } from '../geometry.ts';
import type { TextStyle } from '../text_style.ts';
import { StatelessWidget } from '../widget.ts';
import type { AnyWidget, RenderContext } from '../widget.ts';
/** Upstream takes an `AlignmentGeometry`; a raw `[x, y]` pair is accepted too. */
export type LegendPosition = BasicAlignmentInput | readonly [number, number];
export interface ChartLegendOptions {
    readonly textStyle?: TextStyle | null;
    readonly position?: LegendPosition;
    readonly direction?: Axis;
    readonly decoration?: BoxDecorationInput | null;
    readonly padding?: InsetsInput;
}
/** The colour swatches and labels of a chart's data sets. */
export declare class ChartLegend extends StatelessWidget {
    readonly textStyle: TextStyle | null;
    readonly position: Alignment;
    readonly direction: Axis;
    readonly decoration: BoxDecoration | null;
    readonly padding: Insets;
    constructor({ textStyle, position, direction, decoration, padding }?: ChartLegendOptions);
    private buildLegend;
    build(context: RenderContext): AnyWidget;
}
