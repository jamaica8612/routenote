import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export default function BottomSheet({ isOpen, onClose, title, children }) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const sheetRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setShouldRender(false), 250); // Match transition duration
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div style={{
      ...styles.overlay,
      opacity: isOpen ? 1 : 0,
      pointerEvents: isOpen ? 'all' : 'none',
    }} onClick={onClose}>
      
      <div 
        className="glass" 
        style={{
          ...styles.sheet,
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        }}
        onClick={(e) => e.stopPropagation()}
        ref={sheetRef}
      >
        {/* Handle for visual indicator */}
        <div style={styles.dragHandleContainer}>
          <div style={styles.dragHandle}></div>
        </div>

        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.headerTitle}>{title}</h3>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={20} color="var(--text-secondary)" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={styles.content}>
          {children}
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
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    transition: 'opacity 0.25s ease-out',
  },
  sheet: {
    width: '100%',
    maxWidth: '480px', // Mobile optimized width
    maxHeight: '85vh',
    borderTopLeftRadius: 'var(--radius-lg)',
    borderTopRightRadius: 'var(--radius-lg)',
    borderTop: '1px solid var(--bg-card-border)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.25s cubic-bezier(0.1, 0.76, 0.55, 0.94)',
    paddingBottom: 'calc(var(--safe-bottom) + 8px)',
    boxShadow: '0 -10px 25px rgba(0,0,0,0.3)',
  },
  dragHandleContainer: {
    width: '100%',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    cursor: 'pointer',
  },
  dragHandle: {
    width: '40px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'var(--bg-card-border)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px 12px 20px',
    borderBottom: '1px solid var(--bg-card-border)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)',
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
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    WebkitOverflowScrolling: 'touch', // Smooth iOS scroll
  },
};
