import { fetchMessages, chatRoom } from "../services/chat_Services.js";

export const getMessages = async (req, res) => {
    const {senderId , receiverId , page , limit} = req.query;
    try{
        const messages = await fetchMessages({
            
            currentUserId: req.userId ,
            senderId,
            receiverId,
            page: parseInt(page , 10),
            limit: parseInt(limit , 10)
        } );
        res.json(messages);
    }catch(error){
        res.status(500).json({ error: "Error Fetching messages: " + error.message });
    }
}


export const getChatRooms = async (req, res) => {
 
    try{
        const rooms = await getChatRooms(
            req.userId,
           
         );
        res.json(rooms);
    }catch(error){
        res.status(500).json({ error: "Error Fetching chat rooms: " + error.message });
    }
}