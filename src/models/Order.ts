import { Schema, model, type InferSchemaType } from "mongoose";
import { localizedSchema, jsonTransform } from "./shared";

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "served",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const orderItemSchema = new Schema(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
    name: { type: localizedSchema, required: true },
    variantId: { type: Schema.Types.ObjectId, default: null },
    variantName: { type: localizedSchema, default: null },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    note: { type: String, trim: true, default: "" },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: Number, required: true, unique: true, index: true },
    table: {
      ref: { type: Schema.Types.ObjectId, ref: "Table", required: true },
      code: { type: String, required: true },
      label: { type: String, required: true },
      type: { type: String, enum: ["standard", "vip"], default: "standard" },
    },
    customer: {
      name: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
    },
    items: { type: [orderItemSchema], required: true, validate: (v: unknown[]) => v.length > 0 },
    note: { type: String, trim: true, default: "" },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: "pending", index: true },
    source: { type: String, enum: ["qr", "web"], default: "qr" },
    // The kitchen notification message, so status changes (from the admin panel
    // or from Telegram itself) can edit it in place.
    telegram: {
      type: new Schema(
        { chatId: { type: String }, messageId: { type: Number } },
        { _id: false },
      ),
      default: null,
    },
    statusHistory: {
      type: [
        new Schema(
          {
            status: { type: String, enum: ORDER_STATUSES, required: true },
            at: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ "table.ref": 1, createdAt: -1 });

orderSchema.set("toJSON", jsonTransform());

export type OrderAttrs = InferSchemaType<typeof orderSchema>;

const Order = model("Order", orderSchema);

export default Order;
