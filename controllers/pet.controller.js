const Pet = require('../models/pet');

// Thêm thú mới
exports.createPet = async (req, res) => {
  try {
    const pet = new Pet(req.body);
    await pet.save();
    res.status(201).json(pet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Lấy danh sách thú
exports.getAllPets = async (req, res) => {
  try {
    const pets = await Pet.find();
    res.json(pets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Lấy chi tiết 1 thú
exports.getPetById = async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);
    if (!pet) return res.status(404).json({ message: 'Không tìm thấy thú' });
    res.json(pet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cập nhật thông tin thú
exports.updatePet = async (req, res) => {
  try {
    const pet = await Pet.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!pet) return res.status(404).json({ message: 'Không tìm thấy thú' });
    res.json(pet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Xoá thú
exports.deletePet = async (req, res) => {
  try {
    const result = await Pet.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: 'Không tìm thấy thú' });
    res.json({ message: 'Xoá thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
