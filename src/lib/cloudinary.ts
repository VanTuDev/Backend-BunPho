import { v2 as cloudinary } from "cloudinary";
import { env, features } from "../config/env";

if (features.cloudinary) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface UploadedImage {
  url: string;
  publicId: string;
}

/** Upload an image buffer to Cloudinary under the `bunpho/` folder. */
export function uploadImage(buffer: Buffer, folder = "bunpho"): Promise<UploadedImage> {
  if (!features.cloudinary) {
    return Promise.reject(new Error("Cloudinary is not configured"));
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", transformation: [{ quality: "auto", fetch_format: "auto" }] },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed"));
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

/** Best-effort delete of a previously uploaded image. Never throws. */
export async function destroyImage(publicId: string | null | undefined): Promise<void> {
  if (!publicId || !features.cloudinary) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.warn("[cloudinary] destroy failed:", (err as Error).message);
  }
}
