import s3 from "../../config/s3.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";

export const uploadFileToS3 = async (file) => {
  let buffer = file.buffer;
  let contentType = file.mimetype;
  let extension = file.originalname.split(".").pop().toLowerCase();

  // Convert only images to WebP
  if (file.mimetype.startsWith("image/")) {
    buffer = await sharp(file.buffer)
      .webp({ quality: 80 })
      .toBuffer();

    contentType = "image/webp";
    extension = "webp";
  }

  const originalName = file.originalname
    .replace(/\.[^/.]+$/, "") // remove extension
    .replace(/\s+/g, "-");     // replace spaces

  const fileName = `${uuidv4()}-${originalName}.${extension}`;
  const key = `chatUploads/${fileName}`;

  const result = await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  console.log("Upload successful:", result);

  return key;
};

export default uploadFileToS3;