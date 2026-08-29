import { Router } from "express";
import { z } from "zod";
import Admin from "../models/Admin";
import { signToken } from "../lib/jwt";
import { asyncHandler, HttpError } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { authLimiter } from "../middleware/rateLimit";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin || !admin.active) throw new HttpError(401, "Invalid credentials");

    const ok = await admin.comparePassword(password);
    if (!ok) throw new HttpError(401, "Invalid credentials");

    admin.lastLoginAt = new Date();
    await admin.save();

    res.json({ token: signToken({ adminId: admin.id }), admin });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ admin: req.admin });
  }),
);

export default router;
