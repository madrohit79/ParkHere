const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

router.use(authenticateToken, requireRole('platform_admin'));

router.get('/stats', adminController.getAdminStats);
router.get('/providers/pending', adminController.getPendingProviders);
router.post('/organisations/:id/approve', adminController.approveOrganisation);
router.post('/organisations/:id/reject', adminController.rejectOrganisation);
router.post('/owners/:id/approve', adminController.approveOwner);
router.post('/owners/:id/reject', adminController.rejectOwner);

router.get('/users', adminController.getUsers);
router.patch('/users/:id/toggle-active', adminController.toggleUserActive);

router.get('/locations', adminController.getAllLocations);
router.patch('/locations/:id/toggle-active', adminController.toggleLocationActive);

router.get('/bookings', adminController.getAllBookings);

module.exports = router;
