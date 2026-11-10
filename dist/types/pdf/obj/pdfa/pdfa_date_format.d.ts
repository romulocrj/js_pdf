/** `yyyyMMddHHmmss`, or `yyyy-MM-ddTHH:mm:ss` with `asIso`, in UTC. */
export declare class PdfaDateFormat {
    format({ dt, asIso }: {
        readonly dt: Date;
        readonly asIso?: boolean;
    }): string;
}
