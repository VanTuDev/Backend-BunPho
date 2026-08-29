import { Schema, model, type InferSchemaType } from "mongoose";
import { jsonTransform } from "./shared";

const tableSchema = new Schema(
  {
    /** Shown to the guest after they scan, e.g. "12" or "VIP 3". */
    label: { type: String, required: true, trim: true },
    /** Used in the QR URL `/order?table=<code>`. Unique, URL-safe. */
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    type: { type: String, enum: ["standard", "vip"], default: "standard" },
    active: { type: Boolean, default: true },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

tableSchema.index({ type: 1, label: 1 });

tableSchema.set("toJSON", jsonTransform());

export type TableAttrs = InferSchemaType<typeof tableSchema>;

const Table = model("Table", tableSchema);

export default Table;
