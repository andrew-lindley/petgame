/**
 * Image generation using the OpenAI Images API (gpt-image-1).
 * Requires OPENAI_API_KEY in your .env file.
 *
 * Generated images are saved to the local /uploads directory and served
 * as static files. If you prefer S3, swap storagePut() below with your
 * own S3 upload logic and return the resulting public URL.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export type GenerateImageOptions = {
  prompt: string;
  /** Base64-encoded source image for image-to-image editing */
  imageBase64?: string;
  mimeType?: string;
};

export async function generateImage(options: GenerateImageOptions): Promise<{ url: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in your environment");

  let responseData: { b64_json: string } | null = null;

  if (options.imageBase64) {
    // Image editing: use the edits endpoint with the source photo as reference
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    // Convert base64 to a File object for the SDK
    const imageBuffer = Buffer.from(options.imageBase64, "base64");
    const imageFile = await OpenAI.toFile(imageBuffer, "reference.png", {
      type: options.mimeType ?? "image/png",
    });

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt: options.prompt,
      n: 1,
      size: "1024x1024",
    });

    responseData = response.data?.[0] as { b64_json: string } | null;
  } else {
    // Text-to-image generation
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: options.prompt,
      n: 1,
      size: "1024x1024",
    });

    responseData = response.data?.[0] as { b64_json: string } | null;
  }

  if (!responseData?.b64_json) {
    throw new Error("OpenAI image generation returned no image data");
  }

  // Save the image to disk and return a local URL
  const filename = `${nanoid()}.png`;
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(responseData.b64_json, "base64"));

  // Return a URL relative to the server root (served by express.static)
  const host = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  return { url: `${host}/uploads/${filename}` };
}
