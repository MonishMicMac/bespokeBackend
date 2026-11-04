import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import UserLogin from "../../models/UserLogin.js";
import CustomerMeasurement from "../../models/CustomerMeasurement.js";
import { sendMail } from "./mailService.js";

/**
 * Checks whether a password hash is an existing bcrypt hash
 */
export function isBcryptHash(str) {
  if (!str || typeof str !== "string") return false;
  return /^\$2[ayb]\$[0-9]{2}\$[A-Za-z0-9./]{53}$/.test(str);
}

/**
 * Transitional verification:
 * Handles both legacy plain-text passwords and modern bcrypt hashes
 */
export async function verifyPassword(plainPassword, storedPassword) {
  if (!storedPassword || !plainPassword) return false;
  if (isBcryptHash(storedPassword)) {
    const normalizedHash = storedPassword.replace(/^\$2y\$/, "$2a$");
    return bcrypt.compare(String(plainPassword), normalizedHash);
  }
  return String(plainPassword) === String(storedPassword);
}

/**
 * Hashes password securely with bcrypt
 */
export async function hashPassword(plainPassword) {
  return bcrypt.hash(String(plainPassword), 10);
}

/**
 * Generates a 6-digit OTP
 */
export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * API 1: Customer Signup
 */
export async function signupCustomer({ username, mobile, email }) {
  const cleanUsername = String(username).trim();
  const cleanMobile = String(mobile).trim();
  const cleanEmail = String(email).trim().toLowerCase();

  // 1. Existing user by email where password IS NULL (pending account)
  const existingUserByEmail = await UserLogin.findOne({
    where: {
      email: cleanEmail,
      password: null,
    },
  });

  if (existingUserByEmail) {
    const otp = generateOtp();
    existingUserByEmail.username = cleanUsername;
    existingUserByEmail.mobile = cleanMobile;
    existingUserByEmail.otp = otp;
    existingUserByEmail.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await existingUserByEmail.save();

    return {
      status: "true",
      message: "Mobile number updated and OTP sent to your email.",
      data: {
        id: existingUserByEmail.id,
        username: existingUserByEmail.username,
        mobile: existingUserByEmail.mobile,
        email: existingUserByEmail.email,
        otp: String(otp),
      },
    };
  }

  // 2. Check if mobile number already exists
  const existingUserByMobile = await UserLogin.findOne({
    where: { mobile: cleanMobile },
  });

  if (existingUserByMobile && existingUserByMobile.password) {
    return {
      status: "false",
      message: "Account already exists with a password.",
    };
  }

  if (existingUserByMobile) {
    const otp = generateOtp();
    existingUserByMobile.email = cleanEmail;
    existingUserByMobile.username = cleanUsername;
    existingUserByMobile.otp = otp;
    existingUserByMobile.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await existingUserByMobile.save();

    return {
      status: "true",
      message: "OTP has been updated and sent to your email.",
      otp: Number(otp),
    };
  }

  // Check if an account already exists with this email and has a password
  const existingWithEmailAndPassword = await UserLogin.findOne({
    where: { email: cleanEmail },
  });
  if (existingWithEmailAndPassword) {
    return {
      status: "false",
      message: "Account already exists with this email.",
    };
  }

  // 3. Create new user
  const otp = generateOtp();
  const newUser = await UserLogin.create({
    username: cleanUsername,
    mobile: cleanMobile,
    email: cleanEmail,
    otp: String(otp),
    otp_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    action: "0",
    is_banned: "0",
  });

  return {
    status: "true",
    message: "User created successfully",
    data: {
      id: newUser.id,
      username: newUser.username,
      mobile: newUser.mobile,
      email: newUser.email,
      otp: String(otp),
    },
  };
}

/**
 * API 2: Customer Login
 */
export async function loginCustomer({ mobile, email, password, fcm_token }) {
  const cleanMobile = mobile !== undefined ? String(mobile).trim() : "";
  const cleanEmail = email !== undefined ? String(email).trim().toLowerCase() : "";
  const cleanPassword = String(password);

  // Search criteria matching original PHP:
  // where (mobile = $mobile or email = $mobile or email = $email)
  const orConditions = [];
  if (cleanMobile) {
    orConditions.push({ mobile: cleanMobile });
    orConditions.push({ email: cleanMobile });
  }
  if (cleanEmail) {
    orConditions.push({ email: cleanEmail });
  }

  const userCandidates = await UserLogin.findAll({
    where: {
      [Op.or]: orConditions,
    },
  });

  if (!userCandidates || userCandidates.length === 0) {
    return {
      statusCode: 200,
      response: { status: "false", message: "User Login Invalid" },
    };
  }

  let matchedUser = null;
  for (const candidate of userCandidates) {
    const isMatch = await verifyPassword(cleanPassword, candidate.password);
    if (isMatch) {
      matchedUser = candidate;
      break;
    }
  }

  if (!matchedUser) {
    return {
      statusCode: 200,
      response: { status: "false", message: "User Login Invalid" },
    };
  }

  // Check if banned
  if (String(matchedUser.is_banned) === "1" || matchedUser.is_banned === 1) {
    const remarks = matchedUser.banned_remarks && matchedUser.banned_remarks.trim() !== ""
      ? matchedUser.banned_remarks
      : null;
    const bannedMessage = remarks
      ? `Your account has been banned: ${remarks}`
      : "Your account has been banned. Please contact admin.";

    return {
      statusCode: 403,
      response: {
        status: "false",
        is_banned: 1,
        message: bannedMessage,
        banned_remarks: remarks,
      },
    };
  }

  // Update FCM if provided
  if (fcm_token && String(fcm_token).trim() !== "") {
    matchedUser.fcm = String(fcm_token).trim();
  }

  // Transitional bcrypt rehash if legacy password matched
  if (!isBcryptHash(matchedUser.password)) {
    matchedUser.password = await hashPassword(cleanPassword);
  }

  // Generate OTP and 10 minute expiry
  const otp = generateOtp();
  matchedUser.otp = otp;
  matchedUser.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await matchedUser.save();

  // Check customer measurements existence
  const measurementCount = await CustomerMeasurement.count({
    where: { cust_id: matchedUser.id },
  });
  const hasMeasurement = measurementCount > 0;

  // Sanitize user object (strictly strip password hash for security)
  const userData = matchedUser.toJSON();
  delete userData.password;
  userData.has_measurement = hasMeasurement;
  userData.is_measurement = hasMeasurement;

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "User Login successfully",
      data: userData,
      otp: String(otp),
      has_measurement: hasMeasurement,
      is_measurement: hasMeasurement,
    },
  };
}

/**
 * API 5: Forgot Password OTP
 */
export async function sendForgotPasswordOtp({ email, mobile, identifier }) {
  const input = String(identifier || email || mobile || "").trim();
  const cleanInput = input.toLowerCase();

  const user = await UserLogin.findOne({
    where: {
      [Op.or]: [
        { email: cleanInput },
        { mobile: input },
        { username: cleanInput },
      ],
    },
  });

  if (!user) {
    return {
      statusCode: 200,
      response: { status: "false", message: "User not found" },
    };
  }

  // Check if banned
  if (String(user.is_banned) === "1" || user.is_banned === 1) {
    const remarks = user.banned_remarks && user.banned_remarks.trim() !== ""
      ? user.banned_remarks
      : null;
    const bannedMessage = remarks
      ? `Your account has been banned: ${remarks}`
      : "Your account has been banned. Please contact admin.";

    return {
      statusCode: 403,
      response: {
        status: "false",
        is_banned: 1,
        message: bannedMessage,
        banned_remarks: remarks,
      },
    };
  }

  const otp = generateOtp();
  user.otp = String(otp);
  user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await user.save();

  // Attempt email delivery safely if valid email
  if (user.email && user.email.includes("@") && !user.email.endsWith("@example.com")) {
    try {
      await sendMail(
        user.email,
        "Password Reset OTP",
        `<p>Your OTP is: <strong>${otp}</strong>. It is valid for 10 minutes.</p>`
      );
    } catch (err) {
      console.warn("Notice: OTP email delivery skipped/failed:", err.message);
    }
  }

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "OTP sent successfully",
      otp: String(otp),
      email: user.email,
      mobile: user.mobile,
    },
  };
}

/**
 * API 6: Forgot Password Reset
 */
export async function resetPasswordWithOtp({ email, mobile, identifier, new_password, otp }) {
  const input = String(identifier || email || mobile || "").trim();
  const cleanInput = input.toLowerCase();
  const cleanNewPassword = String(new_password);

  const user = await UserLogin.findOne({
    where: {
      [Op.or]: [
        { email: cleanInput },
        { mobile: input },
        { username: cleanInput },
      ],
    },
  });

  if (!user) {
    return {
      statusCode: 200,
      response: { status: "false", message: "User not found" },
    };
  }

  // Security check: Verify OTP if provided or required
  if (otp !== undefined && otp !== null && String(otp).trim() !== "") {
    if (String(user.otp).trim() !== String(otp).trim()) {
      return {
        statusCode: 200,
        response: { status: "false", message: "Invalid OTP" },
      };
    }
  }

  // Check if OTP has expired
  if (user.otp_expires_at) {
    const expiryTime = new Date(user.otp_expires_at).getTime();
    if (!isNaN(expiryTime) && Date.now() > expiryTime) {
      return {
        statusCode: 200,
        response: {
          status: "false",
          message: "OTP has expired. Please request a new one.",
        },
      };
    }
  }

  user.password = await hashPassword(cleanNewPassword);
  user.otp = null;
  user.otp_expires_at = null;
  await user.save();

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "Password Changed Successfully",
    },
  };
}

/**
 * API 5B: Verify Forgot Password OTP
 */
export async function verifyForgotPasswordOtp({ email, mobile, identifier, otp }) {
  const input = String(identifier || email || mobile || "").trim();
  const cleanInput = input.toLowerCase();
  const cleanOtp = String(otp || "").trim();

  if (!cleanOtp) {
    return {
      statusCode: 200,
      response: { status: "false", message: "OTP is required" },
    };
  }

  const user = await UserLogin.findOne({
    where: {
      [Op.or]: [
        { email: cleanInput },
        { mobile: input },
        { username: cleanInput },
      ],
    },
  });

  if (!user) {
    return {
      statusCode: 200,
      response: { status: "false", message: "User not found" },
    };
  }

  if (String(user.otp).trim() !== cleanOtp) {
    return {
      statusCode: 200,
      response: { status: "false", message: "Invalid OTP. Please check the code and try again." },
    };
  }

  if (user.otp_expires_at) {
    const expiryTime = new Date(user.otp_expires_at).getTime();
    if (!isNaN(expiryTime) && Date.now() > expiryTime) {
      return {
        statusCode: 200,
        response: {
          status: "false",
          message: "OTP has expired. Please request a new one.",
        },
      };
    }
  }

  return {
    statusCode: 200,
    response: {
      status: "true",
      message: "OTP verified successfully",
    },
  };
}

