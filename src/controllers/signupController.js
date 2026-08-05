import User from "../../models/signup.js";
import crypto from "crypto";
import { sendMail } from "../services/mailService.js";

export const signup = async (req, res) => {

  
    try {

 const { username, email, mobile, password, shop_name, gst_no, pan_no } = req.body;

        // Check existing user
        const user = await User.findOne({
            where: { email }
        });

        if (user) {
            return res.status(400).json({
                success: false,
                message: "Email already exists"
            });
        }


        // Save user
        const newUser = await User.create({
            username,
            email,
            mobile,
            password,
            shop_name,
            gst_no,
            pan_no
        });

        // Send welcome email
        try {
            await sendMail(
                email,
                "Welcome to Bespoke!",
                `<h2>Welcome ${username}!</h2><p>Your registration as a vendor on Bespoke was successful.</p>`
            );
            console.log(`📨 Welcome email sent to ${email}`);
        } catch (mailErr) {
            console.error("❌ Failed to send welcome email:", mailErr);
            // We do not fail the request if just the email fails, but we log the error
        }

        return res.status(201).json({
            success: true,
            message: "Signup Successful",
            data: newUser
        });

    } catch (err) {

        console.log(err);

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

};