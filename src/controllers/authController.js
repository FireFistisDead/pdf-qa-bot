const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { dbRun, dbGet } = require('../db/db');
const { logEvent } = require('../services/security/audit');
const { validatePassword } = require('../utils/passwordValidator');

const SECRET = process.env.JWT_SECRET || 'fallback_secret_for_development';

const normalizeEmail = (email) => {
  return email ? String(email).trim().toLowerCase() : email;
};

exports.signup = async (req, res) => {
  try {
    let { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    email = normalizeEmail(email);

    const validation = validatePassword(password);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const existingUser = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = randomUUID();

    await dbRun(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      [userId, email, hashedPassword]
    );

    await logEvent('user_registered', { userId, email });

    const token = jwt.sign({ id: userId, email }, SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      message: 'Signup successful',
      user: { id: userId, email }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    email = normalizeEmail(email);

    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      await logEvent('login_failed', { email, reason: 'user_not_found' });
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logEvent('login_failed', { email, userId: user.id, reason: 'invalid_password' });
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '7d' });

    await logEvent('login_success', { userId: user.id, email: user.email });

    res.json({
      token,
      message: 'Login successful',
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};