import type { NextFunction, Request, Response } from "express";
import Admin, { type AdminDocument } from "../models/Admin";
import { verifyToken } from "../lib/jwt";
import { HttpError } from "./error";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminDocument;
    }
  }
}

/**
 * Short-lived cache of the `Admin` doc keyed by id. The admin panel fires many
 * authenticated requests in quick succession and each one otherwise costs a full
 * Atlas round-trip just to re-load the same account. TTL is small so a disabled
 * account still loses access within seconds; `bustAdminCache` makes it instant
 * after an explicit change.
 */
const ADMIN_CACHE_TTL = 60_000;
const adminCache = new Map<string, { doc: AdminDocument; at: number }>();

export function bustAdminCache(adminId?: string): void {
  if (adminId) adminCache.delete(adminId);
  else adminCache.clear();
}

/** Require a valid admin JWT. Attaches `req.admin`. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new HttpError(401, "Missing authorization token");

    let adminId: string;
    try {
      ({ adminId } = verifyToken(token));
    } catch {
      throw new HttpError(401, "Invalid or expired token");
    }

    const cached = adminCache.get(adminId);
    let admin: AdminDocument | null;
    if (cached && Date.now() - cached.at < ADMIN_CACHE_TTL) {
      admin = cached.doc;
    } else {
      admin = await Admin.findById(adminId);
      if (admin) adminCache.set(adminId, { doc: admin, at: Date.now() });
      else adminCache.delete(adminId);
    }
    if (!admin || !admin.active) {
      adminCache.delete(adminId);
      throw new HttpError(401, "Account not found or disabled");
    }

    req.admin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

/** Require the authenticated admin to be the owner. Use after `requireAuth`. */
export function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if (req.admin?.role !== "owner") {
    return next(new HttpError(403, "Owner access required"));
  }
  next();
}
