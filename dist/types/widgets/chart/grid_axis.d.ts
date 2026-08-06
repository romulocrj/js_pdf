import type { ColorInput, Rgb } from '../../pdf/color.ts';
import type { Axis } from '../flex.ts';
import type { ConstraintSize } from '../geometry.ts';
import type { TextStyle } from '../text_style.ts';
import type { AnyWidget, RenderContext } from '../widget.ts';
import type { CartesianFrame } from './grid_cartesian.ts';
export type GridAxisFormat = (value: number) => string;
export type GridAxisBuildLabel = (value: number) => AnyWidget;
export interface GridAxisOptions {
    readonly format?: GridAxisFormat | null;
    readonly buildLabel?: GridAxisBuildLabel | null;
    readonly textStyle?: TextStyle | null;
    readonly margin?: number | null;
    readonly marginStart?: number | null;
    readonly marginEnd?: number | null;
    readonly color?: ColorInput | null;
    readonly width?: number | null;
    readonly divisions?: boolean | null;
    readonly divisionsWidth?: number | null;
    readonly divisionsColor?: ColorInput | null;
    readonly divisionsDashed?: boolean | null;
    readonly ticks?: boolean | null;
    readonly axisTick?: boolean | null;
    readonly angle?: number;
}
/** What laying an axis out produced. Upstream keeps these on the axis widget. */
export interface AxisLayout {
    readonly direction: Axis;
    readonly axisPosition: number;
    readonly crossAxisPosition: number;
    readonly marginEnd: number;
    readonly textMargin: number;
    readonly axisTick: boolean;
    /** The axis box: `size.x × axisPosition` lying along the bottom, or the transpose. */
    readonly boxWidth: number;
    readonly boxHeight: number;
}
/** The incoming half of the cartesian grid's two-axis convergence loop. */
export interface AxisPositions {
    readonly axisPosition: number;
    readonly crossAxisPosition: number;
    readonly marginEnd: number;
}
/**
 * One axis of a cartesian grid.
 *
 * `direction` is a mutable field upstream, assigned by `CartesianGrid` before
 * layout. Assigning to the widget would be layout state on `this`, so the port
 * passes it into `layout` and carries it in `AxisLayout` instead.
 */
export declare abstract class GridAxis {
    readonly format: GridAxisFormat;
    readonly buildLabel: GridAxisBuildLabel | null;
    readonly textStyle: TextStyle | null;
    readonly margin: number | null;
    readonly marginStart: number;
    readonly marginEnd: number;
    readonly color: Rgb;
    readonly width: number;
    readonly divisions: boolean;
    readonly divisionsWidth: number;
    readonly divisionsColor: Rgb;
    readonly divisionsDashed: boolean;
    readonly ticks: boolean;
    readonly axisTick: boolean | null;
    readonly angle: number;
    constructor({ format, buildLabel, textStyle, margin, marginStart, marginEnd, color, width, divisions, divisionsWidth, divisionsColor, divisionsDashed, ticks, axisTick, angle }?: GridAxisOptions);
    transfer(input: number): number;
    /** The widget drawn for one value, upstream `_text`. */
    protected label(value: number): AnyWidget;
    /** Upstream `_angleDirection`. */
    protected angleDirection(): number;
    abstract layout(context: RenderContext, direction: Axis, size: ConstraintSize, incoming: AxisPositions): AxisLayout;
    abstract toChart(input: number, layout: AxisLayout): number;
    abstract paintBackground(context: RenderContext, frame: CartesianFrame, layout: AxisLayout): void;
    abstract paint(context: RenderContext, frame: CartesianFrame, layout: AxisLayout): void;
}
export interface FixedAxisOptions extends GridAxisOptions {
}
/** An axis with an explicit, ascending list of values. */
export declare class FixedAxis extends GridAxis {
    readonly values: readonly number[];
    constructor(values: readonly number[], options?: FixedAxisOptions);
    /** Upstream `FixedAxis.fromStrings`: indices as values, labels as format. */
    static fromStrings(values: readonly string[], options?: FixedAxisOptions): FixedAxis;
    private static isSortedAscending;
    layout(context: RenderContext, direction: Axis, size: ConstraintSize, incoming: AxisPositions): AxisLayout;
    toChart(input: number, layout: AxisLayout): number;
    paintBackground(context: RenderContext, frame: CartesianFrame, layout: AxisLayout): void;
    paint(context: RenderContext, frame: CartesianFrame, layout: AxisLayout): void;
    private drawXValues;
    private drawYValues;
}
