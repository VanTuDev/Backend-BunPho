import { Router } from "express";
import { z } from "zod";
import Admin from "../models/Admin";
import { asyncHandler, HttpError } from "../middleware/error";
import { bustAdminCache, requireAuth, requireOwner } from "../middleware/auth";
import { parseBody } from "../middleware/validate";

const router = Router();

router.use(requireAuth, requireOwner);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const admins = await Admin.find().sort({ role: 1, createdAt: 1 });
    res.json({ admins });
  }),
);

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  // Password is now the only way in, so it is required when creating an admin.
  password: z.string().min(6).max(200),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { email, name, password } = parseBody(createSchema, req.body);
    const exists = await Admin.findOne({ email: email.toLowerCase() });
    if (exists) throw new HttpError(409, "An admin with this email already exists");

    const admin = new Admin({
      email: email.toLowerCase(),
      name,
      role: "admin",
      createdBy: req.admin!.id,
    });
    await admin.setPassword(password);
    await admin.save();

    res.status(201).json({ admin });
  }),
);

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
});

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.params.id);
    if (!admin) throw new HttpError(404, "Admin not found");
    if (admin.role === "owner") throw new HttpError(403, "The owner account cannot be modified here");

    const { name, active, password } = parseBody(updateSchema, req.body);
    if (name !== undefined) admin.name = name;
    if (active !== undefined) admin.active = active;
    if (password) await admin.setPassword(password);
    await admin.save();
    bustAdminCache(admin.id);

    res.json({ admin });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.params.id);
    if (!admin) throw new HttpError(404, "Admin not found");
    if (admin.role === "owner") throw new HttpError(403, "The owner account cannot be removed");
    await admin.deleteOne();
    bustAdminCache(admin.id);
    res.json({ ok: true });
  }),
);

export default router;
