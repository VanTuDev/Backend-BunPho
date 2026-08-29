import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import type { Express } from "express";
import { env, features, isProd } from "./config/env";
import { connectDb, disconnectDb } from "./db";
import { ensureOwner } from "./lib/bootstrap";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler, notFound } from "./middleware/error";
import { startTelegramPolling, stopTelegramPolling } from "./lib/telegram";

import authRoutes from "./routes/auth.routes";
import adminsRoutes from "./routes/admins.routes";
import categoriesRoutes from "./routes/categories.routes";
import menuRoutes from "./routes/menu.routes";
import tablesRoutes from "./routes/tables.routes";
import ordersRoutes from "./routes/orders.routes";
import uploadsRoutes from "./routes/uploads.routes";

export function createApp(): Express {
  const app = express();

  // Render / proxies sit in front of the app — needed for correct client IPs
  // (rate limiting) and protocol detection.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(corsMiddleware);
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(isProd ? "combined" : "dev"));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, env: env.NODE_ENV, features, time: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/admins", adminsRoutes);
  app.use("/api/categories", categoriesRoutes);
  app.use("/api/menu", menuRoutes);
  app.use("/api/tables", tablesRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/uploads", uploadsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export async function start() {
  try {
    await connectDb();
    console.log("[db] connected");

    await ensureOwner();

    const app = createApp();
    const server = app.listen(env.PORT, () => {
      console.log(`[server] listening on :${env.PORT} (${env.NODE_ENV})`);
    });

    startTelegramPolling();

    const shutdown = async (signal: string) => {
      console.log(`[server] ${signal} received — shutting down`);
      stopTelegramPolling();
      server.close();
      await disconnectDb();
      process.exit(0);
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  } catch (err) {
    console.error("[server] failed to start:", err);
    process.exit(1);
  }
}

// Auto-start only when run directly (`node dist/index.js` / `tsx src/index.ts`),
// not when imported by dev-local.ts.
if (process.argv[1] && /index\.(ts|js)$/.test(process.argv[1])) {
  void start();
}
