const express = require("express");
const router = express.Router();
const petController = require("../controllers/pet.controller");
const { authenticate, authorizeAdmin } = require("../services/auth.middleware");

// ROUTES
router.post("/create", authenticate, authorizeAdmin, petController.createPet);
router.get("/", petController.getAllPets);

router.get("/code/:code", petController.getPetByCode);
router.get("/codes/all", petController.getAllCodes);

router.put("/:id", authenticate, authorizeAdmin, petController.updatePet);
router.delete("/:id", authenticate, authorizeAdmin, petController.deletePet);

// ➕ Thêm route đồng bộ từ Google Sheet
router.post("/sync", authenticate, authorizeAdmin, petController.syncFromSheet);
router.get(
  "/children",
  petController.getChildrenByParentCode
);


module.exports = router;
