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
    const users = readDb().users;
    return users.map(u => ({ ...u, friends: u.friends || [] }));
  },

  getById: (id) => {
    const user = readDb().users.find(u => u.id === id);
    if (user) {
      user.friends = user.friends || [];
    }
    return user;
  },

  getByUsername: (username) => {
    const user = readDb().users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (user) {
      user.friends = user.friends || [];
    }
    return user;
  },

  getByEmail: (email) => {
    return readDb().users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  },

  register: (firstName, lastName, email, password, avatar) => {
    const db = readDb();
    const existing = db.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('Email is already registered');
    }

    const username = `${firstName} ${lastName}`;
    const user = {
      id: uuidv4(),
      firstName,
      lastName,
      username,
      email,
      password,
      avatar: avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
      isOnline: true,
      lastSeen: new Date().toISOString(),
      friends: []
    };

    db.users.push(user);
    writeDb(db);
    return user;
  },

  authenticate: (email, password) => {
    const db = readDb();
    const user = db.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== password) {
      return null;
    }

    user.isOnline = true;
    user.lastSeen = new Date().toISOString();
    writeDb(db);
    return user;
  },

  create: (username, avatar) => {
    const db = readDb();
    let user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (user) {
      // User already exists, update avatar and online status
      user.avatar = avatar || user.avatar;
      user.isOnline = true;
      user.lastSeen = new Date().toISOString();
      user.friends = user.friends || [];
    } else {
      // Create new user
      user = {
        id: uuidv4(),
        username,
        avatar: avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
        isOnline: true,
        lastSeen: new Date().toISOString(),
        friends: []
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
  },

  addFriend: (userId, friendId) => {
    const db = readDb();
    const user = db.users.find(u => u.id === userId);
    const friend = db.users.find(u => u.id === friendId);
    if (!user || !friend) return null;

    user.friends = user.friends || [];
    friend.friends = friend.friends || [];

    if (!user.friends.includes(friendId)) {
      user.friends.push(friendId);
    }
    if (!friend.friends.includes(userId)) {
      friend.friends.push(userId);
    }

    writeDb(db);
    return user;
  },

  delete: (id) => {
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === id);
    if (userIndex === -1) return false;
    
    // Remove user
    db.users.splice(userIndex, 1);
    
    // Remove friendship references in other users
    db.users.forEach(u => {
      if (u.friends) {
        u.friends = u.friends.filter(fId => fId !== id);
      }
    });

    // Find rooms user was part of
    const roomsToDelete = [];
    db.rooms.forEach(r => {
      if (r.members.includes(id)) {
        if (r.type === 'direct') {
          roomsToDelete.push(r.id);
        } else {
          r.members = r.members.filter(mId => mId !== id);
        }
      }
    });

    // Clean up empty rooms or group rooms with 0 members
    db.rooms = db.rooms.filter(r => !roomsToDelete.includes(r.id) && r.members.length > 0);

    // Delete messages in deleted rooms
    db.messages = db.messages.filter(m => !roomsToDelete.includes(m.roomId));

    writeDb(db);
    return true;
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
  },

  delete: (roomId) => {
    const db = readDb();
    const roomIndex = db.rooms.findIndex(r => r.id === roomId);
    if (roomIndex === -1) return false;

    db.rooms.splice(roomIndex, 1);
    // Delete all messages belonging to this room
    db.messages = db.messages.filter(m => m.roomId !== roomId);

    writeDb(db);
    return true;
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
