import Admin from "../models/Admin";
import { env, features } from "../config/env";

/**
 * Ensure an owner account exists. Runs on every boot; idempotent.
 * If an owner already exists, we only (optionally) refresh its password to
 * match the current env — handy when the owner forgets it on a live deploy.
 */
export async function ensureOwner(): Promise<void> {
  // One-time cleanup: drop the legacy `googleId` field (Google login removed).
  await Admin.collection.updateMany({ googleId: { $exists: true } }, { $unset: { googleId: "" } });

  if (!features.ownerSeed) {
    const count = await Admin.countDocuments();
    if (count === 0) {
      console.warn(
        "[bootstrap] No admins and no OWNER_* env vars set — set OWNER_EMAIL / OWNER_PASSWORD / OWNER_NAME and restart.",
      );
    }
    return;
  }

  const email = env.OWNER_EMAIL!.toLowerCase();
  let owner = await Admin.findOne({ role: "owner" });

  if (!owner) {
    // Adopt an existing plain admin with the same email, else create fresh.
    owner = await Admin.findOne({ email });
    if (owner) {
      owner.role = "owner";
    } else {
      owner = new Admin({ email, name: env.OWNER_NAME!, role: "owner", active: true });
    }
  }

  owner.name = env.OWNER_NAME!;
  owner.active = true;
  await owner.setPassword(env.OWNER_PASSWORD!);
  await owner.save();
  console.log(`[bootstrap] owner account ready: ${owner.email}`);
}
