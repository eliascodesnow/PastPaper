// Keep the repository-root entry point compatible with the package start command.
require('./backend/index');
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./auth");
const paperRoutes = require("./papers");

const app = express();
// compression is optional; avoid startup failure if the package isn't installed
try {
  const compression = require("compression");
  app.use(compression());
} catch (err) {
  console.warn("compression not available — responses will not be gzipped");
}
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, service: "faculty-papers-api" }));
app.use("/api/auth", authRoutes);
app.use("/api/papers", paperRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Faculty Papers API running on port ${PORT}`));
