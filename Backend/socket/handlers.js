const DrawingOperation = require("../models/DrawingOperation");
const TextOperation = require("../models/TextOperation");
const presenceService = require("../services/PresenceService");
const chatService = require("../services/ChatService");

const DRAWING_THROTTLE_MS = 3000; // 3 second throttle window
const STROKE_BATCH_TIMEOUT = 3000; // 3 second auto-emit for long drawing sessions

/**
 * Register all Socket.IO event handlers.
 * Replaces Java STOMP message mappings + PresenceEvents disconnect handler.
 * Implements drawing stroke throttling: clients buffer moves, emit on mouse-up,
 * and auto-emit after 3 seconds if still drawing.
 */
function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    const { userId, name } = socket.handshake.auth;
    console.log(
      `Socket connected: ${socket.id}, User: ${name} (ID: ${userId})`,
    );

    // Drawing throttle state per socket
    socket.data.drawingThrottle = new Map(); // strokeId -> { lastEmit, batchTimer, pendingPayload }
    socket.data.roomId = null;
    socket.data.userId = userId;
    socket.data.name = name;

    // ─── join_room ───────────────────────────────────────────────────
    // Replaces: @MessageMapping("/room/{roomId}/presence.join")
    socket.on("join_room", (data) => {
      try {
        const roomId = data.roomId;
        const uid = data.userId || userId;
        const uname = data.name || name;

        if (!roomId) {
          console.error("join_room: missing roomId");
          return;
        }

        // Join Socket.IO room for broadcast scoping
        socket.join(roomId);

        // Store roomId on socket for disconnect cleanup
        socket.data.roomId = roomId;
        socket.data.userId = uid;
        socket.data.name = uname;

        const firstSession = presenceService.join(
          roomId,
          uid,
          uname,
          socket.id,
        );

        // Create system message if truly new user
        if (firstSession) {
          try {
            const systemMessage = chatService.createSystemMessage(
              roomId,
              `${uname} joined the collaboration`,
            );
            if (systemMessage) {
              io.to(roomId).emit("chat_event", {
                type: "system_message",
                roomId,
                message: systemMessage,
                messages: null,
              });
            }
          } catch (err) {
            console.error("Error creating join system message:", err.message);
          }
        }

        // Broadcast presence update to room
        try {
          const users = presenceService.list(roomId);
          io.to(roomId).emit("presence_update", {
            type: "presence_join",
            roomId,
            user: { id: uid, name: uname },
            users,
          });
        } catch (err) {
          console.error("Error broadcasting presence join:", err.message);
        }
      } catch (err) {
        console.error("Error in join_room:", err.message);
      }
    });

    // ─── leave_room ──────────────────────────────────────────────────
    // Replaces: @MessageMapping("/room/{roomId}/presence.leave")
    socket.on("leave_room", (data) => {
      try {
        const roomId = data?.roomId || socket.data.roomId;
        handleUserLeave(io, socket, roomId);
      } catch (err) {
        console.error("Error in leave_room:", err.message);
      }
    });

    // ─── chat_send ───────────────────────────────────────────────────
    // Replaces: @MessageMapping("/room/{roomId}/chat.send")
    socket.on("chat_send", (data) => {
      try {
        const roomId = data.roomId || socket.data.roomId;
        const uid = socket.data.userId || userId;
        const uname = socket.data.name || name;
        const content = data.content;

        if (!content || !content.trim()) {
          console.log("Ignoring empty message");
          return;
        }

        const message = chatService.sendMessage(
          roomId,
          uid,
          uname,
          content.trim(),
        );

        if (message) {
          console.log(`Broadcasting message: ${message.id}`);
          io.to(roomId).emit("chat_event", {
            type: "message_sent",
            roomId,
            message,
            messages: null,
          });
        } else {
          console.log("Message was duplicate, not broadcasting");
        }
      } catch (err) {
        console.error("Error in chat_send:", err.message);
      }
    });

    // ─── stroke_move (throttled) ─────────────────────────────────────
    // Implements 3-second throttle + auto-batching for long drawing sessions
    // Clients buffer drawing strokes (not sending every move)
    socket.on("stroke_move", (data) => {
      try {
        const roomId = data.roomId || socket.data.roomId;
        const strokeId = data.strokeId;

        if (!strokeId) {
          console.error("stroke_move: missing strokeId");
          return;
        }

        const throttle = socket.data.drawingThrottle;
        const now = Date.now();
        let state = throttle.get(strokeId);

        if (!state) {
          state = {
            lastEmit: 0,
            batchTimer: null,
            pendingPayload: data,
          };
          throttle.set(strokeId, state);
        } else {
          state.pendingPayload = data;
        }

        const timeSinceLastEmit = now - state.lastEmit;

        // Emit if enough time has passed since last emission
        if (timeSinceLastEmit >= DRAWING_THROTTLE_MS) {
          socket.to(roomId).emit("drawing_event", {
            type: "stroke_move",
            ...data,
          });
          state.lastEmit = now;

          // Clear any pending batch timer since we just emitted
          if (state.batchTimer) {
            clearTimeout(state.batchTimer);
            state.batchTimer = null;
          }

          // Set new batch timer to emit again after 3 seconds if still drawing
          state.batchTimer = setTimeout(() => {
            if (throttle.get(strokeId)) {
              const pending = throttle.get(strokeId).pendingPayload;
              socket.to(roomId).emit("drawing_event", {
                type: "stroke_move",
                ...pending,
              });
              throttle.get(strokeId).lastEmit = Date.now();
            }
          }, STROKE_BATCH_TIMEOUT);
        } else if (!state.batchTimer) {
          // Set batch timer to emit after throttle window
          const waitTime = DRAWING_THROTTLE_MS - timeSinceLastEmit;
          state.batchTimer = setTimeout(() => {
            if (throttle.get(strokeId)) {
              const pending = throttle.get(strokeId).pendingPayload;
              socket.to(roomId).emit("drawing_event", {
                type: "stroke_move",
                ...pending,
              });
              throttle.get(strokeId).lastEmit = Date.now();
              throttle.get(strokeId).batchTimer = null;
            }
          }, waitTime);
        }
      } catch (err) {
        console.error("Error in stroke_move:", err.message);
      }
    });

    // ─── stroke_end ──────────────────────────────────────────────────
    // Clear throttle state and finalize stroke in database
    socket.on("stroke_end", async (data) => {
      try {
        const roomId = data.roomId || socket.data.roomId;
        const strokeId = data.strokeId;

        console.log(
          `Processing stroke_end for room: ${roomId}, strokeId: ${strokeId}`,
        );

        // Clear throttle state for this stroke
        const throttle = socket.data.drawingThrottle;
        if (throttle.has(strokeId)) {
          const state = throttle.get(strokeId);
          if (state.batchTimer) {
            clearTimeout(state.batchTimer);
          }
          throttle.delete(strokeId);
        }

        // Emit final stroke_move with pending payload if exists
        const throttleState = socket.data.drawingThrottle.get(strokeId);
        if (throttleState) {
          socket.to(roomId).emit("drawing_event", {
            type: "stroke_move",
            ...throttleState.pendingPayload,
          });
        }

        // Persist to MongoDB
        try {
          const op = new DrawingOperation({
            _id: strokeId,
            roomId,
            operationType: "stroke",
            payload: data.payload,
          });
          await op.save();
          console.log(`Successfully saved operation: ${strokeId}`);
        } catch (dbErr) {
          console.error("FAILED to save stroke_end:", dbErr.message);
          // Still broadcast so users stay in sync
        }

        // Broadcast stroke_end to finalize on clients
        socket.to(roomId).emit("drawing_event", {
          type: "stroke_end",
          ...data,
        });
      } catch (err) {
        console.error("Error in stroke_end:", err.message);
      }
    });

    // ─── text_update ─────────────────────────────────────────────────
    // Replaces: case "text_update" in WebSocketController
    socket.on("text_update", async (data) => {
      try {
        const roomId = data.roomId || socket.data.roomId;

        // Delete all previous text records for this room, then insert new one
        await TextOperation.deleteMany({ roomId });

        const textOp = new TextOperation({
          roomId,
          userId: data.userId,
          payload: data.payload,
        });
        await textOp.save();

        // Broadcast to others
        socket.to(roomId).emit("text_event", data);
      } catch (err) {
        console.error("Error in text_update:", err.message);
      }
    });

    // ─── clear (eraser) ──────────────────────────────────────────────
    // Replaces: case "clear" in WebSocketController
    socket.on("clear", async (data) => {
      try {
        const roomId = data.roomId || socket.data.roomId;
        const erasedStrokes = data.payload?.erasedStrokes || [];

        if (erasedStrokes.length > 0) {
          // Batch delete from MongoDB
          await DrawingOperation.deleteMany({ _id: { $in: erasedStrokes } });
        }

        // Broadcast to others
        socket.to(roomId).emit("drawing_event", {
          type: "clear",
          ...data,
        });
      } catch (err) {
        console.error("Error in clear:", err.message);
      }
    });

    // ─── disconnect ──────────────────────────────────────────────────
    // Replaces: PresenceEvents.onDisconnect (SessionDisconnectEvent)
    socket.on("disconnect", (reason) => {
      try {
        console.log(`Socket disconnecting: ${socket.id}, reason: ${reason}`);

        // Clean up all pending throttle timers
        const throttle = socket.data.drawingThrottle;
        if (throttle && throttle.size > 0) {
          throttle.forEach((state) => {
            if (state.batchTimer) {
              clearTimeout(state.batchTimer);
            }
          });
          throttle.clear();
          console.log(
            `Cleared ${throttle.size} pending drawing timers for socket: ${socket.id}`,
          );
        }

        const roomId = socket.data.roomId;
        if (roomId) {
          handleUserLeave(io, socket, roomId);
        }
      } catch (err) {
        console.error("Error handling disconnect:", err.message);
      }
    });
  });
}

/**
 * Handle user leaving — presence update, system message, room cleanup.
 * Replaces logic from EnhancedPresenceController.leave + PresenceEvents.onDisconnect.
 */
async function handleUserLeave(io, socket, roomId) {
  const binding = presenceService.leaveBySocket(socket.id);

  if (binding) {
    console.log(
      `User truly left room: ${binding.name} from room: ${binding.roomId}`,
    );

    // Create system message for leaving
    try {
      const systemMessage = chatService.createSystemMessage(
        roomId,
        `${binding.name} left the collaboration`,
      );
      if (systemMessage) {
        io.to(roomId).emit("chat_event", {
          type: "system_message",
          roomId,
          message: systemMessage,
          messages: null,
        });
      }
    } catch (err) {
      console.error("Error creating leave system message:", err.message);
    }

    // Broadcast presence update
    try {
      const users = presenceService.list(roomId);
      io.to(roomId).emit("presence_update", {
        type: "presence_leave",
        roomId,
        user: { id: binding.userId, name: binding.name },
        users,
      });

      // If room is empty, clean up transient data only.
      // Keep the Room document so users can re-join later using the room code.
      if (users.length === 0) {
        console.log(`Room ${roomId} is empty. Initiating clean up...`);
        try {
          await DrawingOperation.deleteMany({ roomId });
          await TextOperation.deleteMany({ roomId });
          chatService.clearRoomMessages(roomId);
          console.log(
            `Room ${roomId} is empty. Cleared room data but kept room metadata for future joins.`,
          );
        } catch (cleanupErr) {
          console.error(
            `Error cleaning up room ${roomId}:`,
            cleanupErr.message,
          );
        }
      }
    } catch (err) {
      console.error("Error broadcasting presence leave:", err.message);
    }
  }

  // Leave the Socket.IO room
  socket.leave(roomId);
}

module.exports = registerSocketHandlers;
