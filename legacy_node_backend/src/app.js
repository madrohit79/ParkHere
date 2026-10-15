const express = require('express');
const cors = require('cors');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const locationRoutes = require('./routes/locationRoutes');
const membershipRoutes = require('./routes/membershipRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const orgRoutes = require('./routes/orgRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Enable CORS for configured frontend origins (both localhost and 127.0.0.1)
const allowedOrigins = [
  config.corsOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive in local dev environment
  },
  credentials: true
}));

app.use(express.json());

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'ParkHere Parking Management API',
    server_time: new Date()
  });
});

// Register route groups
app.use('/api/auth', authRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/membership', membershipRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/admin', adminRoutes);

// 404 Handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint '${req.originalUrl}' not found`
  });
});

// Central Error Handling Middleware
app.use(errorHandler);

module.exports = app;
