import sharp from "sharp";

export interface ImageAnalysis {
  width: number;
  height: number;
  aspect: number;
  format: string;
  phash: string;
  avgColor: string;
  brightness: number;
  saturation: number;
  palette: string[];
}

export interface Variants {
  full: Buffer;
  medium: Buffer;
  thumb: Buffer;
  blurData: string;
}

/** 64-bit difference hash, stored as 16 hex chars. */
export async function perceptualHash(bytes: Buffer): Promise<string> {
  const { data } = await sharp(bytes)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      bits += left > right ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Tiny k-means over a 24x24 sample for a real palette from the pixels. */
function extractPalette(raw: Buffer, k = 5): string[] {
  const pixels: [number, number, number][] = [];
  for (let i = 0; i < raw.length; i += 3) pixels.push([raw[i], raw[i + 1], raw[i + 2]]);
  if (!pixels.length) return [];
  const centroids = Array.from({ length: k }, (_, i) => {
    const p = pixels[Math.floor((i + 0.5) * (pixels.length / k))];
    return [...p] as [number, number, number];
  });
  for (let iter = 0; iter < 6; iter++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (p[0] - centroids[c][0]) ** 2 + (p[1] - centroids[c][1]) ** 2 + (p[2] - centroids[c][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      sums[best][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }
  const unique = new Set<string>();
  for (const c of centroids) unique.add(rgbToHex(c[0], c[1], c[2]));
  return [...unique].slice(0, k);
}

export async function analyze(bytes: Buffer): Promise<ImageAnalysis> {
  const img = sharp(bytes, { failOn: "none" });
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const stats = await img.stats();
  const brightness = stats.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3 / 255;
  const [r, g, b] = stats.channels.map((c) => c.mean);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const { data } = await sharp(bytes).resize(24, 24, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const palette = extractPalette(data);
  const one = await sharp(bytes).resize(1, 1, { fit: "cover" }).raw().toBuffer();
  return {
    width,
    height,
    aspect: height ? width / height : 1,
    format: meta.format ?? "unknown",
    phash: await perceptualHash(bytes),
    avgColor: rgbToHex(one[0], one[1], one[2]),
    brightness,
    saturation,
    palette,
  };
}

export async function buildVariants(bytes: Buffer): Promise<Variants> {
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 1400;
  const fullW = Math.min(1600, width);
  const full = await sharp(bytes).rotate().resize({ width: fullW, withoutEnlargement: false }).webp({ quality: 86, effort: 4 }).toBuffer();
  const medium = await sharp(bytes).rotate().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer();
  const thumb = await sharp(bytes).rotate().resize({ width: 512, withoutEnlargement: true }).webp({ quality: 74, effort: 4 }).toBuffer();
  const blurBuf = await sharp(bytes).resize(24, 24, { fit: "inside" }).webp({ quality: 40 }).toBuffer();
  return { full, medium, thumb, blurData: `data:image/webp;base64,${blurBuf.toString("base64")}` };
}
