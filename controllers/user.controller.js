const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken')

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password || !role) {
      return res.status(400).json({ message: 'Thiếu thông tin người dùng.' });
    }
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(409).json({ message: 'Username hoặc Email đã tồn tại.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword, role });
    await newUser.save();
    res.status(201).json(newUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const userToDelete = await User.findByIdAndDelete(req.params.id);
    if (!userToDelete) {
      return res.status(404).json({ message: 'Người dùng không tồn tại.' });
    }
    res.json({ message: 'Người dùng đã được xóa.' });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.SignIn = async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ message: 'Người dùng không tồn tại.' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ message: 'Sai mật khẩu.' });

  // *** QUAN TRỌNG: Thêm 'role' vào JWT payload ***
  const token = jwt.sign(
    { id: user._id, username: user.username, role: user.role }, // Payload chứa ID, username, và ROLE
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN } // Thời gian hết hạn từ .env
  );

  // *** QUAN TRỌNG: Gửi token qua HttpOnly cookie ***
  res.cookie('token', token, {
    httpOnly: true, // Ngăn chặn JavaScript client truy cập
    secure: process.env.NODE_ENV === 'production', // Chỉ gửi qua HTTPS trong môi trường production
    maxAge: parseInt(process.env.JWT_COOKIE_EXPIRES_IN_MS || '3600000'), // Thời gian sống của cookie (ví dụ: 1 giờ, cần đặt JWT_COOKIE_EXPIRES_IN_MS trong .env)
    sameSite: 'Lax', // hoặc 'Strict' để bảo vệ chống CSRF, 'Lax' tốt cho các trường hợp cross-site request
    path: '/' // Áp dụng cho toàn bộ domain
  })
  .status(200)
  .json({ message: 'Đăng nhập thành công', user: { id: user._id, username: user.username, role: user.role } });
};

exports.SignOut = async (req, res) => {
    // Nếu bạn sử dụng session hoặc blacklist token, bạn sẽ xử lý ở đây.
    // Đối với JWT không có blacklist, việc xóa cookie là đủ để người dùng logout.
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/'
    });
    res.status(200).json({ message: 'Đăng xuất thành công.' });
};


exports.SignUp = async (req, res) => {
    try {
        const { username, email, password } = req.body; // Người dùng không tự chọn role khi đăng ký

        // 1. Xác thực đầu vào cơ bản (có thể dùng thư viện Joi/express-validator mạnh hơn)
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Vui lòng điền đầy đủ Tên đăng nhập, Email và Mật khẩu.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
        }

        // 2. Kiểm tra trùng lặp username/email
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(409).json({ message: 'Tên đăng nhập hoặc Email đã tồn tại.' });
        }

        // 3. Băm mật khẩu
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Tạo người dùng mới với role mặc định (ví dụ: 'user')
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            role: 'user' // Mặc định role là 'user' cho người đăng ký mới
        });
        await newUser.save();

        // 5. (Tùy chọn) Đăng nhập người dùng ngay sau khi đăng ký thành công
        // Nếu bạn muốn người dùng tự động đăng nhập, bạn có thể tạo và gửi JWT token ở đây
        const token = jwt.sign(
            { id: newUser._id, username: newUser.username, role: newUser.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: parseInt(process.env.JWT_COOKIE_EXPIRES_IN_MS || '3600000'),
            sameSite: 'Lax',
            path: '/'
        })
        .status(201) // 201 Created
        .json({
            message: 'Đăng ký thành công và đã đăng nhập.',
            user: { id: newUser._id, username: newUser.username, email: newUser.email, role: newUser.role }
        });

        // Nếu bạn không muốn tự động đăng nhập, chỉ cần trả về thành công:
        // res.status(201).json({ message: 'Đăng ký thành công, vui lòng đăng nhập.' });

    } catch (err) {
        console.error("Error during signup:", err);
        res.status(500).json({ error: 'Đã xảy ra lỗi khi đăng ký. Vui lòng thử lại.' });
    }
};
