import type { PdfImage } from '../pdf/obj/image.ts';
import { resolveBasicAlignment } from './basic.ts';
import type { BasicAlignmentInput, FitSize } from './basic.ts';
import type { BoxFit } from './svg.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
import type { ImageProvider } from './image_provider.ts';
export interface ImageOptions {
    readonly fit?: BoxFit;
    readonly alignment?: BasicAlignmentInput;
    readonly width?: number | null;
    readonly height?: number | null;
    readonly dpi?: number | null;
}
export interface ImageLayoutData {
    readonly image: PdfImage;
    readonly source: FitSize;
    readonly destination: FitSize;
    readonly sourceX: number;
    readonly sourceY: number;
    readonly destinationX: number;
    readonly destinationY: number;
}
export declare class Image extends Widget<ImageLayoutData> {
    readonly image: ImageProvider;
    readonly fit: BoxFit;
    readonly alignment: ReturnType<typeof resolveBasicAlignment>;
    readonly width: number | null;
    readonly height: number | null;
    readonly dpi: number | null;
    constructor(image: ImageProvider, { fit, alignment, width, height, dpi }?: ImageOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<ImageLayoutData>;
    paint(context: RenderContext, box: PositionedBox<ImageLayoutData>): void;
}
