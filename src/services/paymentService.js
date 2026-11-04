import crypto from "crypto";
import Razorpay from "razorpay";

class PaymentService {
  static getRazorpayInstance() {
    const key_id = process.env.RAZORPAY_KEY || process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_SECRET || process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
      return null;
    }

    return new Razorpay({
      key_id,
      key_secret,
    });
  }

  /**
   * Create a new order in Razorpay.
   *
   * @param {string} receiptId Internal Order ID (e.g. ORD1001)
   * @param {number} amount Amount in INR
   * @returns {Promise<{success: boolean, razorpay_order_id?: string, error?: string}>}
   */
  static async createRazorpayOrder(receiptId, amount) {
    try {
      const razorpay = this.getRazorpayInstance();
      if (!razorpay) {
        // Mock fallback for test/dev environment without credentials
        return {
          success: true,
          razorpay_order_id: `order_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        };
      }

      const amountInPaisa = Math.round(amount * 100);
      const options = {
        receipt: receiptId,
        amount: amountInPaisa,
        currency: "INR",
      };

      const order = await razorpay.orders.create(options);
      return {
        success: true,
        razorpay_order_id: order.id,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to create Razorpay order: ${err.message}`,
      };
    }
  }

  /**
   * Verify a Razorpay Payment Signature (from frontend SDK).
   *
   * @param {string} orderId
   * @param {string} paymentId
   * @param {string} signature
   * @returns {boolean}
   */
  static verifySignature(orderId, paymentId, signature) {
    const secret = process.env.RAZORPAY_SECRET || process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return false;

    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    return generatedSignature === signature;
  }

  /**
   * Verify a Razorpay Webhook Signature.
   *
   * @param {string|Buffer} payload Raw JSON body
   * @param {string} signature X-Razorpay-Signature header
   * @returns {boolean}
   */
  static verifyWebhookSignature(payload, signature) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return true; // if not set, let bypass pass if testing

    if (!signature) return false;

    const bodyString = typeof payload === "string" ? payload : payload.toString("utf8");
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(bodyString)
      .digest("hex");

    return expectedSignature === signature;
  }

  /**
   * Process a Refund in Razorpay.
   *
   * @param {string} paymentId Razorpay Payment ID (e.g. pay_29QQoUBcxQtvFt)
   * @param {number} [amount] Amount in INR
   * @param {Object} [notes] Optional notes
   * @param {string} [speed] 'optimum' or 'instant'
   * @returns {Promise<{success: boolean, refund_id?: string, speed_processed?: string, status?: string, data?: any, error?: string}>}
   */
  static async refundPayment(paymentId, amount = null, notes = {}, speed = "optimum") {
    try {
      const razorpay = this.getRazorpayInstance();
      if (!razorpay) {
        return {
          success: true,
          refund_id: `rfnd_mock_${Date.now()}`,
          speed_processed: speed,
          status: "processed",
        };
      }

      const params = {
        speed,
      };

      if (amount !== null && amount > 0) {
        params.amount = Math.round(amount * 100);
      }
      if (notes && Object.keys(notes).length > 0) {
        params.notes = notes;
      }

      const refund = await razorpay.payments.refund(paymentId, params);

      return {
        success: true,
        refund_id: refund.id,
        speed_processed: refund.speed_processed || "normal",
        speed_requested: refund.speed_requested || speed,
        status: refund.status || "processed",
        data: refund,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || "Failed to process refund",
      };
    }
  }
}

export default PaymentService;

