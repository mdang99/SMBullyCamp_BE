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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;

    const [pets, total] = await Promise.all([
      Pet.find().skip(skip).limit(limit),
      Pet.countDocuments(),
    ]);

    res.json({
      data: pets,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
    });
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

exports.getPetByCode = async (req, res) => {
    try {
      const pet = await Pet.findOne({ code: req.params.code });
      if (!pet) return res.status(404).json({ message: 'Không tìm thấy thú' });
      res.json(pet);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  exports.getAllCodes = async (req, res) => {
    try {
      // chỉ lấy 2 trường `code` và `name` từ MongoDB
      const pets = await Pet.find({}, "code name gender");

      // trả về đúng định dạng yêu cầu
      const result = pets.map((pet) => ({
        code: pet.code,
        name: pet.name,
        gender: pet.gender
      }));

      res.json(result);
    } catch (err) {
      console.error("Lỗi khi lấy danh sách code-name:", err.message);
      res.status(500).json({ error: err.message });
    }
  };
  