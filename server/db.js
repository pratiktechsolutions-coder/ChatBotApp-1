const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_FILE = path.join(__dirname, 'db.json');

// Initialize database with default structure if it doesn't exist
function initDb() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
      users: [],
      rooms: [],
      messages: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
  }
}

// Read database contents
function readDb() {
  try {
    initDb();
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database:', error);
    return { users: [], rooms: [], messages: [] };
  }
}

// Write database contents (synchronous for simple transaction safety)
function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error writing database:', error);
    return false;
  }
}

// USER API
const Users = {
  getAll: () => {
    return readDb().users;
  },

  getById: (id) => {
    return readDb().users.find(u => u.id === id);
  },

  getByUsername: (username) => {
    return readDb().users.find(u => u.username.toLowerCase() === username.toLowerCase());
  },

  create: (username, avatar) => {
    const db = readDb();
    let user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (user) {
      // User already exists, update avatar and online status
      user.avatar = avatar || user.avatar;
      user.isOnline = true;
      user.lastSeen = new Date().toISOString();
    } else {
      // Create new user
      user = {
        id: uuidv4(),
        username,
        avatar: avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
        isOnline: true,
        lastSeen: new Date().toISOString()
      };
      db.users.push(user);
    }
    
    writeDb(db);
    return user;
  },

  setOnlineStatus: (id, isOnline) => {
    const db = readDb();
    const user = db.users.find(u => u.id === id);
    if (user) {
      user.isOnline = isOnline;
      user.lastSeen = new Date().toISOString();
      writeDb(db);
    }
    return user;
  }
};

// ROOMS (CHATS) API
const Rooms = {
  getAll: () => {
    return readDb().rooms;
  },

  getById: (id) => {
    return readDb().rooms.find(r => r.id === id);
  },

  getForUser: (userId) => {
    const db = readDb();
    return db.rooms.filter(r => r.members.includes(userId));
  },

  createDirect: (user1Id, user2Id) => {
    const db = readDb();
    
    // Check if direct room already exists
    let room = db.rooms.find(r => 
      r.type === 'direct' && 
      r.members.includes(user1Id) && 
      r.members.includes(user2Id)
    );
    
    if (room) return room;

    const user1 = db.users.find(u => u.id === user1Id);
    const user2 = db.users.find(u => u.id === user2Id);

    if (!user1 || !user2) return null;

    room = {
      id: uuidv4(),
      type: 'direct',
      members: [user1Id, user2Id],
      name: '', // In direct chats, name is derived from the other member's name dynamically in the client
      avatar: '',
      createdAt: new Date().toISOString()
    };

    db.rooms.push(room);
    writeDb(db);
    return room;
  },

  createGroup: (name, avatar, memberIds) => {
    const db = readDb();
    const room = {
      id: uuidv4(),
      type: 'group',
      name: name,
      avatar: avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${name}`,
      members: memberIds,
      createdAt: new Date().toISOString()
    };

    db.rooms.push(room);
    writeDb(db);
    return room;
  }
};

// MESSAGES API
const Messages = {
  getByRoomId: (roomId) => {
    const db = readDb();
    return db.messages.filter(m => m.roomId === roomId);
  },

  create: (roomId, senderId, content, imageUrl = '') => {
    const db = readDb();
    
    // Double check if room exists
    const room = db.rooms.find(r => r.id === roomId);
    if (!room) return null;

    const message = {
      id: uuidv4(),
      roomId,
      senderId,
      content,
      imageUrl,
      timestamp: new Date().toISOString(),
      readBy: [senderId] // Initially read by the sender
    };

    db.messages.push(message);
    writeDb(db);
    return message;
  },

  markAsRead: (roomId, userId) => {
    const db = readDb();
    let updated = false;

    db.messages.forEach(m => {
      if (m.roomId === roomId && !m.readBy.includes(userId)) {
        m.readBy.push(userId);
        updated = true;
      }
    });

    if (updated) {
      writeDb(db);
    }
    return updated;
  },

  getUnreadCounts: (userId) => {
    const db = readDb();
    const userRooms = db.rooms.filter(r => r.members.includes(userId));
    const counts = {};

    userRooms.forEach(room => {
      const roomMessages = db.messages.filter(m => m.roomId === room.id);
      const unread = roomMessages.filter(m => !m.readBy.includes(userId));
      counts[room.id] = unread.length;
    });

    return counts;
  }
};

module.exports = {
  initDb,
  Users,
  Rooms,
  Messages
};
