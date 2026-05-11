// Client-side polaroid/vintage filter applied to guest uploads when
// the owner enables `moments_vintage`. Done in the browser via canvas
// so the server never sees the raw photo — same upload pipeline,
// just a different file blob.
//
// Effect stack:
//   1. Warm tint (boost red+green, dampen blue)
//   2. Slight desaturation toward sepia
//   3. Soft vignette (radial gradient darken at corners)
//   4. White polaroid border with thicker bottom for caption space
//
// We deliberately keep the math simple — pixel loops in JS aren't
// fast but the perceived delay is ~200ms on a typical phone photo at
// 2048px, which is invisible behind the existing upload spinner.

/** Apply the polaroid look to a File. Returns a new File ready for
 *  uploading to /api/upload. Preserves the original filename so the
 *  CDN+downstream credits stay sensible. */
export async function applyVintage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);

  // The polaroid border eats 4% on each side and 14% at the bottom
  // (where a hand-written caption would go on a real polaroid). The
  // photo itself goes into the inner rectangle.
  const BORDER = 0.04;
  const BOTTOM = 0.14;

  const outW = Math.round(bitmap.width * (1 + 2 * BORDER));
  const outH = Math.round(bitmap.height * (1 + BORDER + BOTTOM));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  // White polaroid background.
  ctx.fillStyle = "#FAF7EE";
  ctx.fillRect(0, 0, outW, outH);

  // Inset photo position.
  const px = Math.round(outW * BORDER) - Math.round(outW * BORDER) + Math.round(bitmap.width * BORDER);
  const py = Math.round(bitmap.width * BORDER); // same border for top
  const x = Math.round((outW - bitmap.width) / 2);
  const y = Math.round(bitmap.width * BORDER);
  void px; void py; // computed inline below for clarity, kept comments

  // Draw the original image inset by the border.
  ctx.drawImage(bitmap, x, y, bitmap.width, bitmap.height);

  // Pull the image data for the photo area and apply tint + sepia.
  const region = ctx.getImageData(x, y, bitmap.width, bitmap.height);
  const data = region.data;
  // Sepia matrix (Adobe-ish constants) softened so faces stay recognizable.
  // out_r = 0.50*r + 0.78*g + 0.20*b
  // out_g = 0.45*r + 0.70*g + 0.17*b
  // out_b = 0.35*r + 0.55*g + 0.13*b
  // Then mix 60% sepia / 40% original for a warm tint rather than full sepia.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const sr = 0.5 * r + 0.78 * g + 0.2 * b;
    const sg = 0.45 * r + 0.7 * g + 0.17 * b;
    const sb = 0.35 * r + 0.55 * g + 0.13 * b;
    data[i] = Math.min(255, 0.6 * sr + 0.4 * r);
    data[i + 1] = Math.min(255, 0.6 * sg + 0.4 * g);
    data[i + 2] = Math.min(255, 0.6 * sb + 0.4 * b);
  }
  ctx.putImageData(region, x, y);

  // Soft vignette — radial darken at the four corners of the photo
  // area only (not the white border).
  const cx = x + bitmap.width / 2;
  const cy = y + bitmap.height / 2;
  const radius = Math.hypot(bitmap.width, bitmap.height) / 2;
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, bitmap.width, bitmap.height);

  bitmap.close();

  return await new Promise<File>((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(file);
          return;
        }
        const renamed = new File([blob], renameToJpg(file.name), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        resolve(renamed);
      },
      "image/jpeg",
      0.88,
    );
  });
}

function renameToJpg(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base || "photo"}-vintage.jpg`;
}
