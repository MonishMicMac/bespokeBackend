import Razorpay from "razorpay";
import crypto from "crypto";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY,
    key_secret: process.env.RAZORPAY_SECRET,
});

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

    const refund = await razorpay.payments.refund(paymentId, params);

    return refund;
};

export const processRefund = createRefund;