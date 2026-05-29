const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initDb, Users, Rooms, Messages } = require('./db');

// Ensure database file is initialized on start
initDb();

const app = express();
const server = http.createServer(app);

// Allow socket connections from any client IP (essential for mobile testing over LAN)
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;

// Enable CORS & JSON parsing
app.use(cors());
app.use(express.json());

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded images statically
app.use('/uploads', express.static(uploadsDir));

// ── PRODUCTION: Serve built React client ──────────────────────────────────────
const clientBuildPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
}


// Configure Multer for image storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpg, jpeg, png, gif, webp) are allowed!'));
  }
});

// --- REST API ENDPOINTS ---

// Auth/Register User
app.post('/api/auth', (req, res) => {
  const { username, avatar } = req.body;
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }
  
  try {
    const user = Users.create(username.trim(), avatar);
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Register User
app.post('/api/auth/register', (req, res) => {
  const { firstName, lastName, email, password, avatar } = req.body;
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: 'All fields (First name, Last name, Email, and Password) are required' });
  }

  try {
    const user = Users.register(firstName.trim(), lastName.trim(), email.trim(), password, avatar);
    
    // Broadcast user status changed to notify other online users of new registration
    io.emit('user_status_changed', { userId: user.id, isOnline: true });
    
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login User
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = Users.authenticate(email.trim(), password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Broadcast user online status
    io.emit('user_status_changed', { userId: user.id, isOnline: true });

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Fetch all registered users
app.get('/api/users', (req, res) => {
  try {
    const list = Users.getAll();
    res.status(200).json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add Friend
app.post('/api/users/friend', (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId) {
    return res.status(400).json({ error: 'Both userId and friendId are required' });
  }
  try {
    const user = Users.addFriend(userId, friendId);
    if (!user) return res.status(404).json({ error: 'User or friend not found' });
    
    // Broadcast user status changed to trigger UI reload for friends list
    io.emit('user_status_changed', { userId, isOnline: true });
    
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user account
app.delete('/api/users/:userId', (req, res) => {
  const { userId } = req.params;
  try {
    const success = Users.delete(userId);
    if (!success) return res.status(404).json({ error: 'User not found' });
    
    // Notify all active clients that this user is deleted and rooms they were in are updated
    io.emit('user_deleted', userId);
    io.emit('chat_list_refresh');
    
    res.status(200).json({ success: true, message: 'User account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete chat room
app.delete('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  try {
    const success = Rooms.delete(roomId);
    if (!success) return res.status(404).json({ error: 'Room not found' });
    
    // Notify all clients in that room or generally that the room is gone
    io.emit('room_deleted', roomId);
    io.emit('chat_list_refresh');
    
    res.status(200).json({ success: true, message: 'Chat room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chats (rooms) for a specific user, rich with user details & last message details
app.get('/api/rooms', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId parameter is required' });

  try {
    const userRooms = Rooms.getForUser(userId);
    const allUsers = Users.getAll();
    const unreadCounts = Messages.getUnreadCounts(userId);

    const richRooms = userRooms.map(room => {
      const messages = Messages.getByRoomId(room.id);
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      
      let chatName = room.name;
      let chatAvatar = room.avatar;
      
      // If it is a 1-1 direct chat, name and avatar are derived from the OTHER member
      if (room.type === 'direct') {
        const otherUserId = room.members.find(id => id !== userId);
        const otherUser = allUsers.find(u => u.id === otherUserId);
        chatName = otherUser ? otherUser.username : 'Unknown User';
        chatAvatar = otherUser ? otherUser.avatar : '';
      }

      return {
        id: room.id,
        type: room.type,
        name: chatName,
        avatar: chatAvatar,
        members: room.members,
        lastMessage,
        unreadCount: unreadCounts[room.id] || 0,
        createdAt: room.createdAt
      };
    });

    // Sort chats by last message time (most recent first)
    richRooms.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(a.createdAt);
      const timeB = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(b.createdAt);
      return timeB - timeA;
    });

    res.status(200).json(richRooms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start a 1-1 Chat
app.post('/api/rooms/direct', (req, res) => {
  const { user1Id, user2Id } = req.body;
  if (!user1Id || !user2Id) {
    return res.status(400).json({ error: 'Both user1Id and user2Id are required' });
  }

  try {
    const room = Rooms.createDirect(user1Id, user2Id);
    if (!room) return res.status(404).json({ error: 'One or both users not found' });
    
    // Fetch last message & unread status
    const messages = Messages.getByRoomId(room.id);
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    
    // Return room with names filled
    const allUsers = Users.getAll();
    const user2 = allUsers.find(u => u.id === user2Id);
    
    res.status(200).json({
      ...room,
      name: user2 ? user2.username : 'Chat',
      avatar: user2 ? user2.avatar : '',
      lastMessage,
      unreadCount: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start a Group Chat
app.post('/api/rooms/group', (req, res) => {
  const { name, avatar, memberIds } = req.body;
  if (!name || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ error: 'Group name and memberIds array are required' });
  }

  try {
    const room = Rooms.createGroup(name, avatar, memberIds);
    res.status(200).json({
      ...room,
      lastMessage: null,
      unreadCount: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch messages for a specific chat room and mark them as read
app.get('/api/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.query;

  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    // Mark as read in db
    Messages.markAsRead(roomId, userId);
    const messages = Messages.getByRoomId(roomId);
    
    // Fetch users for mapping avatars/names in clients
    const users = Users.getAll();
    
    const richMessages = messages.map(m => {
      const sender = users.find(u => u.id === m.senderId);
      return {
        ...m,
        senderName: sender ? sender.username : 'Unknown User',
        senderAvatar: sender ? sender.avatar : ''
      };
    });

    res.status(200).json(richMessages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload media file (Image)
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }
  
  try {
    // Generate server base URL dynamically so clients on LAN can access the files
    const host = req.get('host');
    const protocol = req.protocol;
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    
    res.status(200).json({ imageUrl: fileUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SOCKET.IO REAL-TIME TRIGGERS ---

const activeSockets = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // User logs in/registers online presence
  socket.on('user_online', (userId) => {
    socket.userId = userId;
    activeSockets.set(userId, socket.id);
    
    // Set status in DB
    Users.setOnlineStatus(userId, true);
    
    // Broadcast user online status
    io.emit('user_status_changed', { userId, isOnline: true });
    
    // Automatically join socket rooms for all chat channels this user belongs to
    const userRooms = Rooms.getForUser(userId);
    userRooms.forEach(room => {
      socket.join(room.id);
    });

    // Also join a private room for personal alerts/invites
    socket.join(`user_${userId}`);
    
    console.log(`User ${userId} is online and joined rooms`);
  });

  // Client creates a room dynamically (notify other members)
  socket.on('join_new_room', ({ roomId, memberIds }) => {
    socket.join(roomId);
    
    // For other members who are online, make their socket join this room
    memberIds.forEach(mId => {
      const sId = activeSockets.get(mId);
      if (sId) {
        const memberSocket = io.sockets.sockets.get(sId);
        if (memberSocket) {
          memberSocket.join(roomId);
          // Notify them to refresh their chat list
          io.to(`user_${mId}`).emit('chat_list_refresh');
        }
      }
    });
  });

  // Sending message
  socket.on('send_message', async ({ roomId, senderId, content, imageUrl }) => {
    try {
      const message = Messages.create(roomId, senderId, content, imageUrl);
      if (!message) return;

      const room = Rooms.getById(roomId);
      const sender = Users.getById(senderId);

      const richMessage = {
        ...message,
        senderName: sender ? sender.username : 'Unknown User',
        senderAvatar: sender ? sender.avatar : ''
      };

      // Broadcast message to everyone in the room
      io.to(roomId).emit('new_message', richMessage);

      // Trigger standard notification for members who are NOT in the room or active window
      // Send alert event specifically to members of this chat room
      room.members.forEach(memberId => {
        if (memberId !== senderId) {
          io.to(`user_${memberId}`).emit('message_notification', {
            roomId,
            roomName: room.type === 'group' ? room.name : sender.username,
            roomAvatar: room.type === 'group' ? room.avatar : sender.avatar,
            senderName: sender.username,
            senderId,
            content: imageUrl ? '📷 Photo' : content,
            message: richMessage
          });
        }
      });

    } catch (error) {
      console.error('Socket error sending message:', error);
    }
  });

  // Typing state indicators
  socket.on('typing_start', ({ roomId, userId, username }) => {
    socket.to(roomId).emit('typing_start', { roomId, userId, username });
  });

  socket.on('typing_stop', ({ roomId, userId }) => {
    socket.to(roomId).emit('typing_stop', { roomId, userId });
  });

  // User manual signout / disconnect
  socket.on('disconnect', () => {
    const userId = socket.userId;
    if (userId) {
      activeSockets.delete(userId);
      Users.setOnlineStatus(userId, false);
      io.emit('user_status_changed', { userId, isOnline: false });
      console.log(`User ${userId} went offline`);
    }
  });
});

// ── PRODUCTION catch-all: serve React app for any non-API route ───────────────
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../client/dist/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Client build not found. Run: npm run build');
  }
});

// Run server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`ChatApp Server is running on port ${PORT}`);
});

