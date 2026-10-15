const express = require('express');
const router = express.Router();
const orgController = require('../controllers/orgController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole, requireApprovedProvider } = require('../middleware/requireRole');

router.use(authenticateToken, requireRole('org_admin'));

router.get('/profile', orgController.getOrgProfile);

// Protected by approval
router.get('/members', requireApprovedProvider, orgController.getMembers);
router.post('/members', requireApprovedProvider, orgController.addMember);
router.put('/members/:id', requireApprovedProvider, orgController.updateMember);
router.patch('/members/:id/toggle-active', requireApprovedProvider, orgController.toggleMemberActive);

module.exports = router;
