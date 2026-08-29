import { Router } from "express";
import multer from "multer";
import { asyncHandler, HttpError } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { uploadImage } from "../lib/cloudinary";
import { features } from "../config/env";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpe?g|png|webp|avif|gif)$/.test(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

router.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!features.cloudinary) throw new HttpError(503, "Image uploads are not configured");
    if (!req.file) throw new HttpError(422, "No file provided (field name: 'file')");
    const image = await uploadImage(req.file.buffer);
    res.status(201).json({ image });
  }),
);

export default router;
