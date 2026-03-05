/**
 * Removes the white/near-white background from a sprite image using sharp,
 * replacing it with full transparency. Works by scanning each pixel and
 * setting alpha=0 for pixels that are sufficiently "white" (all channels high),
 * with a flood-fill from the corners to avoid hollowing out light-coloured fur.
 */
import sharp from "sharp";

/**
 * Takes a PNG buffer and returns a new PNG buffer with the white background
 * replaced by transparency using a corner flood-fill approach.
 *
 * @param inputBuffer - Raw image bytes (any format sharp can read)
 * @param threshold   - 0-255: how close to white a pixel must be to be removed (default 230)
 * @returns PNG buffer with transparent background
 */
export async function removeWhiteBackground(
  inputBuffer: Buffer,
  threshold = 230
): Promise<Buffer> {
  // Ensure we work with RGBA PNG
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info; // channels === 4 (RGBA)
  const pixels = new Uint8ClampedArray(data);

  function isWhite(idx: number): boolean {
    return (
      pixels[idx] >= threshold &&
      pixels[idx + 1] >= threshold &&
      pixels[idx + 2] >= threshold &&
      pixels[idx + 3] > 10 // skip already-transparent pixels
    );
  }

  function setTransparent(idx: number): void {
    pixels[idx + 3] = 0;
  }

  // BFS flood-fill from all four corners
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  function enqueue(x: number, y: number): void {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const pos = y * width + x;
    if (visited[pos]) return;
    const idx = pos * channels;
    if (!isWhite(idx)) return;
    visited[pos] = 1;
    queue.push(x, y);
  }

  // Seed from all four corners
  enqueue(0, 0);
  enqueue(width - 1, 0);
  enqueue(0, height - 1);
  enqueue(width - 1, height - 1);

  // Also seed from the full border to catch edge-touching backgrounds
  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  let qi = 0;
  while (qi < queue.length) {
    const x = queue[qi++];
    const y = queue[qi++];
    const idx = (y * width + x) * channels;
    setTransparent(idx);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  // Convert back to PNG
  const result = await sharp(Buffer.from(pixels.buffer), {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer();

  return result;
}
