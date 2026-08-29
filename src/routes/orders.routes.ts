import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import MenuItem from "../models/MenuItem";
import Order, { ORDER_STATUSES } from "../models/Order";
import Table from "../models/Table";
import { nextSequence } from "../models/Counter";
import { asyncHandler, HttpError } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { orderLimiter } from "../middleware/rateLimit";
import { notifyStatusChange, sendOrderNotification } from "../lib/telegram";
import { toLocalized, type Localized } from "../models/shared";

const router = Router();

/* ── Public: create ─────────────────────────────────────── */

const createSchema = z.object({
  tableCode: z.string().trim().min(1).max(40),
  customer: z
    .object({
      name: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(40).optional(),
    })
    .optional(),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        variantId: z.string().nullish(),
        quantity: z.number().int().min(1).max(99),
        note: z.string().trim().max(280).optional(),
      }),
    )
    .min(1, "Order has no items"),
});

router.post(
  "/",
  orderLimiter,
  asyncHandler(async (req, res) => {
    const data = parseBody(createSchema, req.body);

    const table = await Table.findOne({ code: data.tableCode.toLowerCase(), active: true });
    if (!table) throw new HttpError(422, "Unknown or inactive table");

    const ids = data.items.map((i) => i.menuItemId).filter((id) => Types.ObjectId.isValid(id));
    const menuItems = await MenuItem.find({ _id: { $in: ids }, available: true });
    const byId = new Map(menuItems.map((m) => [m.id as string, m]));

    const items = data.items.map((raw) => {
      const dish = byId.get(raw.menuItemId);
      if (!dish) throw new HttpError(422, `Dish unavailable: ${raw.menuItemId}`);

      let unitPrice = dish.price;
      let variantName: Localized | null = null;
      let variantId: Types.ObjectId | null = null;

      if (raw.variantId) {
        const variant = dish.variants.find((v) => String(v._id) === raw.variantId);
        if (!variant) throw new HttpError(422, `Unknown option for ${dish.name.en || dish.name.ru}`);
        unitPrice = variant.price;
        variantName = toLocalized(variant.name);
        variantId = variant._id as Types.ObjectId;
      }

      const quantity = raw.quantity;
      return {
        menuItem: dish._id,
        name: toLocalized(dish.name),
        variantId,
        variantName,
        unitPrice,
        quantity,
        note: raw.note ?? "",
        lineTotal: unitPrice * quantity,
      };
    });

    const total = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const orderNumber = await nextSequence("order");

    const order = await Order.create({
      orderNumber,
      table: { ref: table._id, code: table.code, label: table.label, type: table.type },
      customer: { name: data.customer?.name ?? "", phone: data.customer?.phone ?? "" },
      items,
      note: data.note ?? "",
      total,
      status: "pending",
      source: "qr",
      statusHistory: [{ status: "pending", at: new Date() }],
    });

    // Fire-and-forget + self-catching — a slow/broken Telegram must not delay
    // or fail the customer's order.
    void sendOrderNotification(order);

    res.status(201).json({ order });
  }),
);

/* ── Public: status ─────────────────────────────────────── */

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw new HttpError(404, "Order not found");
    const order = await Order.findById(req.params.id).lean();
    if (!order) throw new HttpError(404, "Order not found");
    // Public view — no internal refs, no phone, no full history.
    const table = order.table as { label?: string; type?: string } | undefined;
    res.json({
      order: {
        id: String(order._id),
        orderNumber: order.orderNumber,
        table: { label: table?.label ?? "", type: table?.type ?? "standard" },
        customer: { name: order.customer?.name ?? "" },
        items: order.items,
        note: order.note,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
      },
    });
  }),
);

/* ── Admin: list + status ───────────────────────────────── */

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};

    if (typeof req.query.id === "string") {
      if (!Types.ObjectId.isValid(req.query.id)) return res.json({ orders: [] });
      const one = await Order.findById(req.query.id);
      return res.json({ orders: one ? [one] : [] });
    }

    if (typeof req.query.status === "string" && ORDER_STATUSES.includes(req.query.status as never)) {
      filter.status = req.query.status;
    }
    if (req.query.active === "true") {
      filter.status = { $in: ["pending", "confirmed", "preparing", "ready"] };
    }
    if (typeof req.query.table === "string") {
      filter["table.code"] = req.query.table.toLowerCase();
    }
    if (typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      const start = new Date(`${req.query.date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 86_400_000);
      filter.createdAt = { $gte: start, $lt: end };
    }

    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ orders });
  }),
);

const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) });

router.patch(
  "/:id/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status } = parseBody(statusSchema, req.body);
    const order = await Order.findById(req.params.id);
    if (!order) throw new HttpError(404, "Order not found");

    if (order.status !== status) {
      order.status = status;
      order.statusHistory.push({ status, at: new Date() });
      await order.save();
      void notifyStatusChange(order); // keep the Telegram message in sync
    }
    res.json({ order });
  }),
);

export default router;
