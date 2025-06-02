const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const {authenticate, authorizeAdmin} = require('../services/auth.middleware')



router.post('/verify-token', authenticate, (req, res) => {
  // Nếu đến được đây, nghĩa là `authenticate` đã thành công và `req.user` có thông tin decoded
  if (req.user && req.user.role === 'admin') {
    return res.status(200).json({ success: true, user: { id: req.user.id, username: req.user.username, role: req.user.role } });
  } else {
    // Token hợp lệ nhưng người dùng không phải admin
    return res.status(403).json({ message: 'Forbidden: Not an admin', user: { id: req.user.id, username: req.user.username, role: req.user.role } });
  }
});
router.get('/',authenticate,authorizeAdmin, userController.getAllUsers);
router.post('/create',authenticate,authorizeAdmin, userController.createUser);
router.delete('/delete/:id',authenticate,authorizeAdmin, userController.deleteUser);
router.post('/login', userController.SignIn);
router.post('/logout', userController.SignOut);
router.post('/signup', userController.SignUp); // << Thêm dòng này


module.exports = router;