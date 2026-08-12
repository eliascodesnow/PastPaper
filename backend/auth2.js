const jwt = require("jsonwebtoken");
const db = require("./db");

const isProduction = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? null : "dev-secret-change-me");
const JWT_ISSUER = "faculty-papers-api";

if (!JWT_SECRET || (isProduction && JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be set to at least 32 characters in production.");
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  const token = match ? match[1] : null;
  if (!token) return res.status(401).json({ error: "Login required." });

  try {
    const claims = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
    });
    const user = db.getUserById(claims.id);
    if (!user) return res.status(401).json({ error: "Account no longer exists." });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired — please log in again." });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, regNumber: user.regNumber, name: user.name, course: user.course, isAdmin: user.isAdmin },
    JWT_SECRET,
    { expiresIn: "30d", algorithm: "HS256", issuer: JWT_ISSUER }
  );
}

module.exports = { requireAuth, signToken, JWT_SECRET };
