import Message from "../models/message.js";
import { getRoomId } from "../utils/chatHelper.js";
import User from "../models/user.js";
import { $ } from "kleur/colors";

export const createMessage = async (messageData) => {
  try {
    const message = new Message({
      chatRoomId: messageData.chatRoomId,
      messageId: messageData.messageId,
      sender: messageData.sender,
      receiver: messageData.receiver,
      message: messageData.message,
      status: messageData.status || "sent",
    });
    await message.save();
    return message;
  } catch (error) {
    throw error;
  }
};

export const fetchMessages = async ({
  currentUserId,
  senderId,
  receiverId,
  page = 1,
  limit = 20,
}) => {
  const roomId = getRoomId(senderId, receiverId);
  const query = { chatRoomId: roomId };

  try {
    if (currentUserId === receiverId) {
      const undeliveryQuery = {
        chatRoomId: roomId,
        receiver: currentUserId,
        sender: senderId,
        status: "sent",
      };

      const undeliveredUpdate = await Message.updateMany(undeliveryQuery, {
        $set: { status: "delivered" },
      });
      if (undeliveredUpdate.modifiedCount > 0) {
        console.log(
          `Updated ${undeliveredUpdate.modifiedCount} messages to delivered status.`,
        );
      }
    }
    const messages = await Message.aggregate(
      {
        $match: query,
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: (page - 1) * limit,
      },
      {
        $limit: limit,
      },
      {
        $addFields: {
          isMine: {
            $eq: ["sender", { $toObjectId: currentUserId }],
          },
        },
      },
    );
    return messages.reverse();
  } catch (error) {
    throw new Error("Failed to retrieve messages: " + error.message);
  }
};

export const updateMessageStatus = async (messageId, status) => {
  try {
    const message = await Message.findOneAndUpdate(
      { messageId: messageId },
      { status: status },
      { new: true },
    );
    return message;
  } catch (error) {
    throw error;
  }
};

export const getUnreadMessages = async (userId , partnerId) => {
  try {
    const message = await Message.find(
      { receiver: userId, sender: partnerId, status: "sent" },
    ).sort({ createdAt: 1 });
    return message;
  } catch (error) {
    throw error;
  }
};


export const updateUserLastSeen = async (userId, lastSeen) => {
  try {
    const user = await User.findOneAndUpdate(
        userId, 
        {LastSeen: lastSeen},
        {new: true}
    );
    return user;
  } catch (error) {
    throw error;
  }
};



export const markMessageAsDelivered = async (userId, partnerId) => {
  try {
    const result = await Message.updateMany(
        userId, 
        {receiver: ObjectId(userId), sender : ObjectId(partnerId) , status: 'sent'},
        {
            $set: {status: 'delivered'}
        }
    );
    return result.modifiedCount;
  } catch (error) {
    throw error;
  }
};

export const markMessageAsRead = async (userId, partnerId) => {
  try {
    const result = await Message.updateMany(
        userId, 
        {receiver: ObjectId(userId), sender : ObjectId(partnerId) , status: ['sent' , 'delivered']},
        {
            $set: {status: 'read'}
        }
    );
    return result.modifiedCount;
  } catch (error) {
    throw error;
  }
};

export const getUserLastSeen = async (userId) => {
  try {
    const user = await User.findById(userId).select('lastseen');
     
    if(!user){
        return null;
    }

    return user.lastseen ? user.lastseen : null;
  } catch (error) {
    throw error;
  }
};


export const getUserOnlineStatus = async (userId) => {
  try {
    const user = await User.findById(userId).select('isOnline lastseen');
     
    if(!user){
        return {isOnline: false, lastSeen: null};
    }

    return{
        isOnline: user.isOnline|| false,
        lastSeen: user.lastseen ? user.lastseen.toISOString() : null
    }

  } catch (error) {
    throw error;
  }
};

export const chatRoom = async (userId) => {
    try {
          const userObjectId = new ObjectId(userId);
          const privateChatQuery = {
            $or : [{sender: userObjectId} , {receiver: userObjectId}]
          };

          const privateChats = await Message.aggregate([
            {$match: privateChatQuery},
            {$sort: {createdAt: -1}},
            {$group: {
                _id: {
                    $cond:[
                        {$ne: ['$sender', userObjectId]},
                        '$sender',
                        '$receiver'
                    ]
                },
                latestMessageTime: {$first: '$createdAt'},
                latestMessage: {$first: '$message'},
                sender: {
                    $first: '$sender'
                },
                messages: {
                    $push: {
                        sender: '$sender', 
                        receiver: '$receiver',
                        status: '$status',
                    }
                }
            }
        },
        {
            $lookup:{
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'userDetails'
            }
        },
        {
            $unwind: '$userDetails'
        },
        {
            $project:{
                _id: 0,
                chatType: 'private',
                messageId: '$latestMessageId',
                username : '$userDetails.username',
                userId: '$userDetails._id',
                latestMessageTime: 1,
                latestMessage: 1,
                senderId: 1,
                unreadCount:{
                    $size:{
                        $filter:{
                             input: '$message',
                             as: 'msg',
                             cond: {
                                $and:[
                                    {$eq: ['$$msg.receiver', userObjectId]},
                                    {$in: ['$$msg.status', ['sent', 'delivered']]}
                                ]
                             }
                        }
                    },
                    latestMessageStatus:{
                        $cond:[
                            {$eq: ['$sender', userObjectId]},
                            {
                                $arrayElemAt:[
                                    {
                                        $map:{
                                            input: {
                                                $filter: {
                                                    input: '$messages',
                                                    as: 'msg',
                                                    cond: {$eq: ['$$msg.sender', userObjectId]}
                                                }
                                            },
                                            as: 'msg',
                                            in: '$$m.status'
                                        }
                                    },
                                    0
                                ]
                            
                            },
                            null
                        ]
                    }
                }
            }
        }
      ]);
      return privateChats.sort((a,b) =>{
        return new Date(b.LatestMessageTime) - new Date(a.latestMessageTime);
      } )
    }
    catch(error){

    }
}


