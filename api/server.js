import express from "express";
import { createServer, get } from "http";

import { connectDB } from "./config/db.js";

import userRoutes from "./routes/user_Routes.js";
import chatRoutes from "./routes/chatRoutes.js";
import { Server } from "socket.io";
import { getRoomId } from "./utils/chatHelper.js";
import {
  createMessage,
  getUserLastSeen,
  markMessagesAsRead,
  getUndeliveredMessages,
  markMessageAsDelivered,
  updateMessageStatus,
  updateUserLastSeen,
} from "./services/chat_Services.js";

import User from "./models/user.js";
import Message from "./models/message.js";

connectDB();

const app = express();
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("New Client connected", socket.id);

  let currentUserId = null;

  socket.on("register_user", ({ userId }) => {
    if (!userId) return;

    currentUserId = userId;
    onlineUsers.set(userId, socket.id);

    console.log(`User ${userId} registered with socket ID ${socket.id}`);

    checkPendingMessages();
  });

  socket.on("join_room", async ({ userId, partnerId }) => {
    if (!userId || !partnerId) {
      console.log("Invalid join_room request: missing userId or partnerId");
      return;
    }
    currentUserId = userId;
    onlineUsers.set(userId, socket.id);

    const roomId = getRoomId(userId, partnerId);
    socket.join(roomId);

    console.log(`User ${userId} joined room ${roomId}`);

    try {
      const undeliveredMessages = await getUndeliveredMessages(
        userId,
        partnerId,
      );
      const undeliveredCount = await markMessageAsDelivered(userId, partnerId);

      if (undeliveredCount > 0) {
        console.log(
          `Marked ${undeliveredCount} messages as delivered for ${userId}`,
        );

        undeliveredMessages.forEach((message) => {
          io.to(roomId).emit("message_status", {
            messageId: message.messageId,
            status: "delivered",
            sender: message.sender,
            receiver: message.receiver,
          });
        });
      }

      io.to(roomId).emit("user_status", {
        userId: userId,
        status: "online",
      });
      if (onlineUsers.has(partnerId)) {
        socket.emit("user_status", {
          userId: partnerId,
          status: "online",
        });
      } else {
        const lastSeen = await getUserLastSeen(partnerId);
        socket.emit("user_status", {
          userId: partnerId,
          status: "offline",
          lastSeen: lastSeen || new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error handling join_room:", error);
    }
  });

  socket.on("send_message", async ({ message }) => {
    if (
      !message.message ||
      !message.sender ||
      !message.receiver ||
      !message.messageId
    ) {
      console.error("Invalid message format :", message);
      return;
    }
    const roomId = getRoomId(message.sender, message.receiver);

    await createMessage({
      ...message,
      status: "sent",
      roomId: roomId,
    });
    console.log(
      `Message in room ${roomId} from ${message.sender} to ${message.receiver}: ${message.message}`,
    );

    if (onlineUsers.has(message.receiver)) {
      message.status = "delivered";
      await updateMessageStatus(message.messageId, "delivered");
    } else {
      message.status = "sent";
    }
    io.to(roomId).emit("new_message", message);

    if (onlineUsers.has(message.receiver)) {
      const receiverSocketId = onlineUsers.get(message.receiver);
      const receiverSocket = io.sockets.sockets.get(receiverSocketId);
      if (receiverSocket && !receiverSocket.rooms.has(roomId)) {
        const sender = await User.findById(message.sender).select("username");

        receiverSocket.emit("new_message_notification", {
          senderId: message.sender,
          senderName: sender.username,
          message: message.messageId,
          message: message.message,
        });
      }
    }
  });

  const typingTimeouts = new Map();

  socket.on("typing_start", ({ userId, receiverId }) => {
    if (!userId || !receiverId) return;

    const roomId = getRoomId(userId, receiverId);
    const key = `${userId}_${receiverId}`;

    if (typingTimeouts.has(key)) {
      clearTimeout(typingTimeouts.get(key));
    }
    socket.to(roomId).emit("typing_indicator", {
      userId,
      isTyping: true,
    });

    const timeout = setTimeout(() => {
      socket.to(roomId).emit("typing_indicator", {
        userId,
        isTyping: false,
      });
      typingTimeouts.delete(key);
    }, 5000);
    typingTimeouts.set(key, timeout);
  });

  socket.on("typing_end", ({ userId, receiverId }) => {
    if (!userId || !receiverId) return;

    const roomId = getRoomId(userId, receiverId);
    const key = `${userId}_${receiverId}`;

    if (typingTimeouts.has(key)) {
      clearTimeout(typingTimeouts.get(key));
      typingTimeouts.delete(key);
    }
    socket.to(roomId).emit("typing_indicator", {
      userId,
      isTyping: false,
    });
  });

  socket.on(
    "message_delivered",
    async ({ messageId, senderId, receiverId }) => {
      try {
        await updateMessageStatus(messageId, "delivered");
        const roomId = getRoomId(senderId, receiverId);

        const statusUpdate = {
          messageId: messageId,
          status: "delivered",
          sender: senderId,
          receiver: receiverId,
        };
        io.to(roomId).emit("message_status", statusUpdate);
      } catch (error) {}
    },
  );

  socket.on("messages_read", async ({ messageIds, senderId, receiverId }) => {
    try {
      for (const messageId of messageIds) {
        await updateMessageStatus(messageId, "read");
      }
      const roomId = getRoomId(senderId, receiverId);

      messageIds.forEach((messageId) => {
        const statusUpdate = {
          messageId: messageId,
          status: "read",
          sender: senderId,
          receiver: receiverId,
        };
        io.to(roomId).emit("message_status", statusUpdate);
      });
    } catch (error) {}
  });

  socket.on("mark_messages_read", async ({ userId, partnerId }) => {
    try {
      var count = await markMessagesAsRead(userId, partnerId);

      if (count > 0) {
        const roomId = getRoomId(senderId, receiverId);
        io.to(roomId).emit("messages_all_read", {
          reader: userId,
          sender: partnerId,
        });
      }

      if (onlineUsers.has(partnerId)) {
        const senderSocketId = onlineUsers.get(partnerId);
        const senderSocket = io.sockets.sockets.get(senderSocketId);

        if (senderSocket && !senderSocket.rooms.has(roomId)) {
          senderSocket.emit("message_all_read", {
            reader: userId,
            sender: partnerId,
          });
        }
      }
    } catch (error) {}
  });

  socket.on("user_status_change", async ({ userId, status, lastSeen }) => {
    if (status === "offline") {
      await updateUserLastSeen(userId, lastSeen);

      if (onlineUsers.get(userId) === socket.id) {
        onlineUsers.delete(userId);
      }

      io.emit("user_status", {
        userId: userId,
        status: "offline",
        lastSeen: lastSeen,
      });
    } else {
      onlineUsers.set(userId, socket.id);
      io.emit("user_status", {
        userId: userId,
        status: "online",
      });
    }
  });

  socket.on("disconnect", async () => {
    if (currentUserId) {
      if (onlineUsers.get(currentUserId) === socket.id) {
        onlineUsers.delete(currentUserId);
      }

      const lastSeen = new Date().toISOString();
      await updateUserLastSeen(currentUserId, lastSeen);

      io.emit("user_status", {
        userId: currentUserId,
        status: "offline",
        lastSeen: lastSeen,
      });
    }
  });
});

async function checkPendingMessages(userId) {
  try {
    const pendingMessages = await Message.find({
      receiver: userId,
      status: "sent",
    }).populate("sender", "username");

    if (pendingMessages.length > 0) {
      const messageBySender = {};

      pendingMessages.forEach((message) => {
        if (!messageBySender[msg.senderId._id]) {
          messageBySender[msg.sender._id] = [];
        }
        messageBySender[msg.sender._id].push(msg);
      });

      const userSocket = io.sockets.sockets.get(onlineUsers.get(userId));
      if (userSocket) {
        Object.keys(messageBySender).forEach((senderId) => {
          const count = messageBySender[senderId].length;
          const senderName = messageBySender[senderId][0].sender.username;

          userSocket.emit("pending_messages", {
            senderId,
            senderName,
            count,
            lastestMessage: messageBySender[senderId][0].message,
          });
        });
      }
    }
  } catch (error) {}
}

httpServer.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
