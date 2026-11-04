import sequelize from "../../config/db.js";
import { QueryTypes } from "sequelize";
import { verifyPassword } from "../services/customerAuthService.js";

/**
 * Customer Authentication Controller
 * Uses table `user_login`
 */

// 1. Customer Registration
export const registerCustomer = async (req, res) => {
  try {
    const { name, username, email, mobile, password } = req.body;

    const displayName = (name || username || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanMobile = (mobile || "").trim();
    const cleanPassword = (password || "").trim();

    if (!displayName || !cleanEmail || !cleanPassword) {
      return res.status(400).json({
        status: false,
        message: "Name, email, and password are required.",
      });
    }

    // Check if user with same email or mobile already exists
    const [existing] = await sequelize.query(
      `SELECT id, email, mobile FROM user_login 
       WHERE LOWER(email) = ? OR (mobile IS NOT NULL AND mobile != '' AND mobile = ?)
       LIMIT 1`,
      {
        replacements: [cleanEmail, cleanMobile || "___none___"],
        type: QueryTypes.SELECT,
      }
    );

    if (existing) {
      if (existing.email && existing.email.toLowerCase() === cleanEmail) {
        return res.status(409).json({
          status: false,
          message: "An account with this email already exists. Please login instead.",
        });
      }
      if (cleanMobile && existing.mobile === cleanMobile) {
        return res.status(409).json({
          status: false,
          message: "An account with this mobile number already exists. Please login instead.",
        });
      }
    }

    // Insert new user into user_login table
    const [insertResult] = await sequelize.query(
      `INSERT INTO user_login (username, email, mobile, password, action, created_at, updated_at, c_date)
       VALUES (?, ?, ?, ?, '0', NOW(), NOW(), NOW())`,
      {
        replacements: [displayName, cleanEmail, cleanMobile || null, cleanPassword],
        type: QueryTypes.INSERT,
      }
    );

    const newUserId = insertResult;

    // Also mirror into Customer table for compatibility
    try {
      await sequelize.query(
        `INSERT INTO Customer (id, name, email, mobile_number, password, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE name = VALUES(name), mobile_number = VALUES(mobile_number)`,
        {
          replacements: [newUserId, displayName, cleanEmail, cleanMobile || null, cleanPassword],
          type: QueryTypes.INSERT,
        }
      );
    } catch (custErr) {
      console.warn("Notice: Customer table mirror insert skipped:", custErr.message);
    }

    const userData = {
      id: newUserId,
      username: displayName,
      name: displayName,
      email: cleanEmail,
      mobile: cleanMobile,
    };

    console.log(`👤 [Auth] New customer registered successfully: #${newUserId} (${displayName})`);

    return res.status(201).json({
      status: true,
      message: "Registration successful! Welcome to Bespoke.",
      user: userData,
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Registration failed due to server error.",
    });
  }
};

// 2. Customer Login
export const loginCustomer = async (req, res) => {
  try {
    const { identifier, email, mobile, password } = req.body;

    const loginId = (identifier || email || mobile || "").trim();
    const cleanPassword = (password || "").trim();

    if (!loginId || !cleanPassword) {
      return res.status(400).json({
        status: false,
        message: "Email/Mobile/Username and password are required.",
      });
    }

    // Lookup user in user_login by email, mobile, or username (case-insensitive)
    const [user] = await sequelize.query(
      `SELECT id, username, email, mobile, password, img_path, action, is_banned, address, pincode, gender, dob
       FROM user_login
       WHERE (LOWER(email) = LOWER(?) OR mobile = ? OR LOWER(username) = LOWER(?))
       LIMIT 1`,
      {
        replacements: [loginId, loginId, loginId],
        type: QueryTypes.SELECT,
      }
    );

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "No account found in user_login matching this email, mobile, or username.",
      });
    }

    if (user.is_banned === "1") {
      return res.status(403).json({
        status: false,
        message: "This account has been suspended. Please contact customer support.",
      });
    }

    if (user.action === "1") {
      return res.status(403).json({
        status: false,
        message: "This account is inactive or deactivated.",
      });
    }

    // Verify password (supports both plain-text legacy and bcrypt hashes)
    if (!user.password) {
      await sequelize.query(
        `UPDATE user_login SET password = ?, updated_at = NOW() WHERE id = ?`,
        {
          replacements: [cleanPassword, user.id],
          type: QueryTypes.UPDATE,
        }
      );
      console.log(`🔑 [Auth] Set password for user #${user.id} (${user.username}) in user_login`);
    } else {
      const isMatch = await verifyPassword(cleanPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({
          status: false,
          message: "Invalid credentials. Please check your password and try again.",
        });
      }
    }

    const userData = {
      id: user.id,
      username: user.username,
      name: user.username,
      email: user.email,
      mobile: user.mobile,
      img_path: user.img_path,
      address: user.address,
      pincode: user.pincode,
    };

    console.log(`🔐 [Auth] Customer authenticated via user_login: #${user.id} (${user.username})`);

    return res.json({
      status: true,
      message: `Welcome back, ${user.username}!`,
      user: userData,
    });
  } catch (error) {
    console.error("❌ Login error in user_login:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Login failed due to server error.",
    });
  }
};

// 3. Get Customer Profile
export const getCustomerProfile = async (req, res) => {
  try {
    const userId = req.params.id || req.query.id;
    if (!userId) {
      return res.status(400).json({ status: false, message: "User ID is required." });
    }

    const [user] = await sequelize.query(
      `SELECT id, username, email, mobile, img_path, address, pincode, gender, dob
       FROM user_login WHERE id = ? LIMIT 1`,
      {
        replacements: [userId],
        type: QueryTypes.SELECT,
      }
    );

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found." });
    }

    return res.json({
      status: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.username,
        email: user.email,
        mobile: user.mobile,
        img_path: user.img_path,
        address: user.address,
        pincode: user.pincode,
        gender: user.gender,
        dob: user.dob,
      },
    });
  } catch (error) {
    console.error("❌ Profile error:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

