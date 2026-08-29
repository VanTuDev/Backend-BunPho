import { Schema } from "mongoose";

/** A string that exists in Russian, English and Vietnamese. Matches the frontend `Localized`. */
export interface Localized {
  ru: string;
  en: string;
  vi: string;
}

/** Localized text. All three languages default to "" so partial data never breaks reads. */
export const localizedSchema = new Schema<Localized>(
  {
    ru: { type: String, trim: true, default: "" },
    en: { type: String, trim: true, default: "" },
    vi: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

/** Alias kept for readability at call sites (descriptions may be blank). */
export const localizedOptionalSchema = localizedSchema;

/** Fill any missing language with "". */
export function toLocalized(value: Partial<Localized> | undefined | null): Localized {
  return { ru: value?.ru ?? "", en: value?.en ?? "", vi: value?.vi ?? "" };
}

export interface CloudinaryImage {
  url: string;
  publicId: string;
}

export const imageSchema = new Schema<CloudinaryImage>(
  {
    url: { type: String, required: true },
    // Empty for seed images that ship with the app; set for Cloudinary uploads.
    publicId: { type: String, default: "" },
  },
  { _id: false },
);

/**
 * Shared `toJSON` transform: drop `__v` (and any extra keys passed in).
 * Typed loosely on purpose — Mongoose 8's transform generics are painful.
 */
export function jsonTransform(...extraKeys: string[]) {
  return {
    virtuals: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform(_doc: any, ret: any) {
      delete ret.__v;
      for (const k of extraKeys) delete ret[k];
      return ret;
    },
  };
}

/** Slugify a label for use in URLs / lookup keys. */
export function slugify(input: string): string {
  return input
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
