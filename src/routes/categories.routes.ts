import { Router } from "express";
import { z } from "zod";
import Category from "../models/Category";
import MenuItem from "../models/MenuItem";
import { asyncHandler, HttpError } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { slugify, toLocalized } from "../models/shared";
import { destroyImage } from "../lib/cloudinary";

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

/* ── Public ─────────────────────────────────────────────── */

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const all = req.query.all === "true" && !!req.headers.authorization;
    const filter = all ? {} : { active: true };
    const categories = await Category.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
    res.json({ categories });
  }),
);

/* ── Admin ──────────────────────────────────────────────── */

const createSchema = z.object({
  name: localized.refine((n) => n.ru || n.en || n.vi, "Name is required in at least one language"),
  slug: z.string().trim().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  image,
});

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parseBody(createSchema, req.body);
    const slug = slugify(data.slug || data.name.en || data.name.ru || data.name.vi);
    if (!slug) throw new HttpError(422, "Could not derive a slug from the name");
    if (await Category.exists({ slug })) throw new HttpError(409, `Slug "${slug}" is taken`);

    const category = await Category.create({
      name: toLocalized(data.name),
      slug,
      sortOrder: data.sortOrder ?? 0,
      active: data.active ?? true,
      image: data.image ?? null,
    });
    res.status(201).json({ category });
  }),
);

const updateSchema = createSchema.partial();

router.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) throw new HttpError(404, "Category not found");
    const data = parseBody(updateSchema, req.body);

    if (data.name) category.name = toLocalized(data.name);
    if (data.slug !== undefined) {
      const slug = slugify(data.slug);
      if (slug && slug !== category.slug) {
        if (await Category.exists({ slug })) throw new HttpError(409, `Slug "${slug}" is taken`);
        category.slug = slug;
      }
    }
    if (data.sortOrder !== undefined) category.sortOrder = data.sortOrder;
    if (data.active !== undefined) category.active = data.active;
    if (data.image !== undefined) {
      if (category.image?.publicId && category.image.publicId !== data.image?.publicId) {
        await destroyImage(category.image.publicId);
      }
      category.image = data.image ?? null;
    }
    await category.save();
    res.json({ category });
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) throw new HttpError(404, "Category not found");

    const itemCount = await MenuItem.countDocuments({ category: category._id });
    if (itemCount > 0) {
      throw new HttpError(409, `Category has ${itemCount} dishes — move or delete them first`);
    }
    await destroyImage(category.image?.publicId);
    await category.deleteOne();
    res.json({ ok: true });
  }),
);

export default router;
