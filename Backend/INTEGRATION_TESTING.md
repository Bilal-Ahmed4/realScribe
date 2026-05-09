# Real-Scribe Backend Integration & Testing Guide

## Pre-Integration Checklist

- [ ] Node.js 18+ installed (`node --version`)
- [ ] MongoDB running (local or MongoDB Atlas)
- [ ] `.env` file created with valid `MONGODB_URI`
- [ ] Dependencies installed (`npm install`)
- [ ] Backend starts without errors (`npm start` or `npm run dev`)

## Quick Start

```bash
# 1. Install dependencies
cd Backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MongoDB connection string

# 3. Start server
npm run dev

# Output should show:
# Connected to MongoDB
# Server running on port 3001
# CORS origins: http://localhost:5173
```

## Health Check

```bash
# Server is running
curl http://localhost:3001/health
# Response: {"status":"ok","timestamp":"2024-..."}
```

## API Testing

### 1. Create a Room
```bash
curl -X POST http://localhost:3001/api/room \
  -H "Content-Type: application/json" \
  -d '{
    "id": "ABC123",
    "userId": 1,
    "username": "TestUser"
  }'

# Response:
# {"id":"ABC123","userId":1,"username":"TestUser"}
```

### 2. Get Room Info
```bash
curl http://localhost:3001/api/room/ABC123

# Response:
# {"id":"ABC123","userId":1,"username":"TestUser"}
```

### 3. Get Chat Messages
```bash
curl "http://localhost:3001/api/rooms/ABC123/messages?limit=50"

# Response (empty initially):
# []
```

### 4. Get Active Users
```bash
curl http://localhost:3001/api/rooms/ABC123/users

# Response (empty initially):
# []
```

## WebSocket Testing

### Using Browser DevTools

1. **Open DevTools Console** (F12 → Console tab)

2. **Connect to Socket.IO**:
```javascript
// Connect with auth
const socket = io('http://localhost:3001', {
  auth: {
    userId: 'user1',
    name: 'TestUser'
  }
});

// Listen for connection
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

// Listen for presence updates
socket.on('presence_update', (data) => {
  console.log('Presence update:', data);
});
```

3. **Join a Room**:
```javascript
socket.emit('join_room', {
  roomId: 'ABC123',
  userId: 'user1',
  name: 'TestUser'
});
```

4. **Send Chat Message**:
```javascript
socket.emit('chat_send', {
  roomId: 'ABC123',
  content: 'Hello from WebSocket!'
});

// Listen for broadcast
socket.on('chat_event', (data) => {
  console.log('Chat event:', data);
});
```

5. **Test Drawing (Throttled)**:
```javascript
// Send multiple stroke_move events rapidly
for (let i = 0; i < 100; i++) {
  socket.emit('stroke_move', {
    roomId: 'ABC123',
    strokeId: 'test-stroke-1',
    x: 10 + i,
    y: 20 + i,
    payload: {x: 10 + i, y: 20 + i, points: 100 + i}
  });
}

// Listen for drawing events
socket.on('drawing_event', (data) => {
  console.log('Drawing event:', data);
  // Should see much fewer than 100 events due to throttling
});
```

6. **Finalize Drawing**:
```javascript
socket.emit('stroke_end', {
  roomId: 'ABC123',
  strokeId: 'test-stroke-1',
  payload: {x: 110, y: 120, points: 200}
});
```

## Frontend Integration Testing

### Environment Setup

1. **Frontend .env**:
```bash
VITE_API_URL=http://localhost:3001
```

2. **Start Frontend** (in separate terminal):
```bash
cd Frontend
npm install
npm run dev
```

3. **Expected URL**: http://localhost:5173

### Integration Test Workflow

1. **Login**
   - Enter any user ID and name
   - Click "Login" or equivalent
   - Should redirect to room selection/creation

2. **Create/Join Room**
   - Create new room or join with code
   - Should see room code (6 characters)

3. **Verify WebSocket Connection**
   - Open DevTools → Network → WS tab
   - Should see Socket.IO connection to localhost:3001
   - Should see "Connected to Socket.IO" log

4. **Test Chat**
   - Type and send message
   - Should appear on screen after ~100ms
   - Open backend logs: should see "Broadcasting message"

5. **Test Drawing**
   - Draw on canvas
   - Open DevTools → Network → WS tab
   - With throttling: should see fewer events than expected
   - Without drawing: events should come in batches (~1-2 every 3 seconds)
   - On mouse-up: should see stroke_end event

6. **Test Multi-User (if possible)**
   - Open second browser tab with same room
   - Chat from first tab should appear in second
   - Drawing from first tab should appear in second
   - Both users should appear in presence list

7. **Test Disconnect**
   - Close tab or click disconnect
   - Other users should see leave notification
   - Backend logs should show "User fully left room"
   - Room should clean up after last user leaves

## Performance Verification

### Drawing Throttle Test

1. **Simulate High-Frequency Drawing**:
```javascript
// In console
const socket = io('http://localhost:3001', {
  auth: { userId: 'perf-test', name: 'PerfTest' }
});

socket.emit('join_room', {
  roomId: 'PERF123',
  userId: 'perf-test',
  name: 'PerfTest'
});

let count = 0;
socket.on('drawing_event', (data) => {
  if (data.type === 'stroke_move') {
    count++;
  }
});

// Send 1000 stroke_move events over 10 seconds
const interval = setInterval(() => {
  for (let i = 0; i < 100; i++) {
    socket.emit('stroke_move', {
      roomId: 'PERF123',
      strokeId: 'perf-stroke',
      x: Math.random() * 1000,
      y: Math.random() * 1000,
      payload: {timestamp: Date.now()}
    });
  }
}, 100);

setTimeout(() => {
  clearInterval(interval);
  console.log(`Sent 1000 events, received ${count} events`);
  console.log(`Compression ratio: ${(1000/count).toFixed(2)}x`);
  console.log(`Bandwidth reduction: ${((1-count/1000)*100).toFixed(2)}%`);
}, 10000);
```

**Expected Results**:
- Sent: 1000 events
- Received: ~3-4 events (every ~3 seconds)
- Compression: ~250-333x
- Reduction: ~99.7%

### Presence Tracking Test

```javascript
// Send presence_update events
socket.on('presence_update', (data) => {
  console.log('Presence:', data.users.map(u => u.name).join(', '));
});

// Connect multiple clients and track list updates
```

### Chat Duplicate Detection

```javascript
// Send duplicate messages within 1 second
socket.emit('chat_send', { roomId: 'ABC123', content: 'Test' });
socket.emit('chat_send', { roomId: 'ABC123', content: 'Test' });

// Only one should broadcast
```

## Common Issues & Solutions

### Issue: Backend won't connect to MongoDB
**Solution**:
```bash
# Check MongoDB is running
mongosh  # or mongo

# Verify connection string format
# Should be: mongodb+srv://user:pass@cluster.mongodb.net/database
# Or: mongodb://localhost:27017/database

# Check credentials
# - User name correct
# - Password (if special chars, must be URL encoded)
# - IP whitelist allowed
```

### Issue: Socket connection times out
**Solution**:
```bash
# Check server is running
curl http://localhost:3001/health

# Check port
netstat -an | grep 3001

# Verify CORS_ORIGIN in .env includes frontend URL
# For local testing: http://localhost:5173 or http://localhost:3000
```

### Issue: Drawing events not throttled
**Solution**:
```javascript
// Check throttle constants in socket/handlers.js
// Should be: DRAWING_THROTTLE_MS = 3000

// Verify stroke_move handler is being called
// Add console.log to see event frequency

// Check if browser is buffering and only sending on mouse-up
// Frontend should implement buffering first
```

### Issue: Memory leak or slow performance
**Solution**:
```bash
# Monitor memory growth
watch -n 1 'ps aux | grep node'

# Check for stuck timers
# Add logging in disconnect handler

# Look for uncaught exceptions
# Check backend console for errors
```

### Issue: CORS error
**Solution**:
```bash
# Backend logs should show allowed origins
# Check .env CORS_ORIGIN includes your frontend domain

# Frontend error: "Access to XMLHttpRequest blocked by CORS policy"
# Solution: Ensure CORS_ORIGIN in .env includes frontend URL

# For Vercel: Set CORS_ORIGIN to your Vercel deployment URL
CORS_ORIGIN=https://real-scribe.vercel.app,http://localhost:5173
```

## Backend Logs to Monitor

### Successful Startup
```
Connected to MongoDB
Server running on port 3001
CORS origins: http://localhost:5173
```

### User Join
```
Socket connected: [socketId], User: [name] (ID: [userId])
Joining room - Room: [roomId], User: [name] (ID: [userId]), Socket: [socketId]
Message added: [messageId] from user: [name]
```

### Drawing
```
Processing stroke_end for room: [roomId], strokeId: [strokeId]
Successfully saved operation: [strokeId]
```

### User Leave
```
Leaving session - Room: [roomId], User: [name] (ID: [userId]), Socket: [socketId]
User [userId] fully left room [roomId]
Room [roomId] is now empty
Room [roomId] and all associated data deleted
```

### Errors to Watch For
```
ERROR: MONGODB_URI environment variable is not set
Failed to connect to MongoDB: [error]
Error in stroke_move: [error message]
FAILED to save stroke_end: [error message]
```

## Database Verification

### Check MongoDB Collections

```bash
# Connect to MongoDB
mongosh

# Switch to database
use realscribe

# View collections
show collections

# Count documents in each collection
db.rooms.countDocuments()
db.drawingoperations.countDocuments()
db.textoperations.countDocuments()

# View sample documents
db.rooms.findOne()
db.drawingoperations.findOne()
```

## Deployment Readiness Checklist

- [ ] Backend starts without errors
- [ ] Health endpoint responds: `/health`
- [ ] MongoDB connection works
- [ ] REST endpoints functional
- [ ] WebSocket events fire
- [ ] Drawing throttling works (~99% reduction)
- [ ] Chat deduplication works
- [ ] Presence tracking works
- [ ] Room cleanup works
- [ ] Graceful shutdown works (Ctrl+C)
- [ ] All error messages logged
- [ ] No unhandled exceptions
- [ ] Memory usage stable
- [ ] CPU usage normal (<10% idle server)

## Production Deployment

### Vercel + MongoDB Atlas

1. **Create `.env` for production**:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/realscribe
PORT=3001
CORS_ORIGIN=https://real-scribe.vercel.app
NODE_ENV=production
```

2. **Deploy backend to Render/Vercel/Heroku**
3. **Set environment variables in platform**
4. **Test deployment**:
```bash
curl https://[backend-url]/health
```

5. **Update Frontend VITE_API_URL**:
```env
VITE_API_URL=https://[backend-url]
```

## Support & Debugging

### Enable Debug Logging
```javascript
// In server.js, add:
process.env.DEBUG = 'socket.io:*';
```

### Inspect Socket.IO Adapter
```bash
# In node console:
const { io } = require('socket.io');
const sio = io();
sio.on('connection', (socket) => {
  console.log('Rooms:', socket.rooms);
  console.log('Connected:', sio.engine.clientsCount);
});
```

### Monitor Active Connections
```javascript
// Add to server.js
setInterval(() => {
  console.log(`Active connections: ${io.engine.clientsCount}`);
  console.log(`Active rooms: ${Object.keys(io.sockets.adapter.rooms).length}`);
}, 10000);
```

---

**Next Step**: Deploy backend and connect frontend to test full integration!
