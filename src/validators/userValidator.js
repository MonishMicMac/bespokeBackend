/**
 * User Request Validators
 * Matches Laravel UsersController validation rules and error formats
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup(data) {
  const { username, mobile, email } = data || {};

  if (!username || typeof username !== "string" || username.trim() === "") {
    return { isValid: false, message: "The username field is required." };
  }
  if (username.length > 255) {
    return { isValid: false, message: "The username may not be greater than 255 characters." };
  }

  if (!mobile || (typeof mobile !== "string" && typeof mobile !== "number") || String(mobile).trim() === "") {
    return { isValid: false, message: "The mobile field is required." };
  }
  if (String(mobile).trim().length > 15) {
    return { isValid: false, message: "The mobile may not be greater than 15 characters." };
  }

  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return { isValid: false, message: "The email must be a valid email address." };
  }

  return { isValid: true };
}

export function validateLogin(data) {
  const mobile = data?.mobile !== undefined ? String(data.mobile).trim() : "";
  const email = data?.email !== undefined ? String(data.email).trim() : "";
  const password = data?.password !== undefined ? String(data.password) : "";

  if (!mobile && !email) {
    return { isValid: false, message: "Mobile number or email is required" };
  }

  if (!password) {
    return { isValid: false, message: "Password is required" };
  }

  return { isValid: true };
}

export function validateProfileUpdate(data) {
  if (data?.email !== undefined && data.email !== null && String(data.email).trim() !== "") {
    if (!EMAIL_REGEX.test(String(data.email).trim())) {
      return { isValid: false, message: "The email must be a valid email address." };
    }
  }

  if (data?.password !== undefined && data.password !== null) {
    if (typeof data.password !== "string" || data.password.length < 8) {
      return { isValid: false, message: "The password must be at least 8 characters." };
    }
  }

  if (data?.mobile !== undefined && data.mobile !== null && String(data.mobile).trim() !== "") {
    if (String(data.mobile).trim().length > 15) {
      return { isValid: false, message: "The mobile may not be greater than 15 characters." };
    }
  }

  if (data?.dob !== undefined && data.dob !== null && String(data.dob).trim() !== "") {
    const dobDate = new Date(data.dob);
    if (isNaN(dobDate.getTime())) {
      return { isValid: false, message: "The dob is not a valid date." };
    }
  }

  if (data?.gender !== undefined && data.gender !== null && String(data.gender).trim() !== "") {
    const allowed = ["Male", "Female", "Others"];
    if (!allowed.includes(String(data.gender).trim())) {
      return { isValid: false, message: "The selected gender is invalid." };
    }
  }

  if (data?.image !== undefined && data.image !== null && String(data.image).trim() !== "") {
    const isBase64Image = /^data:image\/(\w+);base64,/.test(String(data.image).trim());
    if (!isBase64Image) {
      return { isValid: false, message: "Invalid image format", isImageError: true };
    }
  }

  return { isValid: true };
}

export function validateForgotPasswordOtp(data) {
  const input = data?.identifier || data?.email || data?.mobile;
  const val = input !== undefined && input !== null ? String(input).trim() : "";
  if (!val) {
    return { isValid: false, message: "Email or mobile number is required." };
  }
  return { isValid: true };
}

export function validateForgotPasswordSet(data) {
  const input = data?.identifier || data?.email || data?.mobile;
  const val = input !== undefined && input !== null ? String(input).trim() : "";
  if (!val) {
    return { isValid: false, message: "Email or mobile number is required." };
  }

  const newPassword = data?.new_password !== undefined ? String(data.new_password) : "";
  if (!newPassword || newPassword.trim() === "") {
    return { isValid: false, message: "The new password field is required." };
  }

  return { isValid: true };
}

