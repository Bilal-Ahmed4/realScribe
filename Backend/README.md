# Real-Scribe Backend (Node.js)

Complete Node.js backend for Real-Scribe collaborative drawing & text application with WebSocket support and optimized drawing stroke handling.

## Features

- **Express.js REST API** for room and content management
- **Socket.IO WebSocket Server** with real-time collaboration
- **MongoDB Integration** for persistent storage
- **Drawing Stroke Throttling** (3-second auto-batching for smooth performance)
- **Presence Tracking** for active users in rooms
- **Chat System** with duplicate message detection
- **Drawing Operations** with stroke persistence and history
- **Text Editor** support with concurrent editing
- **Graceful Disconnection** handling with automatic cleanup

## Project Structure

```
Backend/
├── models/              # Mongoose schemas
│   ├── Room.js         # Room definition
│   ├── DrawingOperation.js
│   └── TextOperation.js
├── services/           # Business logic (in-memory or DB operations)
│   ├── ChatService.js
│   └── PresenceService.js
├── routes/             # REST API endpoints
│   ├── room.js
│   ├── drawing.js
│   ├── text.js
│   └── presence.js
├── socket/
│   └── handlers.js     # Socket.IO event handlers
├── server.js           # Express server setup
├── package.json
├── .env.example
└── README.md
```

## Installation & Setup

### Prerequisites

- Node.js >= 18.0.0
- MongoDB (local or MongoDB Atlas)
- npm or yarn

### Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your MongoDB connection string and CORS origins:
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/realscribe?retryWrites=true&w=majority
   PORT=3001
   CORS_ORIGIN=https://real-scribe.vercel.app,http://localhost:5173
   ```

3. **Start Server**
   ```bash
   # Development (with auto-reload)
   npm run dev

   # Production
   npm start
   ```

   Server will listen on `http://localhost:3001`

## API Endpoints

### Room Management
- `POST /api/room` - Create a new room
- `GET /api/room/:id` - Get room by ID

### Drawing Operations
- `GET /api/draw/:roomId` - Get all drawing operations for a room

### Text Operations
- `GET /api/text/latest/:roomId` - Get latest text document for a room

### Presence & Chat
- `GET /api/rooms/:roomId/users` - List active users in a room
- `GET /api/rooms/:roomId/messages` - Get chat history (default limit: 50)
- `GET /api/rooms/:roomId/messages/count` - Get total message count
- `GET /api/presence/debug` - Debug presence state (development only)

## WebSocket Events

### Client → Server

**Room Management**
- `join_room` - Join a collaboration room
  ```javascript
  { roomId: "abc123", userId: "user1", name: "Alice" }
  ```
- `leave_room` - Leave a room
  ```javascript
  { roomId: "abc123" }
  ```

**Chat**
- `chat_send` - Send a chat message
  ```javascript
  { roomId: "abc123", content: "Hello!" }
  ```

**Drawing** (with 3-second throttling)
- `stroke_move` - Send drawing movement (throttled at 3 seconds)
  ```javascript
  {
    roomId: "abc123",
    strokeId: "stroke-uuid",
    x: 100, y: 200,
    pressure: 0.8,
    payload: { /* full stroke data */ }
  }
  ```
- `stroke_end` - Finalize a stroke
  ```javascript
  {
    roomId: "abc123",
    strokeId: "stroke-uuid",
    payload: { /* completed stroke */ }
  }
  ```

**Text Editing**
- `text_update` - Update text content
  ```javascript
  {
    roomId: "abc123",
    userId: "user1",
    payload: { /* text content */ }
  }
  ```

**Eraser**
- `clear` - Erase strokes
  ```javascript
  {
    roomId: "abc123",
    payload: { erasedStrokes: ["stroke1", "stroke2"] }
  }
  ```

### Server → Client

**Presence**
- `presence_update` - User joined/left room
  ```javascript
  {
    type: "presence_join" | "presence_leave",
    roomId: "abc123",
    user: { id: "user1", name: "Alice" },
    users: [{ id: "user1", name: "Alice" }, ...]
  }
  ```

**Chat**
- `chat_event` - New message or system event
  ```javascript
  {
    type: "message_sent" | "system_message",
    roomId: "abc123",
    message: {
      id: "msg_id",
      userId: "user1",
      senderName: "Alice",
      content: "Hello!",
      type: "MESSAGE" | "SYSTEM",
      timestamp: "2024-01-01T12:00:00Z"
    }
  }
  ```

**Drawing**
- `drawing_event` - Drawing stroke broadcast
  ```javascript
  {
    type: "stroke_move" | "stroke_end" | "clear",
    roomId: "abc123",
    strokeId: "stroke-uuid",
    payload: { /* stroke data */ }
  }
  ```

**Text**
- `text_event` - Text update broadcast
  ```javascript
  {
    roomId: "abc123",
    userId: "user1",
    payload: { /* text content */ }
  }
  ```

## Drawing Stroke Optimization

Real-Scribe implements a smart throttling system to optimize network bandwidth and server load:

### Client-Side Strategy
1. **Buffer all drawing moves** in local state (don't send every pixel)
2. **On mouse-up**: Emit batch to server
3. **If drawing > 3 seconds**: Auto-emit batch at 3-second mark, continue drawing

### Server-Side Strategy
1. **Throttle incoming `stroke_move` events** at 3 seconds
2. **Buffer intermediate moves** in memory
3. **Broadcast batches** to other users at throttle intervals
4. **Clear buffers** on `stroke_end` or disconnect

### Result
- **Network**: Reduces WebSocket traffic by ~95%
- **Performance**: Smooth drawing experience without lag
- **Scalability**: Server can handle many concurrent drawing sessions

## Services

### ChatService
In-memory chat management with duplicate detection:
- `sendMessage(roomId, userId, senderName, content)` - Store user message
- `createSystemMessage(roomId, content)` - Store system message
- `getRoomMessages(roomId, limit)` - Fetch recent messages
- `getMessageCount(roomId)` - Get total message count
- `clearRoomMessages(roomId)` - Clear room chat on deletion

### PresenceService
Track active users per room:
- `join(roomId, userId, name, socketId)` - Register user session
- `leaveBySocket(socketId)` - Unregister session
- `list(roomId)` - Get active users
- `cleanupOrphanedSessions()` - Periodic cleanup

## MongoDB Models

### Room
```javascript
{
  _id: String,           // 6-char room code
  userId: Number,        // Creator's user ID
  username: String,      // Creator's name
  createdAt: Date,       // Auto-set
  updatedAt: Date        // Auto-set
}
```

### DrawingOperation
```javascript
{
  _id: String,           // strokeId (UUID)
  roomId: String,        // Room reference
  operationType: String, // "stroke"
  payload: Mixed         // Full stroke data
}
```

### TextOperation
```javascript
{
  _id: ObjectId,         // Auto-generated
  roomId: String,        // Room reference
  userId: String,        // Editor's user ID
  payload: Mixed,        // Text content
  createdAt: Date        // Auto-set
}
```

## Error Handling

- **Missing Room**: Returns 404 Not Found
- **Database Error**: Returns 500 Internal Server Error with error message
- **Invalid Socket Event**: Logs error, doesn't crash server
- **Missing Auth**: Socket connection is rejected

## Configuration

### Environment Variables
- `MONGODB_URI` - MongoDB connection string (required)
- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - Comma-separated list of allowed origins (default: localhost:5173)

### Socket.IO Config
- `pingInterval`: 10 seconds
- `pingTimeout`: 5 seconds
- `transports`: ['websocket', 'polling']

## Performance Tuning

1. **Drawing Throttle**: Adjust `DRAWING_THROTTLE_MS` in `socket/handlers.js` (default: 3000ms)
2. **Batch Timeout**: Adjust `STROKE_BATCH_TIMEOUT` in `socket/handlers.js` (default: 3000ms)
3. **Message Limit**: Adjust default limit in `routes/presence.js` (default: 50)
4. **MongoDB Indexes**: `DrawingOperation.roomId` and `TextOperation.roomId` are indexed

## Deployment

### Docker
```bash
docker build -t realscribe-backend .
docker run -p 3001:3001 \
  -e MONGODB_URI="mongodb://..." \
  -e CORS_ORIGIN="https://your-domain.com" \
  realscribe-backend
```

### Vercel/Cloud Services
- Ensure MongoDB URI is in environment variables
- Set CORS_ORIGIN to your frontend domain
- Node.js 18+ runtime required

## Troubleshooting

### "MONGODB_URI environment variable is not set"
- Ensure `.env` file exists and `MONGODB_URI` is defined
- Check MongoDB connection string format

### Socket connection refused
- Verify CORS_ORIGIN includes your frontend domain
- Check if server is running: `curl http://localhost:3001/health`

### Drawing events not syncing
- Check WebSocket connection: Look for "Connected to Socket.IO" log
- Verify `stroke_end` is being called (not just `stroke_move`)
- Check browser console for Socket.IO errors

### Memory leak with drawing
- Throttle state is cleared on disconnect
- Long sessions should not accumulate memory
- If issue persists, check for missing `clearTimeout` calls

## Development

### Debug Presence State
```bash
curl http://localhost:3001/api/presence/debug
# Check server logs for detailed state dump
```

### Watch Mode
```bash
npm run dev
```
Automatically restarts on file changes.

## License

MIT
