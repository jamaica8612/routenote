import React from 'react';
import { X, Megaphone } from 'lucide-react';

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 1) return '방금 전';
  if (diff < 60) return `${diff}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1440)}일 전`;
}

export default function AnnouncementModal({ announcements, onClose, onDismiss }) {
  if (!announcements || announcements.length === 0) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <Megaphone size={18} color="var(--primary)" />
            <h3 style={styles.headerTitle}>공지사항</h3>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} color="var(--text-secondary)" />
          </button>
        </div>

        <div style={styles.body}>
          {announcements.map((item, idx) => (
            <div key={item.id} style={styles.card}>
              <h4 style={styles.cardTitle}>{item.title}</h4>
              <p style={styles.cardContent}>{item.content}</p>
              <div style={styles.cardFooter}>
                <span style={styles.cardTime}>{formatRelativeTime(item.created_at)}</span>
                <button
                  className="btn btn-secondary"
                  style={styles.dismissBtn}
                  onClick={() => onDismiss(item.id)}
                >
                  다시 보지 않기
                </button>
              </div>
              {idx < announcements.length - 1 && <div style={styles.divider} />}
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <button className="btn btn-primary" style={styles.closeMainBtn} onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    animation: 'fadeIn 0.2s ease-out',
  },
  modal: {
    width: '100%',
    maxWidth: '420px',
    maxHeight: '80vh',
    backgroundColor: '#FFFFFF',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--bg-card-border)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerTitle: {
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'var(--bg-input)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    WebkitOverflowScrolling: 'touch',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
    lineHeight: 1.3,
  },
  cardContent: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '4px',
  },
  cardTime: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  dismissBtn: {
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: 600,
    minHeight: '30px',
    borderRadius: 'var(--radius-sm)',
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--bg-card-border)',
    margin: '12px 0',
  },
  footer: {
    padding: '12px 20px 16px',
    borderTop: '1px solid var(--bg-card-border)',
    flexShrink: 0,
  },
  closeMainBtn: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    minHeight: '44px',
  },
};
