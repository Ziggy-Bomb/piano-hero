// Camera photos are ~4000px and several MB; the model's useful ceiling is
// 2576px on the long edge. Decode → single draw onto a right-sized canvas
// (no full-size intermediate) → JPEG base64.

const MAX_LONG_EDGE = 2576;

export interface PreparedImage {
  data: string; // base64 without data: prefix
  mediaType: "image/jpeg";
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const source = await decode(file);
  const srcW = "width" in source ? source.width : 0;
  const srcH = "height" in source ? source.height : 0;
  if (!srcW || !srcH) throw new Error("Could not read that image.");

  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
}
