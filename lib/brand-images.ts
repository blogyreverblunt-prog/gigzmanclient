import sharp, { type Metadata as SharpMetadata, type Sharp } from "sharp";

/**
 * Turning whatever the client sent into assets the template can actually use.
 *
 * The requirement this exists for is "whatever logo comes in should fit
 * perfectly at the desired location". In practice the files that arrive are a
 * wordmark with 400px of transparent margin, a square icon, a 3000px scan, or a
 * JPEG with a white background — and the header gives all of them the same
 * fixed-height slot. Scaling to fit that slot without trimming first makes a
 * padded logo render at half the size of an unpadded one, which is the visible
 * symptom of the problem.
 *
 * So: trim, fit to a known box, and emit at a known size. The header then only
 * has to place it.
 */

export const ACCEPTED_LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * Height the normalised logo is rendered at — 2× the ~72px the header slot uses
 * so it stays sharp on a retina display, and the largest of the three uses
 * (header, footer, share card) so none of them ever upscales.
 */
const LOGO_HEIGHT = 144;

/**
 * Below this, a trimmed logo is being asked to carry detail it does not have.
 * A 40px-tall source stretched to 144px is a blurred smear in the header, and
 * it is better to refuse it and ask for a bigger file than to publish it.
 */
const MIN_SOURCE_HEIGHT = 48;
const MIN_SOURCE_WIDTH = 48;

export interface NormalisedLogo {
  png: Buffer;
  webp: Buffer;
  width: number;
  height: number;
  /** Source dimensions after trimming, for the operator-facing message. */
  sourceWidth: number;
  sourceHeight: number;
}

export class ImageRejected extends Error {}

/**
 * Trim, fit and re-encode a logo.
 *
 * SVG is rasterised rather than passed through. `next.config.ts` allows SVG
 * through `next/image` only for locally-authored partner marks, sandboxed and
 * script-free; an SVG that arrived from outside is untrusted markup that can
 * carry script and external references, and serving it from our own origin
 * would be the one case that comment excludes. Rasterising it here removes the
 * question entirely — `sharp` renders it and what comes out is pixels.
 */
export async function normaliseLogo(input: Buffer): Promise<NormalisedLogo> {
  // `density` only affects vector input; it makes the rasterised SVG sharp
  // enough that fitting it to LOGO_HEIGHT is a downscale rather than a blur.
  const source = sharp(input, { density: 384, failOn: "error" });

  let meta: SharpMetadata;
  try {
    meta = await source.metadata();
  } catch {
    throw new ImageRejected("That file could not be read as an image.");
  }
  if (!meta.width || !meta.height) {
    throw new ImageRejected("That file could not be read as an image.");
  }

  // `trim` removes uniform border — transparent padding, or the flat white
  // frame a JPEG logo usually arrives inside. Without it, padding decides the
  // rendered size and two clients' logos in the same slot look unrelated.
  //
  // It throws when the image is entirely one colour, which is a blank upload
  // rather than a logo, so that is reported as such.
  let trimmed: Sharp;
  let trimmedMeta: { width: number; height: number };
  try {
    const buffer = await source.clone().trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
    trimmed = sharp(buffer.data);
    trimmedMeta = { width: buffer.info.width, height: buffer.info.height };
  } catch {
    throw new ImageRejected("That image looks blank — there was nothing to trim down to.");
  }

  if (trimmedMeta.height < MIN_SOURCE_HEIGHT || trimmedMeta.width < MIN_SOURCE_WIDTH) {
    throw new ImageRejected(
      `Once the empty space is trimmed, that logo is only ${trimmedMeta.width}×${trimmedMeta.height} pixels. ` +
        `It would look blurred in the site header. Please supply one at least ${MIN_SOURCE_WIDTH}×${MIN_SOURCE_HEIGHT}.`,
    );
  }

  // Height-constrained, width free: a wordmark and a square badge should sit on
  // the same baseline and occupy the same vertical space, which is what the
  // header actually reserves. `fit: "inside"` with a very wide width bound means
  // height is the only real constraint. `withoutEnlargement` keeps a small
  // source at its own size rather than upscaling it into mush.
  const resized = trimmed.resize({
    height: LOGO_HEIGHT,
    width: LOGO_HEIGHT * 8,
    fit: "inside",
    withoutEnlargement: true,
  });

  const [png, webp] = await Promise.all([
    resized.clone().png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true }),
    resized.clone().webp({ quality: 90 }).toBuffer(),
  ]);

  return {
    png: png.data,
    webp,
    width: png.info.width,
    height: png.info.height,
    sourceWidth: trimmedMeta.width,
    sourceHeight: trimmedMeta.height,
  };
}

export const ICON_SIZES = [32, 180, 192, 512] as const;

/**
 * The favicon set, from the same source image as the logo.
 *
 * Square, padded and centred rather than cropped: a wordmark cropped to a
 * square is an illegible fragment of a word. Padding it keeps the whole mark
 * visible and small, which is what every other site's 32px favicon does too.
 *
 * Flattened onto white for every size. A transparent favicon disappears against
 * a dark browser chrome, and the tab strip is the one place we cannot control
 * the background.
 */
export async function buildIconSet(input: Buffer): Promise<Record<number, Buffer>> {
  const trimmed = await sharp(input, { density: 384, failOn: "error" })
    .trim({ threshold: 12 })
    .toBuffer()
    .catch(() => input);

  const out: Record<number, Buffer> = {};
  for (const size of ICON_SIZES) {
    out[size] = await sharp(trimmed)
      .resize({
        width: Math.round(size * 0.82),
        height: Math.round(size * 0.82),
        fit: "inside",
        withoutEnlargement: false,
      })
      .extend({
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .resize({
        width: size,
        height: size,
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
  }
  return out;
}

/**
 * The social share image, from the logo.
 *
 * 1200×630 is the size every platform crops toward. The logo is placed on a
 * light ground rather than composited over the shared photograph: the
 * photograph belongs to the template, not to any client, and putting one
 * client's mark on it would imply the picture is theirs.
 */
export async function buildOgImage(input: Buffer): Promise<Buffer> {
  const logo = await sharp(input, { density: 384, failOn: "error" })
    .trim({ threshold: 12 })
    .resize({ width: 760, height: 330, fit: "inside", withoutEnlargement: true })
    .toBuffer()
    .catch(() => input);

  return sharp({
    create: { width: 1200, height: 630, channels: 4, background: { r: 250, g: 249, b: 246, alpha: 1 } },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .jpeg({ quality: 88 })
    .toBuffer();
}
