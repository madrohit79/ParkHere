const express = require('express');
const router = express.Router();
const ownerController = require('../controllers/ownerController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

router.use(authenticateToken, requireRole('owner'));

router.get('/profile', ownerController.getOwnerProfile);

module.exports = router;
