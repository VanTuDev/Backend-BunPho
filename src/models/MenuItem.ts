import { Schema, model, type InferSchemaType } from "mongoose";
import { localizedSchema, localizedOptionalSchema, imageSchema, jsonTransform } from "./shared";

const variantSchema = new Schema(
  {
    name: { type: localizedSchema, required: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const menuItemSchema = new Schema(
  {
    name: { type: localizedSchema, required: true },
    description: { type: localizedOptionalSchema, default: () => ({ ru: "", en: "" }) },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    /** Base price in whole roubles; also the "from" price when variants exist. */
    price: { type: Number, required: true, min: 0 },
    image: { type: imageSchema, default: null },
    variants: { type: [variantSchema], default: [] },
    available: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

menuItemSchema.index({ category: 1, sortOrder: 1, createdAt: 1 });

menuItemSchema.set("toJSON", jsonTransform());

export type MenuItemAttrs = InferSchemaType<typeof menuItemSchema>;

const MenuItem = model("MenuItem", menuItemSchema);

export default MenuItem;
