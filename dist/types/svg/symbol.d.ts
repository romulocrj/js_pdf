import type { SvgBrush } from './brush.ts';
import { SvgGroup } from './group.ts';
import type { SvgPainter } from './painter.ts';
import type { XmlElement } from './xml.ts';
export declare class SvgSymbol extends SvgGroup {
    static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgSymbol;
}
