import { Schema, model } from "mongoose";

/**
 * Tiny key/value store for runtime config that isn't an env var — currently
 * just the Telegram chat id captured when the owner messages the bot.
 */
const settingSchema = new Schema(
  {
    _id: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

const Setting = model("Setting", settingSchema);

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const doc = await Setting.findById(key).lean();
  return (doc?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await Setting.findByIdAndUpdate(key, { value }, { upsert: true });
}

export default Setting;
