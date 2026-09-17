import Razorpay from "razorpay";
import crypto from "crypto";

const getRazorpayInstance = () => {
    const key_id = process.env.RAZORPAY_KEY || process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_SECRET || process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
        throw new Error("Razorpay credentials not configured. Please set RAZORPAY_KEY and RAZORPAY_SECRET in your .env file.");
    }

    return new Razorpay({
        key_id,
        key_secret,
    });
};

export const createRefund = async ({
    paymentId,
    amount,
    orderId,
}) => {
    if (!paymentId) {
        throw new Error("Razorpay payment ID is required");
    }

    if (!amount || amount <= 0) {
        throw new Error("Refund amount must be greater than 0");
    }

    const params = {
        amount: Math.round(amount * 100), // INR -> paise
        notes: {
            order_id: String(orderId),
        },
        receipt: `refund_${orderId}_${Date.now()}`,
        speed: "normal",
    };

    const razorpay = getRazorpayInstance();
    const refund = await razorpay.payments.refund(paymentId, params);

    return refund;
};

export const processRefund = createRefund;