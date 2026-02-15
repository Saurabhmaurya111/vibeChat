import express from 'express';
import {createServer} from 'http';

import {connectDB} from './config/db.js';

import userRoutes from './routes/user_Routes.js';
import chatRoutes from './routes/chatRoutes.js';

connectDB();

const app = express();
app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);

app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});