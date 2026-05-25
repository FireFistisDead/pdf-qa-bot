const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

function validatePassword(password) {
  if (!PASSWORD_REGEX.test(password)) {
    return {
      valid: false,
      message:
        "Password must contain uppercase, lowercase, number, special character and minimum 8 characters.",
    };
  }

  return {
    valid: true,
    message: "Strong password",
  };
}

module.exports = {
  validatePassword,
};