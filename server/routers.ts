import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { generateImage } from "./imageGeneration.js";
import { removeWhiteBackground } from "./removeBackground.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../uploads");

const t = initTRPC.create();
const router = t.router;
const publicProcedure = t.procedure;

const SPRITE_POSES = [
  {
    key: "idle",
    description:
      "sitting upright in a calm idle pose, facing forward, with a gentle curious expression and big round eyes",
  },
  {
    key: "happy",
    description:
      "sitting and doing a happy expression with closed crescent eyes and a big smile, both paws raised in joy, tail wagging",
  },
  {
    key: "sleeping",
    description:
      "curled up sleeping in a loaf position with closed crescent eyes and small ZZZ bubbles floating above",
  },
  {
    key: "eating",
    description:
      "sitting next to a small food bowl, leaning forward happily with sparkling eyes and an open mouth",
  },
] as const;

async function generateTransparentSprite(
  imageBase64: string,
  mimeType: string,
  description: string,
  key: string
): Promise<string> {
  // 1. Generate the sprite via OpenAI image editing
  const result = await generateImage({
    prompt: `Cute chibi 2D game sprite of the exact same pet animal shown in the reference photo. The pet should be illustrated in a kawaii anime style with thick black outlines, vibrant colors, and a smooth vector-style illustration. The pet is ${description}. Pure white background, full body visible, centered composition, no text, no watermarks.`,
    imageBase64,
    mimeType,
  });

  // 2. Read the saved image back from disk
  const filename = result.url.split("/uploads/")[1];
  const rawBuffer = fs.readFileSync(path.join(UPLOADS_DIR, filename));

  // 3. Remove the white background
  const transparentBuffer = await removeWhiteBackground(rawBuffer, 230);

  // 4. Overwrite the file with the transparent version
  const transparentFilename = `${nanoid()}-${key}.png`;
  const transparentPath = path.join(UPLOADS_DIR, transparentFilename);
  fs.writeFileSync(transparentPath, transparentBuffer);

  const host = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  return `${host}/uploads/${transparentFilename}`;
}

const petRouter = router({
  generateSprites: publicProcedure
    .input(
      z.object({
        imageBase64: z.string().min(1),
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      const { imageBase64, mimeType } = input;

      // Generate all 4 sprites in parallel
      const results = await Promise.all(
        SPRITE_POSES.map((p) =>
          generateTransparentSprite(imageBase64, mimeType, p.description, p.key)
        )
      );

      return {
        sprites: {
          idle: results[0],
          happy: results[1],
          sleeping: results[2],
          eating: results[3],
        },
      };
    }),
});

export const appRouter = router({
  pet: petRouter,
});

export type AppRouter = typeof appRouter;
