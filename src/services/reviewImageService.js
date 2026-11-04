import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../../config/s3.js";
import buildFileUrl from "../utils/fileUrl.js";

const S3_BUCKET = process.env.AWS_BUCKET_NAME || "bespoke-2026";
const REVIEW_IMAGES_FOLDER = "reviews/images";

class ReviewImageService {
  /**
   * Validate if a buffer contains valid image data using Sharp.
   *
   * @param {Buffer} buffer
   * @returns {Promise<{isValid: boolean, format: string|null, error: string|null}>}
   */
  static async validateImageBuffer(buffer) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return { isValid: false, format: null, error: "Empty or invalid buffer" };
    }

    try {
      const metadata = await sharp(buffer).metadata();
      const allowedFormats = ["jpeg", "jpg", "png", "webp", "gif", "avif", "tiff"];
      if (!metadata.format || !allowedFormats.includes(metadata.format.toLowerCase())) {
        return {
          isValid: false,
          format: metadata.format || null,
          error: `Unsupported image format: ${metadata.format || "unknown"}`,
        };
      }
      return { isValid: true, format: metadata.format.toLowerCase(), error: null };
    } catch (err) {
      return { isValid: false, format: null, error: err.message };
    }
  }

  /**
   * Parse and validate a base64 string.
   * Accepts both Data URL formatted ("data:image/png;base64,...") and raw base64.
   *
   * @param {string} base64String
   * @returns {{buffer: Buffer, mime: string|null}}
   */
  static parseBase64(base64String) {
    if (typeof base64String !== "string" || !base64String.trim()) {
      throw new Error("Base64 image string is empty or invalid");
    }

    const trimmed = base64String.trim();
    let mime = null;
    let rawBase64 = trimmed;

    if (trimmed.includes(",")) {
      const parts = trimmed.split(",");
      const header = parts[0];
      rawBase64 = parts[1];

      const match = header.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64$/i);
      if (match) {
        mime = match[1];
      }
    }

    // Verify it is base64 characters
    const cleanBase64 = rawBase64.replace(/\s/g, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
      throw new Error("Malformed base64 character sequence");
    }

    const buffer = Buffer.from(cleanBase64, "base64");
    if (!buffer || buffer.length === 0) {
      throw new Error("Decoded base64 image data is empty");
    }

    return { buffer, mime };
  }

  /**
   * Convert buffer to WebP (quality 80) using Sharp.
   *
   * @param {Buffer} buffer
   * @param {number} [quality=80]
   * @returns {Promise<Buffer>}
   */
  static async convertToWebP(buffer, quality = 80) {
    return await sharp(buffer)
      .webp({ quality })
      .toBuffer();
  }

  /**
   * Upload an image buffer to S3 (or fallback to local disk if S3 is unavailable).
   *
   * @param {Buffer} buffer
   * @param {string} [extension='webp']
   * @param {string} [contentType='image/webp']
   * @returns {Promise<string>} The storage relative key (e.g., 'reviews/images/xyz.webp')
   */
  static async uploadBufferToS3(buffer, extension = "webp", contentType = "image/webp") {
    const randomName = crypto.randomBytes(16).toString("hex");
    const key = `${REVIEW_IMAGES_FOLDER}/${randomName}.${extension}`;

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );
      return key;
    } catch (s3Error) {
      // In offline / test environments, fallback to storing locally
      const localDir = path.resolve(process.cwd(), "uploads", REVIEW_IMAGES_FOLDER);
      fs.mkdirSync(localDir, { recursive: true });
      const localFilePath = path.join(localDir, `${randomName}.${extension}`);
      fs.writeFileSync(localFilePath, buffer);
      return key;
    }
  }

  /**
   * Process and upload a multipart file (from multer).
   * Converts to WebP and uploads to S3.
   *
   * @param {Object} file Express/Multer file object
   * @returns {Promise<string>}
   */
  static async processAndUploadFile(file) {
    if (!file || !file.buffer) {
      throw new Error("Invalid file upload");
    }

    const validation = await this.validateImageBuffer(file.buffer);
    if (!validation.isValid) {
      throw new Error(validation.error || "Invalid image file");
    }

    const webpBuffer = await this.convertToWebP(file.buffer, 80);
    return await this.uploadBufferToS3(webpBuffer, "webp", "image/webp");
  }

  /**
   * Process and upload a base64 image string.
   * Converts to WebP and uploads to S3.
   *
   * @param {string} base64String
   * @returns {Promise<string>}
   */
  static async processAndUploadBase64(base64String) {
    const { buffer } = this.parseBase64(base64String);
    const validation = await this.validateImageBuffer(buffer);
    if (!validation.isValid) {
      throw new Error(validation.error || "Invalid image file format");
    }

    const webpBuffer = await this.convertToWebP(buffer, 80);
    return await this.uploadBufferToS3(webpBuffer, "webp", "image/webp");
  }

  /**
   * Rollback uploaded S3 keys on transaction failure.
   *
   * @param {Array<string>} keys
   */
  static async deleteS3Keys(keys = []) {
    if (!Array.isArray(keys) || keys.length === 0) return;

    for (const key of keys) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
          })
        );
      } catch (e) {
        // Silently catch delete failures on cleanup
      }

      // Also clean up local file if stored
      try {
        const localPath = path.resolve(process.cwd(), "uploads", key);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      } catch (e) {
        // Ignore
      }
    }
  }

  /**
   * Resolve full public URL for an image path.
   *
   * @param {string|null} imagePath
   * @returns {string|null}
   */
  static getImageUrl(imagePath) {
    return buildFileUrl(imagePath);
  }
}

export default ReviewImageService;
export { ReviewImageService };

