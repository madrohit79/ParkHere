const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/register', authController.register);
router.post('/login', authLimiter, authController.login);
router.get('/me', authenticateToken, authController.getMe);
router.put('/change-password', authenticateToken, authController.changePassword);
router.put('/profile', authenticateToken, authController.updateProfile);

module.exports = router;
