let ioInstance = null;

export function initSocket(io) {
  ioInstance = io;

  io.on("connection", (socket) => {
    console.log("🟢 Client connected:", socket.id);
  });
}

export function emitToAll(event, data) {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
}
