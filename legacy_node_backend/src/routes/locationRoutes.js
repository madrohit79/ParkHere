const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { requireRole, requireApprovedProvider } = require('../middleware/requireRole');

// Public lookup routes
router.get('/facilities', locationController.getFacilitiesMaster);
router.get('/', optionalAuth, locationController.searchLocations);
router.get('/mine', authenticateToken, requireRole('org_admin', 'owner', 'platform_admin'), locationController.getProviderLocations);
router.get('/:id', optionalAuth, locationController.getLocationDetail);

// Provider write routes (requires approved provider)
router.post('/', authenticateToken, requireRole('org_admin', 'owner'), requireApprovedProvider, locationController.createLocation);
router.put('/:id', authenticateToken, requireRole('org_admin', 'owner'), requireApprovedProvider, locationController.updateLocation);
router.put('/:id/tariff', authenticateToken, requireRole('org_admin', 'owner'), requireApprovedProvider, locationController.updateTariff);
router.put('/:id/facilities', authenticateToken, requireRole('org_admin', 'owner'), requireApprovedProvider, locationController.updateFacilities);

module.exports = router;
