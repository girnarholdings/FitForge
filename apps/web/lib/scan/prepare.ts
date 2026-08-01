'use client';

/**
 * CLIENT-SIDE PHOTO PREP for the body scan (docs/AIMODE-CONTRACT.md "Web scan client",
 * docs/RESEARCH-VISION.md §C).
 *
 * The client does the downscaling because the worker cannot: Workers have no Canvas/Image APIs,
 * and 4 raw phone photos are ~25 MB where 4 prepped ones are ~1 MB — the user's uplink is the
 * slowest link in the whole feature. 1024 px on the long edge is deliberate: body-composition
 * cues are coarse silhouette features, and pixels past that are tokens spent for no bucket-level
 * accuracy.
 *
 * THE RE-ENCODE IS A PRIVACY FEATURE, not an optimization. A canvas re-encode writes a fresh
 * JPEG with no EXIF at all — GPS coordinates, capture timestamp, device serial all gone before
 * the photo leaves the phone. The privacy copy on the photos screen claims exactly this, so this
 * module is where that claim is made true.
 */

/** Long-edge cap in px (§C1: ≈1,000 vision tokens/photo; the API downscales past 1540 anyway). */
export const SCAN_LONG_EDGE_PX = 1024;
/** JPEG quality — visually clean for photographic content; lower starts eating muscle-separation cues. */
export const SCAN_JPEG_QUALITY = 0.82;

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

/**
 * Decode via `createImageBitmap` with the EXIF rotation BAKED INTO THE PIXELS.
 *
 * `imageOrientation: 'from-image'` is passed explicitly because the default has flip-flopped
 * across browser versions — and whether the vision API applies EXIF rotation server-side is
 * undocumented, so a sideways body photo must be impossible by construction, not by luck.
 * Pre-15.4 Safari throws on the options bag, which is what the `<img>` fallback is for.
 */
async function decodeViaBitmap(file: File): Promise<DecodedImage> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return {
    source: bmp,
    width: bmp.width,
    height: bmp.height,
    cleanup: () => bmp.close(),
  };
}

/**
 * Older-Safari fallback: an `<img>` decode also honours EXIF (CSS `image-orientation:
 * from-image` has been the default since Safari 13.1 / Chrome 81 / Firefox 77).
 */
async function decodeViaImgTag(file: File): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      // The element is never attached; revoking the object URL releases the decode.
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * File → downscaled, EXIF-stripped `data:image/jpeg;base64,…` URI ready for the worker.
 *
 * Throws on an undecodable file (e.g. HEIC outside Safari) — the caller turns that into the
 * "that format didn't open" retake message. Everything downstream of a successful decode is
 * plain canvas work and cannot fail on well-formed input.
 */
export async function prepareScanImage(file: File): Promise<string> {
  let decoded: DecodedImage;
  try {
    decoded = await decodeViaBitmap(file);
  } catch {
    decoded = await decodeViaImgTag(file);
  }

  try {
    const { width, height } = decoded;
    if (!width || !height) throw new Error('image decoded to zero size');
    const scale = Math.min(1, SCAN_LONG_EDGE_PX / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    // toDataURL rather than toBlob+FileReader: the worker wants base64-in-JSON anyway (§C3), so
    // producing the data URI directly skips a re-encode round trip.
    return canvas.toDataURL('image/jpeg', SCAN_JPEG_QUALITY);
  } finally {
    decoded.cleanup();
  }
}
