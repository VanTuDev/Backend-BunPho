import mongoose from "mongoose";
import { env } from "./config/env";

mongoose.set("strictQuery", true);

let connecting: Promise<typeof mongoose> | null = null;

/** Connect once; reuse the promise across hot-reloads and the seed script. */
export function connectDb(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
  if (!connecting) {
    connecting = mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
      // Keep a couple of pooled sockets open so requests don't pay TLS + auth
      // handshake latency to Atlas on a cold connection.
      minPoolSize: 2,
      maxPoolSize: 10,
    });
  }
  return connecting;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  connecting = null;
}
