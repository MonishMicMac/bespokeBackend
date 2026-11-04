import {
  validateSignup,
  validateLogin,
  validateProfileUpdate,
  validateForgotPasswordOtp,
  validateForgotPasswordSet,
} from "../validators/userValidator.js";
import {
  signupCustomer,
  loginCustomer,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPasswordWithOtp,
} from "../services/customerAuthService.js";
import {
  getCustomerProfile,
  updateCustomerProfile,
  getUserDetails,
} from "../services/customerProfileService.js";

/**
 * API 1: Customer Signup
 * Method: POST
 * Endpoint: /api/user/signup
 */
export const signup = async (req, res) => {
  try {
    const validation = validateSignup(req.body);
    if (!validation.isValid) {
      return res.status(200).json({
        status: "false",
        message: validation.message,
      });
    }

    const result = await signupCustomer(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("❌ [UsersController::signup] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "An error occurred during signup",
    });
  }
};

/**
 * API 2: Customer Login
 * Method: GET
 * Endpoint: /api/user/login
 */
export const login = async (req, res) => {
  try {
    // Collect parameters from query string (standard for GET) with fallback to body
    const params = { ...req.body, ...req.query };

    const validation = validateLogin(params);
    if (!validation.isValid) {
      return res.status(422).json({
        status: "false",
        message: validation.message,
      });
    }

    const result = await loginCustomer(params);
    return res.status(result.statusCode || 200).json(result.response);
  } catch (error) {
    console.error("❌ [UsersController::login] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "An error occurred during login",
    });
  }
};

/**
 * API 3: Customer Profile View
 * Method: GET
 * Endpoint: /api/user/view/:id
 */
export const view = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getCustomerProfile(id);
    return res.status(result.statusCode || 200).json(result.response);
  } catch (error) {
    console.error("❌ [UsersController::view] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "An error occurred fetching profile",
    });
  }
};

/**
 * Customer Profile Details (with saved addresses & formatted_address)
 * Method: GET
 * Endpoint: /api/user/details/:id
 */
export const details = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getUserDetails(id);
    return res.status(result.statusCode || 200).json(result.response);
  } catch (error) {
    console.error("❌ [UsersController::details] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "An error occurred fetching user details",
    });
  }
};

/**
 * API 4: Customer Profile Update
 * Method: POST
 * Endpoint: /api/user/edit/:id
 */
export const update = async (req, res) => {
  try {
    const { id } = req.params;

    const validation = validateProfileUpdate(req.body);
    if (!validation.isValid) {
      const code = validation.isImageError ? 400 : 200;
      return res.status(code).json({
        status: "false",
        message: validation.message,
      });
    }

    const host = req.get("host");
    const protocol = req.protocol || "http";
    const baseUrl = `${protocol}://${host}`;

    const result = await updateCustomerProfile(id, req.body, baseUrl);
    return res.status(result.statusCode || 200).json(result.response);
  } catch (error) {
    console.error("❌ [UsersController::update] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "An error occurred updating profile",
    });
  }
};

/**
 * API 5: Forgot Password OTP
 * Methods: GET and POST
 * Endpoint: /api/user/forgot/password/otp
 */
export const sendOtp = async (req, res) => {
  try {
    const params = { ...req.body, ...req.query };

    const validation = validateForgotPasswordOtp(params);
    if (!validation.isValid) {
      return res.status(200).json({
        status: "false",
        message: validation.message,
      });
    }

    const result = await sendForgotPasswordOtp(params);
    return res.status(result.statusCode || 200).json(result.response);
  } catch (error) {
    console.error("❌ [UsersController::sendOtp] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "An error occurred sending OTP",
    });
  }
};

/**
 * API 5B: Verify Forgot Password OTP
 * Methods: GET and POST
 * Endpoint: /api/user/forgot/password/verify
 */
export const verifyOtp = async (req, res) => {
  try {
    const params = { ...req.body, ...req.query };
    const result = await verifyForgotPasswordOtp(params);
    return res.status(result.statusCode || 200).json(result.response);
  } catch (error) {
    console.error("❌ [UsersController::verifyOtp] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "An error occurred verifying OTP",
    });
  }
};

/**
 * API 6: Forgot Password Reset
 * Methods: GET and POST
 * Endpoint: /api/user/forgot/password/set
 */
export const resetPassword = async (req, res) => {
  try {
    const params = { ...req.body, ...req.query };

    const validation = validateForgotPasswordSet(params);
    if (!validation.isValid) {
      return res.status(200).json({
        status: "false",
        message: validation.message,
      });
    }

    const result = await resetPasswordWithOtp(params);
    return res.status(result.statusCode || 200).json(result.response);
  } catch (error) {
    console.error("❌ [UsersController::resetPassword] error:", error);
    return res.status(500).json({
      status: "false",
      message: error.message || "An error occurred resetting password",
    });
  }
};

