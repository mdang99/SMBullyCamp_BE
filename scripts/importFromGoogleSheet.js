const { google } = require('googleapis');
const mongoose = require('mongoose');
require('dotenv').config();
const Pet = require('../models/pet');

// Hàm parse ngày sinh từ DD/MM/YYYY
const parseDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return null;
  
    // Tách theo định dạng DD/MM/YYYY
    const [day, month, year] = dateString.split('/').map(s => parseInt(s));
  
    if (!day || !month || !year) return null;
  
    // Tạo Date ở 00:00:00 giờ UTC (đúng chuẩn cho MongoDB)
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  };
  

async function importFromGoogleSheet() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const sheets = google.sheets({ version: 'v4', auth: process.env.GOOGLE_API_KEY });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: 'Sheet1', // đổi nếu sheet khác tên
  });

  const [headers, ...rows] = res.data.values;

  const data = rows.map(row => {
    const pet = {};
    headers.forEach((h, i) => pet[h] = row[i]);
    return pet;
  });

  const codeToPet = {};
  for (let d of data) {
    // Validate dữ liệu bắt buộc
    if (!d['Code'] || !d['Name'] || !d['Gender'] || !d['Birth Date']) {
      console.warn(`⚠️ Bỏ qua pet do thiếu thông tin: ${d['Code']}`);
      continue;
    }

    // Chuyển Gender nếu cần
    let gender = d['Gender'];
    if (gender.toLowerCase() === 'đực') gender = 'Male';
    if (gender.toLowerCase() === 'cái') gender = 'Female';

    const pet = new Pet({
      code: d['Code'],
      name: d['Name'],
      birthDate: parseDate(d['Birth Date']),
      gender: gender,
      color: d['Color'],
      weight: parseFloat(d['Weight']) || undefined,
      nationality: d['Nationality'],
      certificate: d['Certificate'],
      image: d['Image'],
      note: d['Note']
    });

    try {
      await pet.save();
      codeToPet[pet.code] = pet;
    } catch (err) {
      console.error(`❌ Lỗi khi lưu pet ${d['Code']}:`, err.message);
    }
  }

  // Gán mã cha mẹ từ Parent Code
  for (let d of data) {
    const pet = codeToPet[d['Code']];
    if (!pet || !d['Parent Code']) continue;

    const [fatherRaw, motherRaw] = d['Parent Code'].split(' ');
    const father = fatherRaw?.trim().replace(/[^a-zA-Z0-9\-]/g, '') || null;
    const mother = motherRaw?.trim().replace(/[^a-zA-Z0-9\-]/g, '') || null;

    pet.father = father || null;
    pet.mother = mother || null;
    await pet.save();
  }

  console.log('✅ Done importing from Google Sheets!');
  mongoose.disconnect();
}

importFromGoogleSheet();
