import { Router } from "express";
import { z } from "zod";
import Table from "../models/Table";
import Order from "../models/Order";
import { asyncHandler, HttpError } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { slugify } from "../models/shared";

const router = Router();

/* ── Public: resolve a scanned QR code ──────────────────── */

router.get(
  "/:code",
  asyncHandler(async (req, res) => {
    const table = await Table.findOne({ code: req.params.code.toLowerCase(), active: true });
    if (!table) throw new HttpError(404, "Unknown table");
    res.json({ table: { code: table.code, label: table.label, type: table.type } });
  }),
);

/* ── Admin ──────────────────────────────────────────────── */

router.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const tables = await Table.find().sort({ type: 1, label: 1, createdAt: 1 }).lean();
    res.json({ tables });
  }),
);

const createSchema = z.object({
  label: z.string().trim().min(1).max(40),
  code: z.string().trim().min(1).max(40).optional(),
  type: z.enum(["standard", "vip"]).optional(),
  active: z.boolean().optional(),
  note: z.string().trim().max(200).optional(),
});

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parseBody(createSchema, req.body);
    const code = slugify(data.code || data.label);
    if (!code) throw new HttpError(422, "Could not derive a table code");
    if (await Table.exists({ code })) throw new HttpError(409, `Table code "${code}" is taken`);

    const table = await Table.create({
      label: data.label,
      code,
      type: data.type ?? "standard",
      active: data.active ?? true,
      note: data.note ?? "",
    });
    res.status(201).json({ table });
  }),
);

const bulkSchema = z.object({
  from: z.number().int().min(1),
  to: z.number().int().min(1),
  type: z.enum(["standard", "vip"]).optional(),
  prefix: z.string().trim().max(20).optional(),
});

/** Convenience: create tables N..M in one call (skips codes that already exist). */
router.post(
  "/bulk",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { from, to, type, prefix } = parseBody(bulkSchema, req.body);
    if (to - from > 200) throw new HttpError(422, "Range too large");
    const created = [];
    for (let n = from; n <= to; n++) {
      const label = `${prefix ? `${prefix} ` : ""}${n}`;
      const code = slugify(label);
      if (await Table.exists({ code })) continue;
      created.push(await Table.create({ label, code, type: type ?? "standard" }));
    }
    res.status(201).json({ created, count: created.length });
  }),
);

const updateSchema = createSchema.partial();

router.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const table = await Table.findById(req.params.id);
    if (!table) throw new HttpError(404, "Table not found");
    const data = parseBody(updateSchema, req.body);

    if (data.label !== undefined) table.label = data.label;
    if (data.code !== undefined) {
      const code = slugify(data.code);
      if (code && code !== table.code) {
        if (await Table.exists({ code })) throw new HttpError(409, `Table code "${code}" is taken`);
        table.code = code;
      }
    }
    if (data.type !== undefined) table.type = data.type;
    if (data.active !== undefined) table.active = data.active;
    if (data.note !== undefined) table.note = data.note;
    await table.save();
    res.json({ table });
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const table = await Table.findById(req.params.id);
    if (!table) throw new HttpError(404, "Table not found");
    const orderCount = await Order.countDocuments({ "table.ref": table._id });
    if (orderCount > 0) {
      // Keep order history intact — deactivate instead of hard delete.
      table.active = false;
      await table.save();
      return res.json({ ok: true, deactivated: true });
    }
    await table.deleteOne();
    res.json({ ok: true, deactivated: false });
  }),
);

export default router;
