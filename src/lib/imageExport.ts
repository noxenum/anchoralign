import type { Affine6, ImageSize } from '@/types';

export function drawAlignedImage(context: CanvasRenderingContext2D, source: CanvasImageSource, matrix: Affine6, size: ImageSize) {
  context.canvas.width = size.width;
  context.canvas.height = size.height;
  context.setTransform(matrix[0], matrix[3], matrix[1], matrix[4], matrix[2], matrix[5]);
  context.drawImage(source, 0, 0);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Inserts a pHYs chunk (pixels per metre) after IHDR so that the exported PNG
// keeps its scale. Canvas-encoded PNGs carry no resolution of their own.
export function withPngResolution(png: Uint8Array, pxPerMm: number): Uint8Array<ArrayBuffer> {
  const ihdrEnd = 8 + 8 + 13 + 4;
  const perMetre = Math.round(pxPerMm * 1000);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, perMetre);
  view.setUint32(12, perMetre);
  view.setUint8(16, 1); // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd));
  out.set(chunk, ihdrEnd);
  out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    // Let the browser start consuming the download before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

// Renders `src` in T1's frame (matrix maps its pixels onto T1) and downloads it
// as PNG with the given scale.
export async function exportAlignedImage(src: string, fileName: string, matrix: Affine6, size: ImageSize, pxPerMm: number) {
  const scan = new Image();
  scan.src = src;
  await scan.decode();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image export is unavailable in this browser.');
  drawAlignedImage(context, scan, matrix, size);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not create the aligned PNG.')), 'image/png');
  });
  const png = withPngResolution(new Uint8Array(await blob.arrayBuffer()), pxPerMm);
  downloadBlob(new Blob([png], { type: 'image/png' }), fileName);
}
