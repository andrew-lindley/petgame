import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Allow large image uploads (base64 encoded photos)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Serve uploaded/generated sprites from the local uploads folder
  app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: () => ({}),
    })
  );

  // Serve the built Vite frontend in production
  const isDev = process.env.NODE_ENV !== "production";
  if (!isDev) {
    const distPath = path.join(__dirname, "../dist/client");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const port = parseInt(process.env.PORT ?? "3000");
  server.listen(port, () => {
    console.log(`🐾 Cat Pet Simulator running on http://localhost:${port}/`);
    if (isDev) {
      console.log("   Run the Vite dev server separately: pnpm dev:client");
    }
  });
}

startServer().catch(console.error);
