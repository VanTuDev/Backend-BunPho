import { Schema, model, type InferSchemaType } from "mongoose";
import { localizedSchema, imageSchema, jsonTransform } from "./shared";

const categorySchema = new Schema(
  {
    name: { type: localizedSchema, required: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    image: { type: imageSchema, default: null },
  },
  { timestamps: true },
);

categorySchema.index({ sortOrder: 1, createdAt: 1 });

categorySchema.set("toJSON", jsonTransform());

export type CategoryAttrs = InferSchemaType<typeof categorySchema>;

const Category = model("Category", categorySchema);

export default Category;
