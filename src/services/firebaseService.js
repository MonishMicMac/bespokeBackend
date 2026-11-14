import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import UserLogin from "../../models/UserLogin.js";
import VendorLogin from "../../models/VendorLogin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let messagingInstance = null;
let isInitialized = false;

/**
 * Initialize Firebase Admin SDK safely (Singleton)
 */
function initFirebase() {
  if (isInitialized && messagingInstance) {
    return messagingInstance;
  }

  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      messagingInstance = getMessaging(existingApps[0]);
      isInitialized = true;
      return messagingInstance;
    }

    const keyPath =
      process.env.FIREBASE_CREDENTIALS_PATH ||
      path.resolve(__dirname, "../../storage/firebase/firebase-private-key.json");

    if (!fs.existsSync(keyPath)) {
      console.warn("⚠️ [Firebase] Key file not found at:", keyPath, "- push notifications will be disabled");
      return null;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || "bespoke-a395a",
    });

    messagingInstance = getMessaging(app);
    isInitialized = true;
    console.log("🔥 [Firebase] Admin SDK initialized for project:", serviceAccount.project_id);
    return messagingInstance;
  } catch (err) {
    console.error("❌ [Firebase Init Error]:", err.message);
    return null;
  }
}

// Initialize on module load
initFirebase();

/**
 * Helper to mask FCM token for logs
 */
function maskToken(token) {
  if (!token || typeof token !== "string") return "empty";
  return token.length > 15 ? `${token.substring(0, 10)}...${token.slice(-5)}` : `${token.substring(0, 5)}...`;
}

class FirebaseService {
  /**
   * Send FCM Push Notification to a device token.
   * Guaranteed never to throw; returns true on success, false on failure.
   *
   * @param {string|null} deviceToken
   * @param {string} title
   * @param {string} body
   * @param {Object} data
   * @returns {Promise<boolean>}
   */
  static async sendPushNotification(deviceToken, title, body, data = {}) {
    try {
      if (!deviceToken || typeof deviceToken !== "string" || !deviceToken.trim()) {
        console.log("ℹ️ [Firebase Push] Empty or invalid device token, skipping.", { title });
        return false;
      }

      const messaging = initFirebase();
      if (!messaging) {
        console.warn("⚠️ [Firebase Push] Messaging not initialized, skipping push notification.");
        return false;
      }

      // Convert all data values to string as required by FCM v1
      const stringData = {};
      if (data && typeof data === "object") {
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined && value !== null) {
            stringData[String(key)] = typeof value === "object" ? JSON.stringify(value) : String(value);
          }
        }
      }

      if (!stringData.click_action) {
        stringData.click_action = "FLUTTER_NOTIFICATION_CLICK";
      }

      const messagePayload = {
        token: deviceToken.trim(),
        notification: {
          title: String(title || "Notification"),
          body: String(body || ""),
        },
        data: stringData,
        android: {
          priority: "high",
          notification: {
            channelId: "default",
            sound: "default",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
            },
          },
        },
      };

      const response = await messaging.send(messagePayload);
      console.log("🚀 [Firebase Push SUCCESS]:", {
        token_preview: maskToken(deviceToken),
        title,
        messageId: response,
      });
      return true;
    } catch (error) {
      const errCode = error?.code || error?.errorInfo?.code;
      console.warn("⚠️ [Firebase Push Failed]:", {
        token_preview: maskToken(deviceToken),
        title,
        code: errCode,
        message: error.message,
      });

      // If token is invalid or unregistered, we could optionally clear it
      if (
        errCode === "messaging/registration-token-not-registered" ||
        errCode === "messaging/invalid-registration-token"
      ) {
        console.log(`ℹ️ [Firebase Token Stale]: ${maskToken(deviceToken)}`);
      }
      return false;
    }
  }

  /**
   * Send notification to a vendor's mobile device by vendor ID
   */
  static async sendVendorNotification(vendorId, title, message, data = {}) {
    try {
      if (!vendorId) return false;

      const vendor = await VendorLogin.findByPk(vendorId);
      if (!vendor) {
        console.log(`ℹ️ [Firebase Vendor] Vendor #${vendorId} not found`);
        return false;
      }

      if (!vendor.fcm || !vendor.fcm.trim()) {
        console.log(`ℹ️ [Firebase Vendor] Vendor #${vendorId} (${vendor.shop_name}) has no FCM token registered`);
        return false;
      }

      const payloadData = {
        vendor_id: String(vendorId),
        title: String(title),
        message: String(message),
        ...data,
      };

      return await this.sendPushNotification(vendor.fcm, title, message, payloadData);
    } catch (err) {
      console.error(`❌ [Firebase Vendor Error] #${vendorId}:`, err.message);
      return false;
    }
  }

  /**
   * Send notification to a customer's mobile device by user ID
   */
  static async sendCustomerNotification(userId, title, message, data = {}) {
    try {
      if (!userId) return false;

      const user = await UserLogin.findByPk(userId);
      if (!user) {
        console.log(`ℹ️ [Firebase Customer] User #${userId} not found`);
        return false;
      }

      if (!user.fcm || !user.fcm.trim()) {
        console.log(`ℹ️ [Firebase Customer] User #${userId} (${user.username}) has no FCM token registered`);
        return false;
      }

      const payloadData = {
        user_id: String(userId),
        title: String(title),
        message: String(message),
        ...data,
      };

      return await this.sendPushNotification(user.fcm, title, message, payloadData);
    } catch (err) {
      console.error(`❌ [Firebase Customer Error] #${userId}:`, err.message);
      return false;
    }
  }

  /**
   * Send new order notification to a vendor's mobile device
   */
  static async sendOrderNotificationToVendor(vendorId, orderId, orderCode) {
    const code = orderCode || `ORD${orderId}`;
    return await this.sendVendorNotification(
      vendorId,
      "New Order Received",
      `You have received a new order #${code}`,
      {
        type: "order",
        order_id: String(orderId),
        order_code: String(code),
      }
    );
  }

  /**
   * Update FCM token for a user or vendor (Laravel API parity)
   */
  static async updateFcmToken({ userId, fcm, type = "user" }) {
    if (!userId || !fcm) {
      return { status: false, message: "user_id and fcm token are required" };
    }

    if (type === "vendor") {
      const vendor = await VendorLogin.findByPk(userId);
      if (!vendor) {
        return { status: false, message: "Vendor not found" };
      }
      vendor.fcm = String(fcm).trim();
      await vendor.save();
      return { success: true, status: true, message: "Vendor FCM token updated successfully" };
    }

    const user = await UserLogin.findByPk(userId);
    if (!user) {
      return { status: false, message: "User not found" };
    }
    user.fcm = String(fcm).trim();
    await user.save();
    return { success: true, status: true, message: "FCM token updated successfully" };
  }
}

export default FirebaseService;

