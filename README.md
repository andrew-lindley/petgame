# 🐾 Cat Pet Simulator

A cute 2D chibi pet simulator where you can upload a photo of your pet and watch it come to life as an animated sprite in a cosy illustrated room. Feed it, pet it, play with it, and keep it happy!

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Framer Motion |
| Backend | Node.js, Express 4, tRPC 11 |
| Sprite generation | OpenAI `gpt-image-1` (image editing API) |
| Background removal | `sharp` (flood-fill white background removal) |
| UI components | shadcn/ui (Radix primitives + Tailwind) |

---

## Prerequisites

- **Node.js 20+** and **pnpm** (`npm install -g pnpm`)
- An **OpenAI API key** with access to `gpt-image-1`

---

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and set your OpenAI API key:

```
OPENAI_API_KEY=sk-...
```

### 3. Run in development mode

```bash
pnpm dev
```

This starts two processes concurrently:
- **Express server** on `http://localhost:3000` (API + sprite generation)
- **Vite dev server** on `http://localhost:5173` (frontend with HMR)

Open `http://localhost:5173` in your browser.

### 4. Build for production

```bash
pnpm build
pnpm start
```

The production build serves everything from the Express server on port 3000.

---

## How Sprite Generation Works

1. The user uploads a pet photo in the **"Adopt a Pet"** modal.
2. The photo is sent to the Express server as a base64 string.
3. The server calls the **OpenAI Images edit API** (`gpt-image-1`) four times in parallel — once for each pose: idle, happy, sleeping, eating.
4. Each generated image (white background) is processed by **sharp** to flood-fill remove the white background, producing a transparent PNG.
5. The transparent sprites are saved to the local `uploads/` folder and served as static files.
6. The frontend swaps the default sprites for the newly generated ones.

---

## Project Structure

```
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── pages/Home.tsx  # Main game component
│   │   ├── components/     # shadcn/ui components
│   │   ├── contexts/       # Theme context
│   │   └── lib/trpc.ts     # tRPC client binding
│   └── index.html
├── server/
│   ├── index.ts            # Express server entry point
│   ├── routers.ts          # tRPC router (pet.generateSprites)
│   ├── imageGeneration.ts  # OpenAI image generation helper
│   └── removeBackground.ts # Sharp-based background removal
├── shared/
│   └── const.ts            # Shared constants
├── uploads/                # Generated sprites saved here (auto-created)
├── .env.example            # Environment variable template
└── vite.config.ts          # Vite config with API proxy
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | **Yes** | OpenAI API key for `gpt-image-1` image generation |
| `PUBLIC_URL` | No | Public base URL for sprite image links (default: `http://localhost:3000`) |
| `PORT` | No | Port the Express server listens on (default: `3000`) |

---

## Deploying

The app can be deployed to any Node.js host (Railway, Render, Fly.io, etc.):

1. Set `OPENAI_API_KEY` and `PUBLIC_URL` as environment variables on your host.
2. Run `pnpm build` to produce `dist/`.
3. Run `pnpm start` to serve the production build.

> **Note on file storage:** Generated sprites are saved to the local `uploads/` folder. On ephemeral file systems (e.g. Heroku, some Railway configs) these will be lost on restart. For persistence, swap the `fs.writeFileSync` calls in `server/imageGeneration.ts` and `server/routers.ts` with an S3 upload using the `@aws-sdk/client-s3` package.

---

## Customising the Default Pet

The default sprites (the fluffy tabby cat) are hosted on a CDN. To change the default, replace the URLs in `DEFAULT_SPRITES` and `BG_URL` at the top of `client/src/pages/Home.tsx` with your own image URLs.
