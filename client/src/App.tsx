import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { User, MessageSquare, Image, Bell, Shuffle, LogIn, Mail, Lock } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import QuickReplyPopup from './components/QuickReplyPopup';

// In production, frontend is served from the same Express server so use relative URLs.
// In local dev, the Vite dev server runs on a different port so point to localhost:5000.
export const SERVER_URL = import.meta.env.DEV
  ? 'http://localhost:5000'
  : '';


export interface ChatUser {
  id: string;
  username: string;
  avatar: string;
  isOnline: boolean;
  lastSeen: string;
  friends?: string[];
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  imageUrl?: string;
  timestamp: string;
  readBy: string[];
}

export interface ChatRoom {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatar: string;
  members: string[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
  createdAt: string;
}

export interface MessageAlert {
  roomId: string;
  roomName: string;
  roomAvatar: string;
  senderName: string;
  senderId: string;
  content: string;
  message: ChatMessage;
}

export const getAvatarFallback = (name: string) => {
  const char = name ? name.trim().charAt(0).toUpperCase() : '?';
  let hash = 0;
  const str = name || '';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#10b981', 
    '#f59e0b', '#ef4444', '#14b8a6', '#06b6d4', '#84cc16'
  ];
  const bgColor = colors[Math.abs(hash) % colors.length];
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <rect width="100" height="100" fill="${bgColor}" fill-opacity="1" />
    <text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-size="45" font-weight="700" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${char}</text>
  </svg>`;
  
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

function App() {
  const [currentUser, setCurrentUser] = useState<ChatUser | null>(null);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Real-time Chat state
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const currentUserRef = useRef<ChatUser | null>(null);
  const activeChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Quick Reply WhatsApp-style Notification state
  const [toastAlert, setToastAlert] = useState<MessageAlert | null>(null);
  const [isQuickPopupOpen, setIsQuickPopupOpen] = useState(false);
  const [quickActiveRoomId, setQuickActiveRoomId] = useState<string | null>(null);

  // Initialize browser permissions
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Shuffle Dicebear avatar seed
  const shuffleAvatar = () => {
    const randomSeed = Math.random().toString(36).substring(7);
    setAvatarInput(`https://api.dicebear.com/7.x/adventurer/svg?seed=${randomSeed}`);
  };

  useEffect(() => {
    if (!avatarInput && (firstNameInput || lastNameInput)) {
      setAvatarInput(`https://api.dicebear.com/7.x/adventurer/svg?seed=${firstNameInput}_${lastNameInput}`);
    }
  }, [firstNameInput, lastNameInput]);

  // Authenticate user (unified register & login handler)
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isRegisterMode) {
      if (!firstNameInput.trim() || !lastNameInput.trim() || !emailInput.trim() || !passwordInput) {
        alert("All fields are required for registration.");
        return;
      }
      if (passwordInput !== confirmPasswordInput) {
        alert("Passwords do not match!");
        return;
      }

      setIsLoggingIn(true);
      try {
        const response = await fetch(`${SERVER_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: firstNameInput.trim(),
            lastName: lastNameInput.trim(),
            email: emailInput.trim(),
            password: passwordInput,
            avatar: avatarInput || undefined
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Registration failed');

        setCurrentUser(data);
        localStorage.setItem('talkspace_chat_user', JSON.stringify(data));
      } catch (err: any) {
        console.error('Registration error:', err);
        alert(err.message || 'Registration failed. Please try again!');
      } finally {
        setIsLoggingIn(false);
      }
    } else {
      if (!emailInput.trim() || !passwordInput) return;

      setIsLoggingIn(true);
      try {
        const response = await fetch(`${SERVER_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailInput.trim(),
            password: passwordInput
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Authentication failed');

        setCurrentUser(data);
        localStorage.setItem('talkspace_chat_user', JSON.stringify(data));
      } catch (err: any) {
        console.error('Login error:', err);
        alert(err.message || 'Login failed. Please verify your credentials and try again!');
      } finally {
        setIsLoggingIn(false);
      }
    }
  };

  // Check persistent login on load
  useEffect(() => {
    const stored = localStorage.getItem('talkspace_chat_user');
    if (stored) {
      setCurrentUser(JSON.parse(stored));
    }
  }, []);

  // Setup sockets & fetch initial list on auth
  useEffect(() => {
    if (!currentUser) return;

    // Connect to WebSocket Server
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.emit('user_online', currentUser.id);

    // Initial API fetches
    fetchChats();
    fetchUsers();

    // Listen to real-time socket events
    socket.on('chat_list_refresh', () => {
      fetchChats();
    });

    socket.on('user_status_changed', () => {
      fetchUsers();
      fetchChats();
    });

    socket.on('user_deleted', (deletedUserId: string) => {
      if (currentUserRef.current && currentUserRef.current.id === deletedUserId) {
        handleLogout();
      } else {
        fetchUsers();
        fetchChats();
      }
    });

    socket.on('room_deleted', (deletedRoomId: string) => {
      if (activeChatIdRef.current === deletedRoomId) {
        setActiveChatId(null);
      }
      fetchChats();
    });

    socket.on('new_message', (msg: ChatMessage) => {
      // Mark as read if the active chat window is already opened on this chat
      if (activeChatIdRef.current === msg.roomId) {
        markAsRead(msg.roomId);
      }
      fetchChats();
    });

    // Receive background-alert notification payload (WhatsApp notification system)
    socket.on('message_notification', (alertData: MessageAlert) => {
      // Trigger native browser notification if app is in background/unfocused
      if (document.hidden) {
        showNativeNotification(alertData);
      } else if (activeChatIdRef.current !== alertData.roomId) {
        // App is focused, but user is NOT currently inside the sender's active chat
        setToastAlert(alertData);
        
        // Auto-dismiss floating toast after 5 seconds
        const timer = setTimeout(() => {
          setToastAlert(current => current?.message.id === alertData.message.id ? null : current);
        }, 5000);
        
        return () => clearTimeout(timer);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUser?.id]);

  // Request browser notification
  const showNativeNotification = (alertData: MessageAlert) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(alertData.roomName, {
        body: `${alertData.senderName}: ${alertData.content}`,
        icon: alertData.roomAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=chat',
        tag: alertData.roomId
      });

      notification.onclick = () => {
        window.focus();
        // Trigger dashboard quick reply popup overlay
        setQuickActiveRoomId(alertData.roomId);
        setIsQuickPopupOpen(true);
        notification.close();
      };
    }
  };

  const fetchChats = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms?userId=${currentUser.id}`);
      if (res.ok) {
        const list = await res.json();
        setChats(list);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/users`);
      if (res.ok) {
        const list = await res.json();
        setAllUsers(list);
        
        // Also update currentUser friends list if they have updated in list
        const stored = localStorage.getItem('talkspace_chat_user');
        if (stored) {
          const storedUser = JSON.parse(stored);
          const updatedSelf = list.find((u: ChatUser) => u.id === storedUser.id);
          if (updatedSelf) {
            setCurrentUser(prev => prev ? { ...prev, friends: updatedSelf.friends || [] } : null);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddFriend = async (friendId: string) => {
    if (!currentUser) return;
    try {
      const response = await fetch(`${SERVER_URL}/api/users/friend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          friendId
        })
      });
      if (response.ok) {
        await fetchUsers();
      }
    } catch (err) {
      console.error('Error adding friend:', err);
    }
  };

  const markAsRead = async (roomId: string) => {
    if (!currentUser) return;
    try {
      await fetch(`${SERVER_URL}/api/rooms/${roomId}/messages?userId=${currentUser.id}`);
      setChats(prev => prev.map(chat => {
        if (chat.id === roomId) {
          return { ...chat, unreadCount: 0 };
        }
        return chat;
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const selectChat = (roomId: string) => {
    setActiveChatId(roomId);
    markAsRead(roomId);
  };

  // Sign out
  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    localStorage.removeItem('talkspace_chat_user');
    setCurrentUser(null);
    setActiveChatId(null);
    setChats([]);
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    if (!window.confirm("Are you sure you want to permanently delete your account? This action cannot be undone.")) return;
    
    try {
      const response = await fetch(`${SERVER_URL}/api/users/${currentUser.id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        handleLogout();
      } else {
        alert("Failed to delete account.");
      }
    } catch (err) {
      console.error('Error deleting account:', err);
      alert("Error deleting account.");
    }
  };

  // Toggle quick-reply overlay from toast banner click
  const handleToastClick = () => {
    if (toastAlert) {
      setQuickActiveRoomId(toastAlert.roomId);
      setIsQuickPopupOpen(true);
      setToastAlert(null);
    }
  };

  // If user is not logged in, render gorgeous auth card
  if (!currentUser) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card" style={{ maxWidth: isRegisterMode ? '480px' : '400px' }}>
          <div className="auth-logo">TalkSpace</div>
          <div className="auth-tagline">
            {isRegisterMode ? 'Create a new account' : 'Real-Time Messaging & Groups'}
          </div>
          
          <form onSubmit={handleAuthSubmit}>
            <div style={{ 
              maxHeight: isRegisterMode ? '320px' : 'none', 
              overflowY: isRegisterMode ? 'auto' : 'visible', 
              paddingRight: isRegisterMode ? '8px' : '0px',
              marginBottom: '20px'
            }}>
              {isRegisterMode && (
                <div className="avatar-preview-section">
                  <img 
                    src={avatarInput || 'https://api.dicebear.com/7.x/adventurer/svg?seed=welcome'} 
                    alt="Avatar Preview" 
                    className="avatar-large"
                    onError={(e) => { e.currentTarget.src = getAvatarFallback(firstNameInput || 'Guest'); }}
                  />
                  <button 
                    type="button" 
                    onClick={shuffleAvatar} 
                    className="avatar-shuffle-btn"
                  >
                    <Shuffle size={14} /> Shuffle Avatar
                  </button>
                </div>
              )}

              {isRegisterMode ? (
                <>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <div className="auth-form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label className="auth-label">First Name</label>
                      <div className="auth-input-wrapper">
                        <User className="auth-input-icon" size={18} />
                        <input 
                          type="text" 
                          className="auth-input" 
                          placeholder="Alex"
                          value={firstNameInput}
                          onChange={(e) => setFirstNameInput(e.target.value)}
                          maxLength={14}
                          required
                        />
                      </div>
                    </div>
                    <div className="auth-form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label className="auth-label">Last Name</label>
                      <div className="auth-input-wrapper">
                        <User className="auth-input-icon" size={18} />
                        <input 
                          type="text" 
                          className="auth-input" 
                          placeholder="Smith"
                          value={lastNameInput}
                          onChange={(e) => setLastNameInput(e.target.value)}
                          maxLength={14}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="auth-form-group" style={{ marginBottom: '16px' }}>
                    <label className="auth-label">Email Address</label>
                    <div className="auth-input-wrapper">
                      <Mail className="auth-input-icon" size={18} />
                      <input 
                        type="email" 
                        className="auth-input" 
                        placeholder="alex.smith@example.com"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="auth-form-group" style={{ marginBottom: '16px' }}>
                    <label className="auth-label">Password</label>
                    <div className="auth-input-wrapper">
                      <Lock className="auth-input-icon" size={18} />
                      <input 
                        type="password" 
                        className="auth-input" 
                        placeholder="Min 6 characters"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="auth-form-group" style={{ marginBottom: '12px' }}>
                    <label className="auth-label">Confirm Password</label>
                    <div className="auth-input-wrapper">
                      <Lock className="auth-input-icon" size={18} />
                      <input 
                        type="password" 
                        className="auth-input" 
                        placeholder="Repeat password"
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="auth-form-group" style={{ marginBottom: '16px' }}>
                    <label className="auth-label">Email Address</label>
                    <div className="auth-input-wrapper">
                      <Mail className="auth-input-icon" size={18} />
                      <input 
                        type="email" 
                        className="auth-input" 
                        placeholder="alex.smith@example.com"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="auth-form-group" style={{ marginBottom: '24px' }}>
                    <label className="auth-label">Password</label>
                    <div className="auth-input-wrapper">
                      <Lock className="auth-input-icon" size={18} />
                      <input 
                        type="password" 
                        className="auth-input" 
                        placeholder="Enter your password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <button 
              type="submit" 
              className="auth-submit-btn"
              disabled={isLoggingIn}
            >
              {isLoggingIn 
                ? (isRegisterMode ? 'Creating Account...' : 'Signing In...') 
                : (isRegisterMode ? 'Sign Up' : 'Sign In')}
            </button>
          </form>

          <div style={{ marginTop: '20px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {isRegisterMode ? (
              <>
                Already have an account?{' '}
                <span 
                  onClick={() => setIsRegisterMode(false)} 
                  style={{ color: 'var(--accent-light)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
                >
                  Sign In
                </span>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <span 
                  onClick={() => setIsRegisterMode(true)} 
                  style={{ color: 'var(--accent-light)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
                >
                  Sign Up
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Find active chat details
  const activeChat = chats.find(c => c.id === activeChatId);

  return (
    <div className={`app-container ${activeChatId ? 'chat-active' : ''}`}>
      {/* Sidebar: Left Panel */}
      <Sidebar 
        currentUser={currentUser}
        chats={chats}
        allUsers={allUsers}
        activeChatId={activeChatId}
        onSelectChat={selectChat}
        onLogout={handleLogout}
        socket={socketRef.current}
        onRoomCreated={(newRoomId) => {
          fetchChats();
          selectChat(newRoomId);
        }}
        onAddFriend={handleAddFriend}
        onDeleteAccount={handleDeleteAccount}
      />

      {/* Chat Area: Main Panel */}
      <ChatArea 
        currentUser={currentUser}
        activeChat={activeChat || null}
        socket={socketRef.current}
        onBack={() => setActiveChatId(null)}
      />

      {/* Floating In-App WhatsApp notification banner */}
      {toastAlert && (
        <div className="quick-toast-banner" onClick={handleToastClick}>
          <img 
            src={toastAlert.roomAvatar} 
            alt="Notification Avatar" 
            className="toast-avatar" 
            onError={(e) => { e.currentTarget.src = getAvatarFallback(toastAlert.roomName); }}
          />
          <div className="toast-body">
            <div className="toast-title">{toastAlert.roomName}</div>
            <div className="toast-sender">{toastAlert.senderName}</div>
            <div className="toast-content">{toastAlert.content}</div>
            <span className="toast-hint">Click to quick-reply</span>
          </div>
        </div>
      )}

      {/* WhatsApp Quick Reply Popup Overlay */}
      {isQuickPopupOpen && (
        <QuickReplyPopup 
          currentUser={currentUser}
          chats={chats}
          activeRoomId={quickActiveRoomId}
          onSelectRoom={setQuickActiveRoomId}
          onClose={() => setIsQuickPopupOpen(false)}
          socket={socketRef.current}
          onMessageSent={() => {
            fetchChats();
          }}
        />
      )}
    </div>
  );
}

export default App;
