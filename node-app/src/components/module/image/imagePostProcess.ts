export type BackgroundKeyMode = "auto" | "white" | "magenta";

const MAX_POST_PROCESS_PIXELS = 8_500_000;
const YIELD_INTERVAL = 120_000;

async function loadImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_post_process_load_failed"));
    image.src = src;
  });
}

function nextFrame() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function readPixel(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2]] as const;
}

function resolveKeyColor(data: Uint8ClampedArray, width: number, height: number, mode: BackgroundKeyMode) {
  if (mode === "white") return [255, 255, 255] as const;
  if (mode === "magenta") return [255, 0, 255] as const;

  const samples = [
    readPixel(data, width, 0, 0),
    readPixel(data, width, width - 1, 0),
    readPixel(data, width, 0, height - 1),
    readPixel(data, width, width - 1, height - 1),
  ];
  return [0, 1, 2].map((channel) => Math.round(samples.reduce((sum, pixel) => sum + pixel[channel], 0) / samples.length)) as [number, number, number];
}

function isWithinTolerance(
  data: Uint8ClampedArray,
  pixelIndex: number,
  key: readonly [number, number, number],
  tolerance: number,
) {
  const offset = pixelIndex * 4;
  if (data[offset + 3] === 0) return true;
  const red = data[offset] - key[0];
  const green = data[offset + 1] - key[1];
  const blue = data[offset + 2] - key[2];
  return red * red + green * green + blue * blue <= tolerance * tolerance * 3;
}

export async function removeBorderConnectedBackground(args: {
  source: string;
  mode: BackgroundKeyMode;
  tolerance: number;
}) {
  const image = await loadImage(args.source);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const pixelCount = width * height;
  if (pixelCount > MAX_POST_PROCESS_PIXELS) throw new Error("image_post_process_too_large");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("image_post_process_canvas_unavailable");
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const key = resolveKeyColor(data, width, height, args.mode);
  const tolerance = Math.min(160, Math.max(0, Number(args.tolerance) || 0));
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    if (isWithinTolerance(data, index, key, tolerance)) queue[tail++] = index;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  let processedSinceYield = 0;
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const offset = index * 4;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);

    processedSinceYield += 1;
    if (processedSinceYield >= YIELD_INTERVAL) {
      processedSinceYield = 0;
      await nextFrame();
    }
  }

  context.putImageData(imageData, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), width, height, removedPixels: tail, key };
}

export async function clearImageRegion(source: string, region: { x: number; y: number; w: number; h: number }) {
  const image = await loadImage(source);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("image_post_process_canvas_unavailable");
  context.drawImage(image, 0, 0, width, height);
  context.clearRect(region.x, region.y, region.w, region.h);
  return canvas.toDataURL("image/png");
}

export async function pasteImageRegion(args: {
  source: string;
  pastedSource: string;
  region?: { x: number; y: number; w: number; h: number } | null;
}) {
  const [sourceImage, pastedImage] = await Promise.all([loadImage(args.source), loadImage(args.pastedSource)]);
  const width = Math.max(1, sourceImage.naturalWidth || sourceImage.width || 1);
  const height = Math.max(1, sourceImage.naturalHeight || sourceImage.height || 1);
  const pastedWidth = Math.max(1, pastedImage.naturalWidth || pastedImage.width || 1);
  const pastedHeight = Math.max(1, pastedImage.naturalHeight || pastedImage.height || 1);
  const target = args.region || {
    x: Math.max(0, (width - pastedWidth) / 2),
    y: Math.max(0, (height - pastedHeight) / 2),
    w: Math.min(width, pastedWidth),
    h: Math.min(height, pastedHeight),
  };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("image_post_process_canvas_unavailable");
  context.drawImage(sourceImage, 0, 0, width, height);
  context.drawImage(pastedImage, target.x, target.y, target.w, target.h);
  return canvas.toDataURL("image/png");
}
