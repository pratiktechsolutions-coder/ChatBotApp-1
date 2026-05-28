import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { Search, Users, LogOut, Plus, MessageSquare, ShieldAlert } from 'lucide-react';
import { ChatUser, ChatRoom, SERVER_URL, getAvatarFallback } from '../App';
import CreateGroupModal from './CreateGroupModal';

interface SidebarProps {
  currentUser: ChatUser;
  chats: ChatRoom[];
  allUsers: ChatUser[];
  activeChatId: string | null;
  onSelectChat: (roomId: string) => void;
  onLogout: () => void;
  socket: Socket | null;
  onRoomCreated: (newRoomId: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  chats,
  allUsers,
  activeChatId,
  onSelectChat,
  onLogout,
  socket,
  onRoomCreated
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  // Exclude current user from contact lists
  const contacts = allUsers.filter(u => u.id !== currentUser.id);

  // Filter existing chats based on search
  const filteredChats = chats.filter(chat => 
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter contacts who are not already in a 1-1 chat
  const filteredContacts = contacts.filter(contact => {
    // Check if we already have a direct chat with this contact
    const hasDirectChat = chats.some(c => 
      c.type === 'direct' && c.members.includes(contact.id)
    );
    
    // Check if username matches search query
    const matchesSearch = contact.username.toLowerCase().includes(searchQuery.toLowerCase());
    
    return !hasDirectChat && matchesSearch;
  });

  // Handle clicking a contact to start/open direct chat
  const handleContactClick = async (contact: ChatUser) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/rooms/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user1Id: currentUser.id,
          user2Id: contact.id
        })
      });

      if (response.ok) {
        const directRoom: ChatRoom = await response.json();
        
        // Notify socket of new room join
        if (socket) {
          socket.emit('join_new_room', {
            roomId: directRoom.id,
            memberIds: [currentUser.id, contact.id]
          });
        }

        onRoomCreated(directRoom.id);
        setSearchQuery(''); // clear search
      }
    } catch (err) {
      console.error('Error starting direct chat:', err);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="sidebar-panel">
      {/* Sidebar Header: Current User Info */}
      <div className="sidebar-header">
        <div className="header-user-profile">
          <img 
            src={currentUser.avatar} 
            alt={currentUser.username} 
            className="avatar-small" 
            onError={(e) => { e.currentTarget.src = getAvatarFallback(currentUser.username); }}
          />
          <div className="profile-info">
            <span className="profile-username">{currentUser.username}</span>
            <span className="profile-status">
              <span className="pulse-indicator"></span> Online
            </span>
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setIsGroupModalOpen(true)} 
            className="icon-btn" 
            title="Create Group Chat"
          >
            <Plus size={20} />
          </button>
          <button 
            onClick={onLogout} 
            className="icon-btn" 
            title="Log Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Search Contacts & Groups */}
      <div className="sidebar-search-container">
        <Search className="sidebar-search-icon" size={16} />
        <input 
          type="text" 
          className="sidebar-search-input" 
          placeholder="Search chats or new users..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Chats List */}
      <div className="chats-list-scroll">
        {/* Active Chat rooms (both direct and group) */}
        {filteredChats.length > 0 && (
          <div>
            <div className="list-section-title">Active Conversations</div>
            {filteredChats.map(chat => {
              // Find direct user online status
              let isOnline = false;
              if (chat.type === 'direct') {
                const otherMemberId = chat.members.find(id => id !== currentUser.id);
                const otherUser = allUsers.find(u => u.id === otherMemberId);
                isOnline = otherUser ? otherUser.isOnline : false;
              }

              return (
                <div 
                  key={chat.id}
                  className={`chat-item ${activeChatId === chat.id ? 'active' : ''}`}
                  onClick={() => onSelectChat(chat.id)}
                >
                  <div className="chat-avatar-wrapper">
                    <img 
                      src={chat.avatar} 
                      alt={chat.name} 
                      className="avatar-small" 
                      onError={(e) => { e.currentTarget.src = getAvatarFallback(chat.name); }}
                    />
                    {chat.type === 'direct' && (
                      <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}></span>
                    )}
                  </div>
                  
                  <div className="chat-item-details">
                    <div className="chat-item-row">
                      <span className="chat-item-name">{chat.name}</span>
                      <span className="chat-item-time">
                        {chat.lastMessage 
                          ? formatTime(chat.lastMessage.timestamp) 
                          : chat.createdAt ? formatTime(chat.createdAt) : ''}
                      </span>
                    </div>
                    
                    <div className="chat-item-msg-row">
                      <span className="chat-item-lastmsg">
                        {chat.lastMessage 
                          ? `${chat.lastMessage.senderId === currentUser.id ? 'You: ' : `${chat.lastMessage.senderName}: `}${chat.lastMessage.content}` 
                          : 'No messages yet'}
                      </span>
                      {chat.unreadCount > 0 && (
                        <span className="unread-badge">{chat.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Dynamic User Contacts to initiate conversations */}
        {filteredContacts.length > 0 && (
          <div>
            <div className="list-section-title">Start a Chat</div>
            {filteredContacts.map(contact => (
              <div 
                key={contact.id}
                className="chat-item"
                onClick={() => handleContactClick(contact)}
              >
                <div className="chat-avatar-wrapper">
                  <img 
                    src={contact.avatar} 
                    alt={contact.username} 
                    className="avatar-small" 
                    onError={(e) => { e.currentTarget.src = getAvatarFallback(contact.username); }}
                  />
                  <span className={`status-badge ${contact.isOnline ? 'online' : 'offline'}`}></span>
                </div>
                
                <div className="chat-item-details">
                  <div className="chat-item-row">
                    <span className="chat-item-name">{contact.username}</span>
                  </div>
                  <div className="chat-item-msg-row">
                    <span className="chat-item-lastmsg" style={{ color: 'var(--text-muted)' }}>
                      Click to send direct message
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredChats.length === 0 && filteredContacts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <MessageSquare size={32} style={{ marginBottom: '10px', opacity: 0.3 }} />
            <p style={{ fontSize: '0.85rem' }}>No conversations or new users found</p>
          </div>
        )}
      </div>

      {/* Modal Overlay to Create Group */}
      {isGroupModalOpen && (
        <CreateGroupModal 
          currentUser={currentUser}
          contacts={contacts}
          onClose={() => setIsGroupModalOpen(false)}
          socket={socket}
          onGroupCreated={(newGroupId) => {
            setIsGroupModalOpen(false);
            onRoomCreated(newGroupId);
          }}
        />
      )}
    </div>
  );
};

export default Sidebar;
