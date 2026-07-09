import { sendMail } from "../services/mailService.js";

export const sendOrderMail = async (req, res) => {
  try {
    await sendMail(
      "logu098ab@gmail.com",
      "Order Confirmation",
      `
      <h2>Order Confirmed</h2>
      <p>Hello Logeswari</p>
      `
    );

    return res.json({
      success: true,
      message: "Email sent successfully"
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json(err);
  }
};