const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const lockfile = require("proper-lockfile");

const { validatePassword } = require("../utils/passwordValidator");

const usersFile = path.join(__dirname, "../data/users.json");

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error("JWT_SECRET missing in .env");
}

const getUsers = () => {
  return JSON.parse(fs.readFileSync(usersFile));
};

const getUsersLocked = async () => {
  const release = await lockfile.lock(usersFile, { retries: 3, stale: 5000 });
  try {
    const data = fs.readFileSync(usersFile, "utf8");
    return { users: JSON.parse(data), release };
  } catch (error) {
    await release();
    throw error;
  }
};

const saveUsersLocked = async (users) => {
  const tempFile = `${usersFile}.tmp`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(users, null, 2), "utf8");
    fs.renameSync(tempFile, usersFile);
  } catch (error) {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors - temp file might not exist
    }
    throw error;
  }
};

const normalizeEmail = (email) => {
  return email ? String(email).trim().toLowerCase() : email;
};

exports.signup = async (req, res) => {
  let release = null;
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    email = normalizeEmail(email);

    const validation = validatePassword(password);

    if (!validation.valid) {
      return res.status(400).json({
        message: validation.message,
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    const { users, release: lockRelease } = await getUsersLocked();
    release = lockRelease;

    const existingUser = users.find(
      (u) => u.email === email
    );

    if (existingUser) {
      await release();
      release = null;
      return res.status(400).json({
        message: "User already exists",
      });
    }

    users.push({
      email,
      password: hashedPassword,
    });

    await saveUsersLocked(users);
    await release();
    release = null;

    const token = jwt.sign({ email }, SECRET, { expiresIn: "7d" });

    res.status(201).json({
      token,
      message: "Signup successful",
    });
  } catch (error) {
    console.error("[signup] error:", error);
    if (release) {
      try {
        await release();
      } catch (releaseError) {
        console.error("[signup] lock release error:", releaseError);
      }
    }
    res.status(500).json({
      message: "Server error",
    });
  }
};

exports.login = async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) {
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
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign({ email: user.email }, SECRET, { expiresIn: "7d" });

    res.json({
      token,
      message: "Login successful",
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};