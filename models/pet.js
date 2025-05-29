const mongoose = require('mongoose');

const petSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // Mã định danh
  name: { type: String, required: true },               // Tên
  age: { type: Number, required: true },                // Tuổi
  breed: { type: String, required: true },              // Giống
  gender: { type: String, enum: ['Đực', 'Cái'], required: true }, // Giới tính
  father: { type: String },                             // Mã cha (code)
  mother: { type: String },                             // Mã mẹ (code)
  image: { type: String },                              // URL hình ảnh
  vaccinated: { type: Boolean, default: false },        // Đã tiêm vaccine chưa
  note: { type: String }                                // Ghi chú
}, { timestamps: true });

module.exports = mongoose.model('Pet', petSchema);
