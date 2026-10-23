import type { Area } from "./studioApi";
export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  totalWidth: number;
  totalHeight: number;
};
export type Crops = {
  bounds: Bounds;
  images: { artwork: string; ui: string; difference: string };
  mean: number;
};
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}
function context(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d");
  if (!ctx) throw Error("Canvas rendering is unavailable.");
  return ctx;
}
export async function loadImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  if (!image.naturalWidth) throw Error("The comparison image could not load.");
  return image;
}
export function validArea(area: Area) {
  return ["x", "y", "width", "height"].every((k) =>
    Number.isFinite(area[k as keyof Area])
  ) && area.x >= 0 && area.y >= 0 && area.width > 0 && area.height > 0 &&
    area.x + area.width <= 1.000001 && area.y + area.height <= 1.000001;
}
/** Promoted from the approved Relay comparison-engine.js at e3dbd97d94.
 * Both images share the rendered image's width grid; the tallest scaled image
 * determines height, preserving height mismatches rather than stretching them.
 */
export function createCrops(
  art: HTMLImageElement,
  ui: HTMLImageElement,
  area: Area,
): Crops {
  if (!validArea(area)) throw Error("Select an area inside the comparison.");
  const totalWidth = ui.naturalWidth,
    totalHeight = Math.round(
      totalWidth *
        Math.max(
          art.naturalHeight / art.naturalWidth,
          ui.naturalHeight / ui.naturalWidth,
        ),
    );
  const x = Math.max(0, Math.floor(area.x * totalWidth)),
    y = Math.max(0, Math.floor(area.y * totalHeight));
  const width = Math.min(totalWidth - x, Math.ceil(area.width * totalWidth)),
    height = Math.min(totalHeight - y, Math.ceil(area.height * totalHeight));
  if (width < 4 || height < 4) {
    throw Error("Select at least 4 × 4 comparison pixels.");
  }
  if (width * height > 20_000_000) {
    throw Error("Select a smaller area to create comparison images.");
  }
  const pair = [art, ui].map((image) => {
    const c = canvas(width, height), ctx = context(c);
    ctx.fillStyle = "#F7F2E9";
    ctx.fillRect(0, 0, width, height);
    const scale = totalWidth / image.naturalWidth;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      -x,
      -y,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );
    return c;
  });
  const pa = context(pair[0]).getImageData(0, 0, width, height).data,
    pb = context(pair[1]).getImageData(0, 0, width, height).data,
    diff = canvas(width, height),
    ctx = context(diff),
    pixels = ctx.createImageData(width, height);
  let sum = 0;
  for (let i = 0; i < pa.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const delta = Math.abs(pa[i + k] - pb[i + k]);
      sum += delta;
      pixels.data[i + k] = Math.min(255, delta * 3);
    }
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return {
    bounds: { x, y, width, height, totalWidth, totalHeight },
    images: {
      artwork: pair[0].toDataURL("image/png"),
      ui: pair[1].toDataURL("image/png"),
      difference: diff.toDataURL("image/png"),
    },
    mean: sum / (width * height * 3),
  };
}
