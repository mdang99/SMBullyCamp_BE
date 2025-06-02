// smserver/services/auth.middleware.js
const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  // Cố gắng lấy token từ Authorization header (Bearer token)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // Lưu thông tin người dùng đã giải mã
      return next();
    } catch (err) {
      // Token không hợp lệ (hết hạn, sai chữ ký, v.v.)
      return res.status(403).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
  }

  // Nếu không có Bearer token, thử lấy từ HttpOnly cookie
  // Cần đảm bảo 'cookie-parser' middleware đã được sử dụng trong index.js của bạn
  const tokenFromCookie = req.cookies?.token;
  if (tokenFromCookie) {
    try {
      const decoded = jwt.verify(tokenFromCookie, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(403).json({ message: 'Token từ cookie không hợp lệ hoặc đã hết hạn.' });
    }
  }

  // Nếu không tìm thấy token ở cả hai nơi
  return res.status(401).json({ message: 'Không có token xác thực.' });
};

const authorizeAdmin = (req, res, next) => {
  // `req.user` được thiết lập bởi middleware `authenticate`
  // Đảm bảo `role` được thêm vào JWT payload khi đăng nhập
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Bạn không có quyền truy cập. Yêu cầu quyền Admin.' });
  }
  next(); // Nếu là admin, cho phép tiếp tục
};

module.exports = { authenticate, authorizeAdmin };