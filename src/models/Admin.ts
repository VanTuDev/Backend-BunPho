import { Schema, model, type Model, type HydratedDocument, type Types } from "mongoose";
import bcrypt from "bcryptjs";
import { jsonTransform } from "./shared";

export interface AdminAttrs {
  email: string;
  name: string;
  passwordHash: string | null;
  role: "owner" | "admin";
  active: boolean;
  createdBy: Types.ObjectId | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminMethods {
  setPassword(plain: string): Promise<void>;
  comparePassword(plain: string): Promise<boolean>;
}

export type AdminDocument = HydratedDocument<AdminAttrs, AdminMethods>;

type AdminModel = Model<AdminAttrs, object, AdminMethods>;

const adminSchema = new Schema<AdminAttrs, AdminModel, AdminMethods>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, default: null },
    role: { type: String, enum: ["owner", "admin"], default: "admin" },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

adminSchema.methods.setPassword = async function setPassword(plain: string): Promise<void> {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

adminSchema.methods.comparePassword = async function comparePassword(
  plain: string,
): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

// `googleId` is dropped from the schema — strip it from any pre-existing docs too.
adminSchema.set("toJSON", jsonTransform("passwordHash", "googleId"));

const Admin = model<AdminAttrs, AdminModel>("Admin", adminSchema);

export default Admin;
