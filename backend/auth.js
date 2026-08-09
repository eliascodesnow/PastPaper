const express = require('express');
const bcrypt = require('bcryptjs');
const { resolveRegNumber } = require('./regFormat');
const { signToken } = require('./auth2');
const db = require('./db');

const router = express.Router();

router.post('/check-reg-number', (req, res) => {
  const { regNumber } = req.body;
  const result = resolveRegNumber(regNumber);
  res.json(result);
});

router.post('/register', async (req, res) => {
  const { regNumber, name, password } = req.body;
  if (!regNumber || !name || !password) return res.status(400).json({ error: 'Registration number, name, and password are all required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const resolved = resolveRegNumber(regNumber);
  if (!resolved.valid) return res.status(400).json({ error: "That registration number doesn't match a recognised faculty format." });

  const existing = await db.getUserByRegNumber(resolved.regNumber);
  if (existing) return res.status(409).json({ error: 'An account with this registration number already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.createUser({ regNumber: resolved.regNumber, name, passwordHash, course: resolved.course });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { regNumber, password } = req.body;
  if (!regNumber || !password) return res.status(400).json({ error: 'Registration number and password are required.' });

  const user = await db.getUserByRegNumber((regNumber || '').trim().toUpperCase());
  if (!user) return res.status(401).json({ error: 'No account found for that registration number.' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect password.' });

  res.json({ token: signToken(user), user: publicUser(user) });
});

function publicUser(user) { return { id: user.id, regNumber: user.regNumber, name: user.name, course: user.course, isAdmin: !!user.isAdmin }; }

module.exports = router;