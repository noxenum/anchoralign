// Reads the pixel density stored in image metadata (JPEG EXIF/JFIF, PNG pHYs,
// WebP EXIF) so the px/mm calibration can be pre-filled from the scan itself.

export type ResolutionTag = 'EXIF' | 'JFIF' | 'PNG';

export interface ImageResolution {
  dpiX: number;
  dpiY: number;
  pxPerMm: number;
  tag: ResolutionTag;
  // Exporters often write 72/96 dpi without measuring anything.
  placeholder: boolean;
}

export const MM_PER_INCH = 25.4;
const PLACEHOLDER_DPI = new Set([1, 72, 96]);

export function dpiToPxPerMm(dpi: number): number {
  return dpi / MM_PER_INCH;
}

export function pxPerMmToDpi(pxPerMm: number): number {
  return pxPerMm * MM_PER_INCH;
}

export function readImageResolution(buffer: ArrayBuffer): ImageResolution | null {
  try {
    const view = new DataView(buffer);
    if (view.byteLength >= 2 && view.getUint16(0) === 0xffd8) return readJpeg(view);
    if (view.byteLength >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) return readPng(view);
    if (view.byteLength >= 12 && ascii(view, 0, 4) === 'RIFF' && ascii(view, 8, 4) === 'WEBP') return readWebp(view);
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
  }
  return null;
}

export async function readFileResolution(file: Blob): Promise<ImageResolution | null> {
  try {
    // Resolution metadata sits in the header; 1 MB covers EXIF (max 64 kB) and
    // PNG chunks ahead of the pixel data.
    return readImageResolution(await file.slice(0, 1024 * 1024).arrayBuffer());
  } catch {
    return null;
  }
}

function makeResolution(dpiX: number, dpiY: number, tag: ResolutionTag): ImageResolution | null {
  if (!(Number.isFinite(dpiX) && dpiX > 0 && Number.isFinite(dpiY) && dpiY > 0)) return null;
  return {
    dpiX,
    dpiY,
    pxPerMm: dpiToPxPerMm(dpiX),
    tag,
    placeholder: PLACEHOLDER_DPI.has(Math.round(dpiX * 1000) / 1000),
  };
}

function ascii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

// ---------- JPEG ----------

function readJpeg(view: DataView): ImageResolution | null {
  let jfif: ImageResolution | null = null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { offset += 2; continue; }
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(offset + 2);
    const start = offset + 4;
    const end = offset + 2 + length;
    if (length < 2 || end > view.byteLength) break;
    if (marker === 0xe1 && end - start > 6 && ascii(view, start, 6) === 'Exif\0\0') {
      const exif = readTiffResolution(view, start + 6, end);
      if (exif) return exif;
    } else if (marker === 0xe0 && end - start >= 12 && ascii(view, start, 5) === 'JFIF\0') {
      jfif = readJfifDensity(view, start);
    }
    offset = end;
  }
  return jfif;
}

function readJfifDensity(view: DataView, start: number): ImageResolution | null {
  const units = view.getUint8(start + 7);
  const x = view.getUint16(start + 8);
  const y = view.getUint16(start + 10);
  if (units === 1) return makeResolution(x, y, 'JFIF');
  if (units === 2) return makeResolution(x * 2.54, y * 2.54, 'JFIF');
  return null; // units 0: aspect ratio only
}

// ---------- TIFF / EXIF ----------

const TAG_X_RESOLUTION = 0x011a;
const TAG_Y_RESOLUTION = 0x011b;
const TAG_RESOLUTION_UNIT = 0x0128;
const TYPE_SHORT = 3;
const TYPE_RATIONAL = 5;

function readTiffResolution(view: DataView, tiff: number, end: number): ImageResolution | null {
  const order = ascii(view, tiff, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const le = order === 'II';
  if (view.getUint16(tiff + 2, le) !== 42) return null;
  const ifd = tiff + view.getUint32(tiff + 4, le);
  if (ifd + 2 > end) return null;
  const count = view.getUint16(ifd, le);
  let x = NaN;
  let y = NaN;
  let unit = 2; // TIFF default: inch
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    const tag = view.getUint16(entry, le);
    const type = view.getUint16(entry + 2, le);
    if ((tag === TAG_X_RESOLUTION || tag === TAG_Y_RESOLUTION) && type === TYPE_RATIONAL) {
      const at = tiff + view.getUint32(entry + 8, le);
      if (at + 8 > end) continue;
      const value = view.getUint32(at, le) / view.getUint32(at + 4, le);
      if (tag === TAG_X_RESOLUTION) x = value; else y = value;
    } else if (tag === TAG_RESOLUTION_UNIT && type === TYPE_SHORT) {
      unit = view.getUint16(entry + 8, le);
    }
  }
  if (Number.isNaN(y)) y = x;
  if (unit === 2) return makeResolution(x, y, 'EXIF');
  if (unit === 3) return makeResolution(x * 2.54, y * 2.54, 'EXIF');
  return null; // unit 1: no absolute unit
}

// ---------- PNG ----------

function readPng(view: DataView): ImageResolution | null {
  let offset = 8;
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset);
    const type = ascii(view, offset + 4, 4);
    const data = offset + 8;
    if (type === 'pHYs' && length >= 9) {
      if (view.getUint8(data + 8) !== 1) return null; // unit 0: aspect ratio only
      const perMetre = 0.0254;
      return makeResolution(view.getUint32(data) * perMetre, view.getUint32(data + 4) * perMetre, 'PNG');
    }
    if (type === 'IDAT' || type === 'IEND') break; // pHYs must precede IDAT
    offset = data + length + 4;
  }
  return null;
}

// ---------- WebP ----------

function readWebp(view: DataView): ImageResolution | null {
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const type = ascii(view, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const data = offset + 8;
    const end = Math.min(data + length, view.byteLength);
    if (type === 'EXIF') {
      const tiff = end - data > 6 && ascii(view, data, 6) === 'Exif\0\0' ? data + 6 : data;
      return readTiffResolution(view, tiff, end);
    }
    offset = data + length + (length % 2);
  }
  return null;
}
