import Message from "../../models/Message.js";

export const saveMessage = async (data) => {
  return await Message.create({
    senderId: data.senderId,
    receiverId: data.receiverId,
    message: data.message,
  });
};