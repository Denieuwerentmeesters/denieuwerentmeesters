// heic-convert levert geen eigen types mee; dit is het stukje dat wij
// gebruiken (HEIC/HEIF → JPEG voor de contract-AI).
declare module "heic-convert" {
  function heicConvert(opties: {
    buffer: Buffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }): Promise<Uint8Array>;
  export default heicConvert;
}
