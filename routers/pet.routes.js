const express = require('express');
const router = express.Router();
const petController = require('../controllers/pet.controller');
const {authenticate, authorizeAdmin} = require('../services/auth.middleware')


router.post('/',petController.createPet);
router.get('/', petController.getAllPets);
router.get('/:id',petController.getPetById);
router.put('/:id',authenticate, authorizeAdmin, petController.updatePet);
router.delete('/:id',authenticate, authorizeAdmin, petController.deletePet);

module.exports = router;
