const mongoose = require('mongoose');

const petSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },      // Unique Pet Code
  name: { type: String, required: true },                    // Pet Name
  gender: { type: String, enum: ['Male', 'Female'], required: true }, // Gender (in English)
  birthDate: { type: Date, required: true },                 // Date of Birth
  color: { type: String },                                   // Color / Breed
  weight: { type: Number },                                  // Weight in kg
  father: { type: String },                                  // Father's Code
  mother: { type: String },                                  // Mother's Code
  nationality: { type: String },                             // Country
  certificate: { type: String },                             // Certificate: VBR, IBKC...
  image: { type: String },                                   // Image URL
  note: { type: String }                                     // Optional note
}, { timestamps: true });

module.exports = mongoose.model('Pet', petSchema);
