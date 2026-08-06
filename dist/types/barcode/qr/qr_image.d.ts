import type { QrCode } from './qr_code.ts';
/** The rendered modules of a [QrCode]. */
export declare class QrImage {
    readonly moduleCount: number;
    readonly typeNumber: number;
    readonly errorCorrectLevel: number;
    readonly maskPattern: number;
    private readonly modules;
    private constructor();
    /** Render [qrCode] with whichever of the eight masks scores best. */
    static of(qrCode: QrCode): QrImage;
    /** Render [qrCode] with a specific mask. */
    static withMaskPattern(qrCode: QrCode, maskPattern: number): QrImage;
    isDark(row: number, col: number): boolean;
    private set;
    private get;
    private resetModules;
    private makeImpl;
    private setupPositionProbePattern;
    private setupPositionAdjustPattern;
    private setupTimingPattern;
    private setupTypeInfo;
    private setupTypeNumber;
    private mapData;
}
