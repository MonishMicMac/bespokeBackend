import transporter from "../../config/mail.js";

export const sendMail = async (to, subject, html) => {

  const info = await transporter.sendMail({
    from: `"Bespoke" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });

  return info;
};