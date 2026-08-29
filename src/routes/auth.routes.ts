import { Router } from "express";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import Admin from "../models/Admin";
import { signToken } from "../lib/jwt";
import { env, features } from "../config/env";
import { asyncHandler, HttpError } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";

const router = Router();

const googleClient = features.google ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
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

const googleSchema = z.object({ credential: z.string().min(1) });

router.post(
  "/google",
  asyncHandler(async (req, res) => {
    if (!googleClient) throw new HttpError(503, "Google login is not configured");
    const { credential } = parseBody(googleSchema, req.body);

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    if (!email || !payload?.email_verified) {
      throw new HttpError(401, "Google account email not verified");
    }

    const admin = await Admin.findOne({ email });
    if (!admin || !admin.active) {
      throw new HttpError(403, "This Google account is not registered as an admin");
    }

    if (!admin.googleId && payload.sub) {
      admin.googleId = payload.sub;
    }
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
