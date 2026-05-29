import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Send, Paperclip, X, ArrowLeft, Image as ImageIcon, Smile, MessageSquare, Trash2 } from 'lucide-react';
import { ChatUser, ChatRoom, ChatMessage, SERVER_URL, getAvatarFallback } from '../App';

interface ChatAreaProps {
  currentUser: ChatUser;
  activeChat: ChatRoom | null;
  socket: Socket | null;
  onBack: () => void;
}

interface TypingUser {
  userId: string;
  username: string;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  currentUser,
  activeChat,
  socket,
  onBack
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDeleteChat = async () => {
    if (!activeChat) return;
    if (!window.confirm("Are you sure you want to permanently delete this chat? This will delete all messages in this conversation.")) return;
    
    try {
      const response = await fetch(`${SERVER_URL}/api/rooms/${activeChat.id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        alert("Failed to delete chat room.");
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
      alert("Error deleting chat.");
    }
  };

  // Fetch messages when active chat changes
  useEffect(() => {
    if (!activeChat) return;

    fetchMessages();
    setTypingUsers([]);
    setSelectedFile(null);
    setFilePreview(null);
    setTextInput('');

    // Mark room join or read receipts
    if (socket) {
      socket.emit('typing_stop', { roomId: activeChat.id, userId: currentUser.id });
    }
  }, [activeChat]);

  // Scroll to bottom whenever messages or typing state changes
  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUsers]);

  // Socket listener for incoming room-specific events (typing indicators)
  useEffect(() => {
    if (!socket || !activeChat) return;

    socket.on('new_message', (msg: ChatMessage) => {
      if (msg.roomId === activeChat.id) {
        setMessages(prev => {
          // Prevent duplicates
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });

    socket.on('typing_start', ({ roomId, userId, username }) => {
      if (roomId === activeChat.id && userId !== currentUser.id) {
        setTypingUsers(prev => {
          if (prev.some(u => u.userId === userId)) return prev;
          return [...prev, { userId, username }];
        });
      }
    });

    socket.on('typing_stop', ({ roomId, userId }) => {
      if (roomId === activeChat.id) {
        setTypingUsers(prev => prev.filter(u => u.userId !== userId));
      }
    });

    return () => {
      socket.off('new_message');
      socket.off('typing_start');
      socket.off('typing_stop');
    };
  }, [socket, activeChat, currentUser.id]);

  const fetchMessages = async () => {
    if (!activeChat) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms/${activeChat.id}/messages?userId=${currentUser.id}`);
      if (res.ok) {
        const list = await res.json();
        setMessages(list);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle typing status triggers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextInput(e.target.value);

    if (!socket || !activeChat) return;

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing_start', {
        roomId: activeChat.id,
        userId: currentUser.id,
        username: currentUser.username
      });
    }

    // Debounce typing_stop
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing_stop', {
        roomId: activeChat.id,
        userId: currentUser.id
      });
    }, 2000);
  };

  // Trigger file dialog
  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Clear preview
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || (!textInput.trim() && !selectedFile)) return;

    let uploadedImageUrl = '';

    // If there is an image to upload, upload it to the Express backend first
    if (selectedFile) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('image', selectedFile);

      try {
        const response = await fetch(`${SERVER_URL}/api/upload`, {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const data = await response.json();
          uploadedImageUrl = data.imageUrl;
        } else {
          alert('Could not upload image. Please make sure the format is valid and file size is < 5MB');
          setIsUploading(false);
          return;
        }
      } catch (err) {
        console.error('File upload error:', err);
        alert('File upload failed!');
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    // Emit message to Socket
    if (socket) {
      socket.emit('send_message', {
        roomId: activeChat.id,
        senderId: currentUser.id,
        content: textInput.trim(),
        imageUrl: uploadedImageUrl
      });
      
      // Stop typing immediately
      if (isTyping) {
        setIsTyping(false);
        socket.emit('typing_stop', {
          roomId: activeChat.id,
          userId: currentUser.id
        });
      }
    }

    // Reset input fields
    setTextInput('');
    setSelectedFile(null);
    setFilePreview(null);
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // If no chat is open, show empty workspace
  if (!activeChat) {
    return (
      <div className="chat-window-empty">
        <MessageSquare size={80} style={{ opacity: 0.15, background: 'var(--accent-gradient)', padding: '16px', borderRadius: '24px', color: 'white' }} />
        <div className="empty-logo">Welcome to TalkSpace</div>
        <p className="empty-text">Select a user or join a group chat from the sidebar panel to begin your real-time conversations.</p>
      </div>
    );
  }

  return (
    <div className="chat-window">
      {/* Header Info */}
      <div className="chat-header">
        <div className="chat-header-left">
          <button onClick={onBack} className="icon-btn back-btn">
            <ArrowLeft size={20} />
          </button>
          
          <img 
            src={activeChat.avatar} 
            alt={activeChat.name} 
            className="avatar-small" 
            onError={(e) => { e.currentTarget.src = getAvatarFallback(activeChat.name); }}
          />
          
          <div className="chat-title-info">
            <span className="chat-title-name">{activeChat.name}</span>
            <span className="chat-title-members">
              {activeChat.type === 'group' 
                ? `${activeChat.members.length} members` 
                : '1-1 Conversation'}
            </span>
          </div>
        </div>
        
        <div className="chat-header-right">
          <button 
            onClick={handleDeleteChat} 
            className="icon-btn" 
            title="Delete Chat"
            style={{ color: '#ef4444' }}
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {/* Message Feed list */}
      <div className="chat-messages-area">
        {messages.map(msg => {
          const isOutgoing = msg.senderId === currentUser.id;
          return (
            <div 
              key={msg.id}
              className={`message-bubble-wrapper ${isOutgoing ? 'outgoing' : 'incoming'}`}
            >
              {activeChat.type === 'group' && !isOutgoing && (
                <span className="message-sender-name">{msg.senderName}</span>
              )}
              
              <div className="message-bubble">
                {msg.imageUrl && (
                  <a href={msg.imageUrl} target="_blank" rel="noreferrer">
                    <img src={msg.imageUrl} alt="Shared attachment" className="message-image" />
                  </a>
                )}
                {msg.content && <p>{msg.content}</p>}
                
                <div className="message-bubble-footer">
                  <span>{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Real-time typing states */}
        {typingUsers.map(user => (
          <div key={user.userId} className="typing-indicator-wrapper">
            <div className="typing-indicator-bubble">
              <span className="typing-text">{user.username} is typing</span>
              <span className="dot-animation"></span>
              <span className="dot-animation"></span>
              <span className="dot-animation"></span>
            </div>
          </div>
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input controls form */}
      <div className="chat-input-area">
        {/* Attachment Image Preview bar */}
        {filePreview && (
          <div className="image-preview-bar">
            <div className="preview-thumbnail-wrapper">
              <img src={filePreview} alt="Upload preview" className="preview-thumbnail" />
              <div className="preview-info">
                <span className="preview-title">{selectedFile?.name}</span>
                <span className="preview-size">
                  {selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : ''}
                </span>
              </div>
            </div>
            
            <button onClick={handleRemoveFile} className="icon-btn">
              <X size={18} />
            </button>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="chat-input-form">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            style={{ display: 'none' }} 
            accept="image/*"
          />
          
          <button 
            type="button" 
            onClick={handleAttachmentClick} 
            className="icon-btn"
            title="Attach Image"
            disabled={isUploading}
          >
            <Paperclip size={20} />
          </button>
          
          <div className="chat-input-container">
            <input 
              type="text" 
              className="chat-input" 
              placeholder={isUploading ? "Uploading image attachment..." : "Type your message here..."}
              value={textInput}
              onChange={handleInputChange}
              disabled={isUploading}
            />
          </div>

          <button 
            type="submit" 
            className="send-btn" 
            disabled={(!textInput.trim() && !selectedFile) || isUploading}
          >
            <Send size={18} style={{ marginLeft: '2px' }} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatArea;
