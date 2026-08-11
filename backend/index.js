require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./auth');
const paperRoutes = require('./papers');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the static frontend files kept at the project root.
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'faculty-papers-api' }));
app.use('/api/auth', authRoutes);
app.use('/api/papers', paperRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Faculty Papers API running on port ${PORT}`));
