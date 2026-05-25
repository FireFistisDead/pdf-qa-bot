export const checkPasswordStrength = (password) => {
  if (!password) return "";
  if (password.length < 8) {
    return "Weak";
  }

  let score = 0;

  if (password.length >= 8) score++;

  if (/[A-Z]/.test(password)) score++;

  if (/[a-z]/.test(password)) score++;

  if (/\d/.test(password)) score++;

  if (/[@$!%*?&]/.test(password)) score++;

  if (score <= 2) return "Weak";

  if (score <= 4) return "Medium";

  return "Strong";
};