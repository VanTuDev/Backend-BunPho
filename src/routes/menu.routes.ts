import { Router } from "express";
import { z } from "zod";
import Category from "../models/Category";
import MenuItem from "../models/MenuItem";
import { asyncHandler, HttpError } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { destroyImage } from "../lib/cloudinary";
import { toLocalized } from "../models/shared";

const router = Router();

const localized = z.object({
  ru: z.string().trim().default(""),
  en: z.string().trim().default(""),
  vi: z.string().trim().default(""),
});
// `url` may be a Cloudinary URL or a relative seed path (`/images/x.png`);
// `publicId` is empty for seed images. Matches `imageSchema` in the model.
const image = z
  .object({ url: z.string().min(1), publicId: z.string().default("") })
  .nullable()
  .optional();
const variant = z.object({
  _id: z.string().optional(),
  name: localized.refine((n) => n.ru || n.en || n.vi, "Variant name is required"),
  price: z.number().min(0),
});

/* ── Public ─────────────────────────────────────────────── */

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const withHidden = req.query.all === "true" && !!req.headers.authorization;
    const filter: Record<string, unknown> = withHidden ? {} : { available: true };

    if (typeof req.query.category === "string") {
      const cat = await Category.findOne({ slug: req.query.category }).select("_id");
      filter.category = cat?._id ?? null;
    }
    if (req.query.featured === "true") filter.featured = true;

    const items = await MenuItem.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
    res.json({ items });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await MenuItem.findById(req.params.id);
    if (!item) throw new HttpError(404, "Dish not found");
    res.json({ item });
  }),
);

/* ── Admin ──────────────────────────────────────────────── */

const createSchema = z.object({
  name: localized.refine((n) => n.ru || n.en || n.vi, "Name is required"),
  description: localized.optional(),
  category: z.string().min(1),
  price: z.number().min(0),
  image,
  variants: z.array(variant).optional(),
  available: z.boolean().optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parseBody(createSchema, req.body);
    const category = await Category.findById(data.category);
    if (!category) throw new HttpError(422, "Unknown category");

    const item = await MenuItem.create({
      name: toLocalized(data.name),
      description: toLocalized(data.description),
      category: category._id,
      price: data.price,
      image: data.image ?? null,
      variants: (data.variants ?? []).map((v) => ({ name: toLocalized(v.name), price: v.price })),
      available: data.available ?? true,
      featured: data.featured ?? false,
      sortOrder: data.sortOrder ?? 0,
    });
    res.status(201).json({ item });
  }),
);

const updateSchema = createSchema.partial();

router.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const item = await MenuItem.findById(req.params.id);
    if (!item) throw new HttpError(404, "Dish not found");
    const data = parseBody(updateSchema, req.body);

    if (data.category) {
      const category = await Category.findById(data.category);
      if (!category) throw new HttpError(422, "Unknown category");
      item.category = category._id;
    }
    if (data.name) item.name = toLocalized(data.name);
    if (data.description) item.description = toLocalized(data.description);
    if (data.price !== undefined) item.price = data.price;
    if (data.variants !== undefined) {
      item.set("variants", data.variants.map((v) => ({ name: toLocalized(v.name), price: v.price })));
    }
    if (data.available !== undefined) item.available = data.available;
    if (data.featured !== undefined) item.featured = data.featured;
    if (data.sortOrder !== undefined) item.sortOrder = data.sortOrder;
    if (data.image !== undefined) {
      if (item.image?.publicId && item.image.publicId !== data.image?.publicId) {
        await destroyImage(item.image.publicId);
      }
      item.image = data.image ?? null;
    }
    await item.save();
    res.json({ item });
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const item = await MenuItem.findById(req.params.id);
    if (!item) throw new HttpError(404, "Dish not found");
    await destroyImage(item.image?.publicId);
    await item.deleteOne();
    res.json({ ok: true });
  }),
);

export default router;
