import cors, { type CorsOptions } from "cors";
import type { RequestHandler } from "express";
import { allowedOrigins, isProd } from "../config/env";

/** True when `origin` matches one of the configured strings / RegExps. */
function isAllowed(origin: string): boolean {
  return allowedOrigins.some((rule) =>
    typeof rule === "string" ? rule === origin : rule.test(origin),
  );
}

const options: CorsOptions = {
  origin(origin, callback) {
    // Non-browser callers (curl, server-to-server, health checks) send no Origin.
    if (!origin) return callback(null, true);

    if (isAllowed(origin)) return callback(null, true);

    // In dev, allow anything but log it so misconfig is visible.
    if (!isProd) {
      console.warn(`[cors] allowing non-listed origin in dev: ${origin}`);
      return callback(null, true);
    }

    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86_400,
};

/** Configured `cors` middleware for the whole API. */
export const corsMiddleware: RequestHandler = cors(options);
