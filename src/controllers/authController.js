const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { validatePassword } = require("../utils/passwordValidator");
const { createAuditLogger, hashValue } = require("../utils/auditLogger");

const usersFile = path.join(__dirname, "../data/users.json");

const SECRET = process.env.JWT_SECRET;
const auditLogger = createAuditLogger("gateway-auth");

if (!SECRET) {
  throw new Error("JWT_SECRET missing in .env");
}

const getUsers = () => {
  return JSON.parse(fs.readFileSync(usersFile));
};

const saveUsers = (users) => {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
};

const normalizeEmail = (email) => {
  return email ? String(email).trim().toLowerCase() : email;
};

exports.signup = async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      auditLogger.warn("auth_signup_rejected", {
        outcome: "missing_credentials",
      });
      return res.status(400).json({
        message: "Email and password are required",
      });
    }
    
    email = normalizeEmail(email);

    const validation = validatePassword(password);

    if (!validation.valid) {
      auditLogger.warn("auth_signup_rejected", {
        outcome: "weak_password",
        email_hash: hashValue(email),
      });
      return res.status(400).json({
        message: validation.message,
      });
    }

    const users = getUsers();

    const existingUser = users.find(
      (u) => u.email === email
    );

    if (existingUser) {
      auditLogger.warn("auth_signup_rejected", {
        outcome: "user_exists",
        email_hash: hashValue(email),
      });
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    users.push({
      email,
      password: hashedPassword,
    });

    saveUsers(users);

    const token = jwt.sign({ email }, SECRET, { expiresIn: "7d" });

    res.status(201).json({
      token,
      message: "Signup successful",
    });
    auditLogger.info("auth_signup_succeeded", {
      email_hash: hashValue(email),
    });
  } catch (error) {
    auditLogger.error("auth_signup_failed", {
      error,
    });
    res.status(500).json({
      message: "Server error",
    });
  }
};

exports.login = async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) {
      auditLogger.warn("auth_login_rejected", {
        outcome: "missing_credentials",
      });
      return res.status(400).json({
        message: "Email and password are required",
      });
    }
    
    email = normalizeEmail(email);

    const users = getUsers();

    const user = users.find(
      (u) => u.email === email
    );

    if (!user) {
      auditLogger.warn("auth_login_rejected", {
        outcome: "invalid_credentials",
        email_hash: hashValue(email),
      });
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!isMatch) {
      auditLogger.warn("auth_login_rejected", {
        outcome: "invalid_credentials",
        email_hash: hashValue(email),
      });
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign({ email: user.email }, SECRET, { expiresIn: "7d" });

    res.json({
      token,
      message: "Login successful",
    });
    auditLogger.info("auth_login_succeeded", {
      email_hash: hashValue(user.email),
    });
  } catch (error) {
    auditLogger.error("auth_login_failed", {
      error,
    });
    res.status(500).json({
      message: "Server error",
    });
  }
};