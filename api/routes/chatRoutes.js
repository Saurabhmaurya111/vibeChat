import express from 'express';
import { getChatRoom , getMessages } from '../controllers/chatController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/messages' , authMiddleware, getMessages);
router.post('/chat-room' , authMiddleware, getChatRoom);

export default router;