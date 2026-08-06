import { BarcodeHM } from './barcode_hm.ts';
import type { BarcodeHMBar } from './barcode_hm.ts';
/**
 * POSTNET barcode.
 *
 * The Postal Numeric Encoding Technique, used by the United States Postal
 * Service to route mail.
 */
export declare class BarcodePostnet extends BarcodeHM {
    constructor();
    get charSet(): Iterable<number>;
    get name(): string;
    convertHM(data: string): BarcodeHMBar[];
}
