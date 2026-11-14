import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Op } from "sequelize";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../../config/s3.js";
import UserLogin from "../../models/UserLogin.js";
import UserAddress from "../../models/UserAddress.js";
import { formatCustomerAddress } from "./addressService.js";
import { hashPassword } from "./customerAuthService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * API 3: Customer Profile View
 */
export async function getCustomerProfile(id) {
  const user = await UserLogin.findByPk(id);

  if (!user) {
    return {
      statusCode: 404,
      response: {
        status: "false",
        message: "User not found",
      },
    };
  }

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "User details retrieved successfully",
      data: [
        {
          id: user.id,
          email: user.email,
          username: user.username,
          mobile: user.mobile,
          otp: user.otp,
          address: user.address,
          pincode: user.pincode,
          c_date: user.c_date,
          action: user.action,
          img_path: user.img_path,
        },
      ],
    },
  };
}

/**
 * API 4: Customer Profile Update
 */
export async function updateCustomerProfile(id, data, baseUrl = "", file = null) {
  const user = await UserLogin.findByPk(id);

  if (!user) {
    return {
      statusCode: 200,
      response: {
        status: "false",
        message: "User not found",
      },
    };
  }

  // Unique checks excluding current user ID
  if (data.email !== undefined && data.email !== null && String(data.email).trim() !== "") {
    const cleanEmail = String(data.email).trim().toLowerCase();
    const duplicateEmail = await UserLogin.findOne({
      where: {
        email: cleanEmail,
        id: { [Op.ne]: id },
      },
    });
    if (duplicateEmail) {
      return {
        statusCode: 200,
        response: {
          status: "false",
          message: "The email has already been taken.",
        },
      };
    }
  }

  if (data.mobile !== undefined && data.mobile !== null && String(data.mobile).trim() !== "") {
    const cleanMobile = String(data.mobile).trim();
    const duplicateMobile = await UserLogin.findOne({
      where: {
        mobile: cleanMobile,
        id: { [Op.ne]: id },
      },
    });
    if (duplicateMobile) {
      return {
        statusCode: 200,
        response: {
          status: "false",
          message: "The mobile has already been taken.",
        },
      };
    }
  }

  // Update profile fields if provided in request
  if (data.email !== undefined) {
    user.email = String(data.email).trim().toLowerCase();
  }
  if (data.username !== undefined) {
    user.username = String(data.username).trim();
  } else if (data.name !== undefined) {
    user.username = String(data.name).trim();
  }
  if (data.mobile !== undefined) {
    user.mobile = String(data.mobile).trim();
  }
  if (data.password !== undefined && data.password !== null && String(data.password) !== "") {
    user.password = String(data.password).trim();
  }
  if (data.otp !== undefined) {
    user.otp = data.otp !== null ? String(data.otp) : null;
  }
  if (data.address !== undefined) {
    user.address = data.address;
  }
  if (data.pincode !== undefined) {
    user.pincode = data.pincode !== null ? String(data.pincode) : null;
  }
  if (data.c_date !== undefined) {
    user.c_date = data.c_date;
  }
  if (data.action !== undefined) {
    user.action = String(data.action);
  }
  if (data.dob !== undefined) {
    user.dob = data.dob;
  }
  if (data.gender !== undefined) {
    user.gender = data.gender;
  }
  if (data.prefered_language !== undefined) {
    user.prefered_language = data.prefered_language;
  }

  // Handle Base64 Image Upload
  if (data.image && typeof data.image === "string") {
    const rawImage = data.image.trim();
    const matches = rawImage.match(/^data:image\/(\w+);base64,/);

    if (matches) {
      const declaredType = matches[1].toLowerCase();
      const imageType = declaredType === "jpeg" ? "jpg" : declaredType;
      const allowedTypes = ["png", "jpg", "jpeg", "webp", "gif"];

      if (!allowedTypes.includes(declaredType)) {
        return {
          statusCode: 400,
          response: { status: "false", message: "Invalid image format" },
        };
      }

      const base64Data = rawImage.substring(rawImage.indexOf(",") + 1);
      const buffer = Buffer.from(base64Data, "base64");

      if (!buffer || buffer.length === 0) {
        return {
          statusCode: 400,
          response: { status: "false", message: "Invalid base64 image format" },
        };
      }

      // Max 5MB file size limit
      if (buffer.length > 5 * 1024 * 1024) {
        return {
          statusCode: 400,
          response: { status: "false", message: "Image file exceeds maximum 5MB size limit" },
        };
      }

      const bucketName = process.env.AWS_BUCKET_NAME || "bespoke-2026";
      const region = process.env.AWS_DEFAULT_REGION || "ap-south-1";
      const imageName = `user_${id}_${Date.now()}.${imageType}`;
      const s3Key = `users/${imageName}`;
      const contentType =
        declaredType === "jpg" || declaredType === "jpeg"
          ? "image/jpeg"
          : `image/${declaredType}`;

      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            Body: buffer,
            ContentType: contentType,
          })
        );
        user.img_path = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
        console.log(`✅ [CustomerProfileService] Uploaded avatar to S3: ${user.img_path}`);
      } catch (s3Err) {
        console.error("❌ [CustomerProfileService] S3 upload error, fallback to local:", s3Err);
        const uploadDir = path.resolve(__dirname, "../../uploads/users");
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        fs.writeFileSync(path.join(uploadDir, imageName), buffer);
        const resolvedBase = baseUrl ? baseUrl.replace(/\/$/, "") : "";
        user.img_path = `${resolvedBase}/uploads/users/${imageName}`;
      }
    } else {
      return {
        statusCode: 400,
        response: { status: "false", message: "Invalid image format" },
      };
    }
  }

  // Handle Multipart File Upload if present
  if (file && file.buffer) {
    try {
      const bucketName = process.env.AWS_BUCKET_NAME || "bespoke-2026";
      const region = process.env.AWS_DEFAULT_REGION || "ap-south-1";
      const ext = file.originalname ? file.originalname.split(".").pop().toLowerCase() : "png";
      const imageName = `user_${id}_${Date.now()}.${ext}`;
      const s3Key = `users/${imageName}`;
      const contentType = file.mimetype || "image/png";

      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: file.buffer,
          ContentType: contentType,
        })
      );
      user.img_path = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
      console.log(`✅ [CustomerProfileService] Multipart avatar uploaded to S3: ${user.img_path}`);
    } catch (s3Err) {
      console.error("❌ [CustomerProfileService] Multipart S3 upload error:", s3Err);
    }
  }

  await user.save();

  // Sanitize user for response (hide password)
  const userData = user.toJSON();
  delete userData.password;

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "User updated successfully",
      data: [userData],
    },
  };
}

/**
 * Customer Detailed Profile with Saved Addresses & formatted_address
 * Reproduces Laravel UsersController::userDetails
 */
export async function getUserDetails(id) {
  const user = await UserLogin.findByPk(id);

  if (!user) {
    return {
      statusCode: 404,
      response: {
        status: "false",
        message: "User not found",
      },
    };
  }

  // Saved Addresses (action != '1')
  const rawAddresses = await UserAddress.findAll({
    where: {
      user_id: String(id),
      action: { [Op.ne]: "1" },
    },
    order: [["id", "DESC"]],
  });

  const addresses = rawAddresses.map((addr) => formatCustomerAddress(addr));

  const userData = user.toJSON();
  delete userData.password;

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "User details retrieved successfully",
      data: {
        user_details: userData,
        addresses,
      },
    },
  };
}

export async function deleteCustomerAccount(id) {
  const user = await UserLogin.findByPk(id);
  if (!user) {
    return {
      statusCode: 404,
      response: {
        status: "false",
        message: "User not found",
      },
    };
  }

  user.action = "1";
  await user.save();

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "Account deleted successfully",
    },
  };
}



