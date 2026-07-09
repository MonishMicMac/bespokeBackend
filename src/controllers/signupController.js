import User from "../../models/signup.js";
import crypto from "crypto";

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

        // Encrypt password

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