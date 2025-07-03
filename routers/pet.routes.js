const express = require('express');
const router = express.Router();
const petController = require('../controllers/pet.controller');
const { authenticate, authorizeAdmin } = require('../services/auth.middleware');

// ROUTES
router.post('/create', petController.createPet);
router.get('/', petController.getAllPets);

router.get('/code/:code', petController.getPetByCode);
router.get('/:id', petController.getPetById);
router.get('/codes/all', petController.getAllCodes); // Thêm dòng này

router.put('/:id', authenticate, authorizeAdmin, petController.updatePet);
router.delete('/:id', authenticate, authorizeAdmin, petController.deletePet);

module.exports = router;
