import "dotenv/config";
import { z } from "zod";

/**
 * Validate process.env once at startup. Anything the app truly cannot run
 * without is `.min(1)`; integrations that can degrade gracefully are optional
 * and their absence is logged (not fatal) so local dev works without every key.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),

  OWNER_EMAIL: z.string().email().optional(),
  OWNER_PASSWORD: z.string().min(6).optional(),
  OWNER_NAME: z.string().min(1).optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGIN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("✖ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === "production";

/** Origins allowed by CORS: the Vercel site, any *.vercel.app preview, localhost. */
export const allowedOrigins: (string | RegExp)[] = [
  env.FRONTEND_URL,
  "https://pho-imperial.vercel.app",
  /^https?:\/\/localhost(:\d+)?$/,
  // Vercel preview + production deploys for this project.
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  ...(env.CORS_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
];

export const features = {
  cloudinary: Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  ),
  // Chat id is optional — captured at runtime when the owner sends /start.
  telegram: Boolean(env.TELEGRAM_BOT_TOKEN),
  ownerSeed: Boolean(env.OWNER_EMAIL && env.OWNER_PASSWORD && env.OWNER_NAME),
};
