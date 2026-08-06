import { BarcodeHM } from './barcode_hm.ts';
import type { BarcodeHMBar } from './barcode_hm.ts';
/**
 * RM4SCC barcode.
 *
 * The Royal Mail Cleanmail symbology: UK postcodes and delivery point
 * suffixes, read at sorting-machine speed.
 */
export declare class BarcodeRm4scc extends BarcodeHM {
    get charSet(): Iterable<number>;
    get name(): string;
    convertHM(data: string): BarcodeHMBar[];
}
