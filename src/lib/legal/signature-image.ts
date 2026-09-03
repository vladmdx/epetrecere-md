import sharp from "sharp";

/** Structural/blank-image validation only. This is not identity verification. */
export async function validSignatureImage(dataUrl: string): Promise<boolean> {
  try {
    const bytes = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return false;
    const image = sharp(bytes, { limitInputPixels: 4_000_000 });
    const meta = await image.metadata();
    if (meta.format !== "png" || !meta.width || !meta.height || meta.width < 40 || meta.height < 20) return false;
    const { data } = await image.flatten({ background: "#ffffff" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    let ink = 0;
    for (const value of data) if (value < 200) ink++;
    return ink >= 50 && ink < data.length * 0.8;
  } catch {
    return false;
  }
}
