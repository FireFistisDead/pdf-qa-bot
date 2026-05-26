const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { validatePassword } = require("../utils/passwordValidator");

const usersFile = path.join(__dirname, "../data/users.json");

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error("JWT_SECRET missing in .env");
}

const getUsers = () => {
  return JSON.parse(fs.readFileSync(usersFile));
};

const saveUsers = (users) => {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
};

exports.signup = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const validation = validatePassword(password);

    if (!validation.valid) {
      return res.status(400).json({
        message: validation.message,
      });
    }

    const users = getUsers();

    const existingUser = users.find(
      (u) => u.email === email
    );

    if (existingUser) {
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

    const token = jwt.sign(
      { email },
      SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.status(201).json({
      token,
      message: "Signup successful",
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

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

    const token = jwt.sign(
      { email: user.email },
      SECRET,
      {
        expiresIn: "7d",
      }
    );

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