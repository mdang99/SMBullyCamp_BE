const Pet = require("../models/pet");
const path = require("path");

// import hàm sync
const importFromGoogleSheet = require(path.join(
  __dirname,
  "..",
  "scripts",
  "importFromGoogleSheet"
));

let isSyncing = false;

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

// Lấy danh sách thú (có phân trang)
exports.getAllPets = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const {
      searchCode = "",
      searchName = "",
      gender,
      color,
      weight,
      nationality,
      certificate,
    } = req.query;

    // Xây query động
    const query = {};

    // Search: code và name dùng regex
    if (searchCode) {
      query.code = { $regex: searchCode, $options: "i" };
    }

    if (searchName) {
      query.name = { $regex: searchName, $options: "i" };
    }

    if (gender && gender !== "all") {
      query.gender = gender;
    }

    if (color && color !== "all") {
      query.color = color;
    }

    if (nationality && nationality !== "all") {
      query.nationality = nationality;
    }

    if (certificate && certificate !== "all") {
      query.certificate = certificate;
    }

    // Xử lý filter cân nặng (weight là number, FE gửi string)
    if (weight && weight !== "all") {
      switch (weight) {
        case "Dưới 10kg":
          query.weight = { $lt: 10 };
          break;
        case "10 - 15kg":
          query.weight = { $gte: 10, $lte: 15 };
          break;
        case "15 - 20kg":
          query.weight = { $gte: 15, $lte: 20 };
          break;
        case "20 - 25kg":
          query.weight = { $gte: 20, $lte: 25 };
          break;
        case "Trên 25kg":
          query.weight = { $gt: 25 };
          break;
      }
    }

    const [pets, total] = await Promise.all([
      Pet.find(query).skip(skip).limit(limit),
      Pet.countDocuments(query),
    ]);

    res.json({
      data: pets,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
    });
  } catch (err) {
    console.error("Lỗi khi lấy danh sách thú:", err);
    res.status(500).json({ error: err.message });
  }
};
  

// Lấy chi tiết 1 thú theo _id
exports.getPetById = async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);
    if (!pet) return res.status(404).json({ message: "Không tìm thấy thú" });
    res.json(pet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cập nhật thông tin thú
exports.updatePet = async (req, res) => {
  try {
    const pet = await Pet.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!pet) return res.status(404).json({ message: "Không tìm thấy thú" });
    res.json(pet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Xoá thú
exports.deletePet = async (req, res) => {
  try {
    const result = await Pet.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: "Không tìm thấy thú" });
    res.json({ message: "Xoá thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Lấy thú theo code
exports.getPetByCode = async (req, res) => {
  try {
    const pet = await Pet.findOne({ code: req.params.code });
    if (!pet) return res.status(404).json({ message: "Không tìm thấy thú" });
    res.json(pet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Lấy danh sách code + name (+ gender) để build select cha/mẹ, v.v.
exports.getAllCodes = async (req, res) => {
  try {
    const pets = await Pet.find({}, "code name gender");
    const result = pets.map((p) => ({
      code: p.code,
      name: p.name,
      gender: p.gender,
    }));
    res.json(result);
  } catch (err) {
    console.error("Lỗi khi lấy danh sách code-name:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Đồng bộ từ Google Sheet
exports.syncFromSheet = async (req, res) => {
  if (isSyncing) {
    return res.status(429).json({ error: "Đang đồng bộ, vui lòng đợi..." });
  }

  isSyncing = true;
  try {
    // importFromGoogleSheet nên trả về { inserted, skipped, errors } (nếu bạn đã code như vậy)
    const result = await importFromGoogleSheet();
    return res.json({
      message: "Đồng bộ xong!",
      ...result,
    });
  } catch (err) {
    console.error("Sync error:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    isSyncing = false;
  }
};

exports.getChildrenByParentCode = async (req, res) => {
  try {
    const { parentCode } = req.query;
    if (!parentCode) {
      return res.status(400).json({ error: "Missing parentCode" });
    }

    const children = await Pet.find({
      $or: [{ father: parentCode }, { mother: parentCode }],
    });
    res.json({ data: children });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


