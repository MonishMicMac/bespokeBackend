import FirebaseService from "../services/firebaseService.js";
import UserLogin from "../../models/UserLogin.js";
import VendorLogin from "../../models/VendorLogin.js";

/**
 * Update FCM device token for a user or vendor
 * POST /api/update-fcm and POST /update-fcm
 * Body: { fcm, user_id, type = 'user'|'vendor' }
 * Also supports: { fcm_token, id }
 */
export const userupdatefcm = async (req, res) => {
  try {
    const fcm = req.body.fcm || req.body.fcm_token;
    const userId = req.body.user_id || req.body.id || req.body.userId;
    const type = (req.body.type || "user").toLowerCase().trim();

    if (!fcm || !userId) {
      return res.status(200).json({
        status: "false",
        success: false,
        message: "fcm and user_id are required",
      });
    }

    const result = await FirebaseService.updateFcmToken({ userId, fcm, type });

    return res.status(200).json({
      success: result.status ? "true" : "false",
      status: result.status,
      message: result.message,
    });
  } catch (error) {
    console.error("❌ Error updating FCM token:", error);
    return res.status(500).json({
      status: "false",
      success: false,
      message: error.message || "Failed to update FCM token",
    });
  }
};

/**
 * Send notification between customer and vendor (PHP parity)
 * POST /api/send-notification and POST /send-notification
 * Body: { sender_type: 'user'|'vendor', message, sender_id, receiver_id, time }
 */
export const sendNotification = async (req, res) => {
  try {
    const { sender_type, message, sender_id, receiver_id, time } = req.body;

    if (!sender_type || !message || !sender_id || !receiver_id) {
      return res.status(422).json({
        status: false,
        message: "sender_type, message, sender_id, and receiver_id are required",
      });
    }

    let senderName = "User";
    let senderImageUrl = "";
    let deviceToken = null;

    if (sender_type === "user") {
      const user = await UserLogin.findByPk(sender_id);
      const vendor = await VendorLogin.findByPk(receiver_id);
      senderName = user?.username || "User";
      senderImageUrl = user?.img_path || "";
      deviceToken = vendor?.fcm || null;
    } else {
      const user = await UserLogin.findByPk(receiver_id);
      const vendor = await VendorLogin.findByPk(sender_id);
      senderName = vendor?.shop_name || "Vendor";
      senderImageUrl = vendor?.img_path || "";
      deviceToken = user?.fcm || null;
    }

    const title = senderName;
    const data = {
      sender_name: senderName,
      message,
      time: time || new Date().toISOString(),
      sender_image: senderImageUrl,
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    };

    const success = await FirebaseService.sendPushNotification(deviceToken, title, message, data);

    return res.status(200).json({
      success,
      status: success,
      message: success ? "Notification sent" : "Failed to send notification or recipient has no device token",
    });
  } catch (error) {
    console.error("❌ Error sending notification:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to send notification",
    });
  }
};

/**
 * Send push notification to a vendor directly (PHP parity)
 * POST /api/send-vendor-notification and POST /send-vendor-notification
 * Body: { vendor_id, id, title, message, data }
 */
export const sendVendorNotification = async (req, res) => {
  try {
    const vendorId = req.body.vendor_id || req.body.id;
    const message = req.body.message;
    const title = req.body.title || "New Notification";
    let extraData = req.body.data || {};

    if (!vendorId || !message) {
      return res.status(422).json({
        status: false,
        message: "vendor_id and message are required",
      });
    }

    if (typeof extraData === "string") {
      try {
        extraData = JSON.parse(extraData);
      } catch {
        extraData = { info: extraData };
      }
    }

    const vendor = await VendorLogin.findByPk(vendorId);
    if (!vendor) {
      return res.status(404).json({
        status: false,
        message: `Vendor with ID ${vendorId} not found in database`,
      });
    }

    if (!vendor.fcm || !vendor.fcm.trim()) {
      return res.status(400).json({
        status: false,
        message: `Vendor #${vendorId} (${vendor.shop_name}) does not have an FCM device token registered. Please update FCM token first.`,
      });
    }

    const success = await FirebaseService.sendVendorNotification(vendorId, title, message, extraData);

    return res.status(200).json({
      status: success,
      success,
      message: success ? "Push notification sent successfully" : "Failed to send push notification. Check server logs.",
      vendor: {
        id: vendor.id,
        shop_name: vendor.shop_name,
        fcm_preview: vendor.fcm ? `${vendor.fcm.substring(0, 10)}...` : null,
      },
    });
  } catch (error) {
    console.error("❌ Error sending vendor notification:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to send vendor notification",
    });
  }
};

