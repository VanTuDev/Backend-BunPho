/**
 * Run the whole backend against a throwaway in-memory MongoDB — no Atlas, no
 * network, no IP allow-list. Perfect for developing the frontend/admin while
 * Atlas access is being sorted out.
 *
 *   npm run dev:local
 *
 * The database is re-created and re-seeded on every start. First run downloads a
 * ~small mongod binary over HTTPS (cached afterwards).
 */
import { MongoMemoryServer } from "mongodb-memory-server";

async function main() {
  console.log("[dev:local] starting in-memory MongoDB…");
  const mongo = await MongoMemoryServer.create({ instance: { dbName: "bunpho" } });
  const uri = mongo.getUri("bunpho");
  console.log(`[dev:local] mongo ready at ${uri}`);

  // Must be set BEFORE the app's env module is imported/validated.
  process.env.MONGODB_URI = uri;
  process.env.NODE_ENV ??= "development";
  process.env.JWT_SECRET ??= "dev-local-insecure-secret-change-me";
  process.env.OWNER_EMAIL ??= "owner@local.test";
  process.env.OWNER_PASSWORD ??= "local-admin-123";
  process.env.OWNER_NAME ??= "Local Owner";
  process.env.FRONTEND_URL ??= "http://localhost:3000";
  process.env.PORT ??= "4000";

  const { connectDb, disconnectDb } = await import("./db");
  const { seedDatabase } = await import("./seed");
  const { ensureOwner } = await import("./lib/bootstrap");
  const { createApp } = await import("./index");
  const { startTelegramPolling, stopTelegramPolling } = await import("./lib/telegram");

  await connectDb();
  await ensureOwner();
  await seedDatabase({ wipe: true });
  console.log("[dev:local] seeded");

  const app = createApp();
  startTelegramPolling();
  const server = app.listen(4000, () => {
    console.log("");
    console.log("  ┌─────────────────────────────────────────────┐");
    console.log("  │  Local dev stack is up (in-memory MongoDB)   │");
    console.log("  │  API:    http://localhost:4000               │");
    console.log("  │  Admin:  owner@local.test / local-admin-123  │");
    console.log("  └─────────────────────────────────────────────┘");
  });

  const stop = async () => {
    stopTelegramPolling();
    server.close();
    await disconnectDb();
    await mongo.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

main().catch((err) => {
  console.error("[dev:local] failed:", err);
  process.exit(1);
});
