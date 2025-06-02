const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const petRoutes = require('./routers/pet.routes');
const userRoutes = require('./routers/user.routes');
const cookieParser = require('cookie-parser'); // Import cookie-parser
const cors = require('cors'); // Import cors

dotenv.config();
const app = express();
// --- Middlewares ---
app.use(express.json()); // Để đọc body JSON từ request
app.use(cookieParser()); // Để phân tích cú pháp và xử lý cookies trong request

// Cấu hình CORS
// Đảm bảo rằng process.env.FRONTEND_URL được định nghĩa trong file .env của backend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Cho phép các domain frontend cụ thể truy cập
  credentials: true, // RẤT QUAN TRỌNG: Cho phép gửi và nhận cookies giữa các domain
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Các phương thức HTTP được phép
  allowedHeaders: ['Content-Type', 'Authorization'], // Các headers được phép gửi đi
}));

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error(err));

// Routes
app.use('/api/pets', petRoutes);
app.use('/api/users', userRoutes);

// --- Xử lý lỗi (Optional nhưng được khuyến nghị) ---
// Middleware xử lý lỗi 404 (Not Found) cho các route không tồn tại
app.use((req, res, next) => {
  res.status(404).json({ message: 'API Route Not Found' });
});

// Global error handler
// Đây là middleware cuối cùng, nó sẽ bắt tất cả các lỗi được ném ra từ các route/middleware khác
app.use((err, req, res, next) => {
  console.error(err.stack); // Ghi log lỗi để debug
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || 'An unexpected error occurred!',
    error: process.env.NODE_ENV === 'development' ? err : {} // Trả về chi tiết lỗi trong dev, ẩn trong production
  });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
