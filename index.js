const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const petRoutes = require('./routers/pet.routes');
const userRoutes = require('./routers/user.routes');
dotenv.config();
const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error(err));

// Routes
app.use('/api/pets', petRoutes);
app.use('/api/users', userRoutes);


const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
