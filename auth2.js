const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Login required." });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired — please log in again." });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, regNumber: user.regNumber, name: user.name, course: user.course, isAdmin: user.isAdmin },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

module.exports = { requireAuth, signToken, JWT_SECRET };
