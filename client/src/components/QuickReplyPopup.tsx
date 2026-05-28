import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { X, Send, MessageSquare } from 'lucide-react';
import { ChatUser, ChatRoom, ChatMessage, SERVER_URL, getAvatarFallback } from '../App';

interface QuickReplyPopupProps {
  currentUser: ChatUser;
  chats: ChatRoom[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  onClose: () => void;
  socket: Socket | null;
  onMessageSent: () => void;
}

const QuickReplyPopup: React.FC<QuickReplyPopupProps> = ({
  currentUser,
  chats,
  activeRoomId,
  onSelectRoom,
  onClose,
  socket,
  onMessageSent
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyInput, setReplyInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch messages inside the popup when the selected quick chat room changes
  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      return;
    }

    fetchMessages();
  }, [activeRoomId]);

  // Keep scroll focused on bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Real-time listener for incoming messages inside the popup itself
  useEffect(() => {
    if (!socket || !activeRoomId) return;

    const handleNewMessage = (msg: ChatMessage) => {
      if (msg.roomId === activeRoomId) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };

    socket.on('new_message', handleNewMessage);
    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, activeRoomId]);

  const fetchMessages = async () => {
    if (!activeRoomId) return;
    try {
      // Fetch history and mark as read automatically
      const res = await fetch(`${SERVER_URL}/api/rooms/${activeRoomId}/messages?userId=${currentUser.id}`);
      if (res.ok) {
        const list = await res.json();
        setMessages(list);
      }
    } catch (err) {
      console.error('Error fetching quick-reply messages:', err);
    }
  };

  const handleQuickSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoomId || !replyInput.trim() || !socket) return;

    // Emit quick message
    socket.emit('send_message', {
      roomId: activeRoomId,
      senderId: currentUser.id,
      content: replyInput.trim()
    });

    setReplyInput('');
    onMessageSent(); // Sync active parent lists
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const activeQuickRoom = chats.find(c => c.id === activeRoomId);

  return (
    <div className="quick-popup-overlay">
      <div className="quick-popup-dashboard">
        
        {/* Left Side: Chats list */}
        <div className="dashboard-left">
          <div className="dashboard-left-header">
            <h4 className="dashboard-title">Quick Reply Dashboard</h4>
            <span className="dashboard-desc">Select active thread to reply</span>
          </div>
          
          <div className="chats-list-scroll">
            {chats.map(chat => {
              const isRoomSelected = chat.id === activeRoomId;
              return (
                <div 
                  key={chat.id}
                  className={`chat-item ${isRoomSelected ? 'active' : ''}`}
                  onClick={() => onSelectRoom(chat.id)}
                >
                  <img 
                    src={chat.avatar} 
                    alt={chat.name} 
                    className="avatar-small" 
                    onError={(e) => { e.currentTarget.src = getAvatarFallback(chat.name); }}
                  />
                  <div className="chat-item-details">
                    <div className="chat-item-row">
                      <span className="chat-item-name">{chat.name}</span>
                      <span className="chat-item-time">
                        {chat.lastMessage ? formatTime(chat.lastMessage.timestamp) : ''}
                      </span>
                    </div>
                    <div className="chat-item-msg-row">
                      <span className="chat-item-lastmsg">
                        {chat.lastMessage ? chat.lastMessage.content : 'No messages yet'}
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
        </div>

        {/* Right Side: Conversation details & Input replies */}
        <div className="dashboard-right">
          {activeQuickRoom ? (
            <>
              {/* Quick Chat Header */}
              <div className="dashboard-right-header">
                <div className="chat-header-left">
                  <img 
                    src={activeQuickRoom.avatar} 
                    alt={activeQuickRoom.name} 
                    className="avatar-small" 
                    onError={(e) => { e.currentTarget.src = getAvatarFallback(activeQuickRoom.name); }}
                  />
                  <div className="chat-title-info">
                    <span className="chat-title-name">{activeQuickRoom.name}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Quick reply session
                    </span>
                  </div>
                </div>
                
                <button onClick={onClose} className="dashboard-close-btn" title="Exit Dashboard">
                  <X size={20} />
                </button>
              </div>

              {/* Message scrollbox */}
              <div className="dashboard-messages-box">
                {messages.map(msg => {
                  const isOutgoing = msg.senderId === currentUser.id;
                  return (
                    <div 
                      key={msg.id}
                      className={`message-bubble-wrapper ${isOutgoing ? 'outgoing' : 'incoming'}`}
                    >
                      {activeQuickRoom.type === 'group' && !isOutgoing && (
                        <span className="message-sender-name">{msg.senderName}</span>
                      )}
                      <div className="message-bubble">
                        {msg.imageUrl && (
                          <img src={msg.imageUrl} alt="Attachment" className="message-image" />
                        )}
                        {msg.content && <p>{msg.content}</p>}
                        <div className="message-bubble-footer">
                          <span>{formatTime(msg.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Reply Form */}
              <div className="dashboard-input-bar">
                <form onSubmit={handleQuickSend} className="chat-input-form">
                  <input 
                    type="text" 
                    className="chat-input" 
                    placeholder="Type quick reply here..."
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    required
                  />
                  <button type="submit" className="send-btn" disabled={!replyInput.trim()}>
                    <Send size={16} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="dashboard-right-empty">
              <MessageSquare size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
              <p>Select a chat on the left panel to quick reply.</p>
              <button 
                onClick={onClose} 
                className="btn-secondary" 
                style={{ marginTop: '20px' }}
              >
                Close Dashboard
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default QuickReplyPopup;
