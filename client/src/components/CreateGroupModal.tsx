import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { X, Check } from 'lucide-react';
import { ChatUser, SERVER_URL, getAvatarFallback } from '../App';

interface CreateGroupModalProps {
  currentUser: ChatUser;
  contacts: ChatUser[];
  onClose: () => void;
  socket: Socket | null;
  onGroupCreated: (newGroupId: string) => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  currentUser,
  contacts,
  onClose,
  socket,
  onGroupCreated
}) => {
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupAvatar, setGroupAvatar] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId) 
        : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedUserIds.length === 0) {
      alert('Please enter a group name and select at least one contact!');
      return;
    }

    setIsSubmitting(true);
    try {
      const memberIds = [currentUser.id, ...selectedUserIds];
      
      const response = await fetch(`${SERVER_URL}/api/rooms/group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName.trim(),
          avatar: groupAvatar.trim() || undefined,
          memberIds
        })
      });

      if (response.ok) {
        const groupRoom = await response.json();
        
        // Notify socket so all active members join the new room in real time
        if (socket) {
          socket.emit('join_new_room', {
            roomId: groupRoom.id,
            memberIds
          });
        }

        onGroupCreated(groupRoom.id);
      } else {
        alert('Failed to create group');
      }
    } catch (err) {
      console.error('Error creating group chat:', err);
      alert('Error creating group chat!');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {/* Modal Header */}
        <div className="modal-header">
          <h3 className="modal-title">Create Group Chat</h3>
          <button onClick={onClose} className="icon-btn">
            <X size={20} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Group Name</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. Development Team"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={24}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Optional Group Avatar Seed</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. kapse-code"
              value={groupAvatar}
              onChange={(e) => setGroupAvatar(e.target.value ? `https://api.dicebear.com/7.x/identicon/svg?seed=${e.target.value}` : '')}
            />
            {groupAvatar && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img 
                  src={groupAvatar} 
                  alt="Group Avatar Preview" 
                  className="avatar-small" 
                  onError={(e) => { e.currentTarget.src = getAvatarFallback(groupName || 'Group'); }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Avatar Preview</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Select Group Members ({selectedUserIds.length} selected)</label>
            {contacts.length === 0 ? (
              <div style={{ padding: '16px', fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
                No registered contacts found. Have other users register first!
              </div>
            ) : (
              <div className="users-selection-list">
                {contacts.map(contact => {
                  const isSelected = selectedUserIds.includes(contact.id);
                  return (
                    <div 
                      key={contact.id}
                      className={`user-select-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleUserSelection(contact.id)}
                    >
                      <div className="user-select-left">
                        <img 
                          src={contact.avatar} 
                          alt={contact.username} 
                          className="avatar-small" 
                          onError={(e) => { e.currentTarget.src = getAvatarFallback(contact.username); }}
                        />
                        <span style={{ fontSize: '0.95rem' }}>{contact.username}</span>
                      </div>
                      
                      <div className="checkbox-custom">
                        {isSelected && <Check className="checkbox-check" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={isSubmitting || !groupName.trim() || selectedUserIds.length === 0}
            >
              {isSubmitting ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
