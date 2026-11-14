import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../config/s3.js";
import UserLogin from "../models/UserLogin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const filePath = path.resolve(__dirname, "../uploads/users/user_76_1793784680658.png");
  if (!fs.existsSync(filePath)) {
    console.log("File not found on disk:", filePath);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const bucketName = process.env.AWS_BUCKET_NAME || "bespoke-2026";
  const region = process.env.AWS_DEFAULT_REGION || "ap-south-1";
  const s3Key = "users/user_76_1793784680658.png";

  console.log(`Uploading ${filePath} to s3://${bucketName}/${s3Key}...`);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: "image/png",
    })
  );

  const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
  console.log("Uploaded successfully:", s3Url);

  const user = await UserLogin.findByPk(76);
  if (user) {
    user.img_path = s3Url;
    await user.save();
    console.log("User 76 img_path updated in DB to:", s3Url);
  }

  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});

