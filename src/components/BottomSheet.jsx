import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export default function BottomSheet({ isOpen, onClose, title, children }) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const sheetRef = useRef(null);
  const dragStart = useRef({ x: 0, y: 0 });

  // Update layout type based on window resize
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setPosition({ x: 0, y: 0 }); // Reset window offset on open
      
      // Prevent background scrolling only on mobile sheets
      if (!isDesktop) {
        document.body.style.overflow = 'hidden';
      }
    } else {
      const timer = setTimeout(() => setShouldRender(false), 250);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
  }, [isOpen, isDesktop]);

  // Handle Drag Start
  const handleDragStart = (e) => {
    if (!isDesktop) return; // Disable dragging on mobile bottom sheet
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    e.preventDefault();
  };

  // Handle Drag Move & End
  useEffect(() => {
    const handleDragMove = (e) => {
      if (!isDragging) return;
      const newX = e.clientX - dragStart.current.x;
      const newY = e.clientY - dragStart.current.y;
      
      // Boundary safety: Keep window within viewport limits
      const halfWidth = sheetRef.current ? sheetRef.current.offsetWidth / 2 : 240;
      const halfHeight = sheetRef.current ? sheetRef.current.offsetHeight / 2 : 300;
      
      const maxX = window.innerWidth / 2 - 20;
      const maxY = window.innerHeight / 2 - 20;
      
      const boundedX = Math.max(-maxX + halfWidth, Math.min(maxX - halfWidth, newX));
      const boundedY = Math.max(-maxY + halfHeight, Math.min(maxY - halfHeight, newY));
      
      setPosition({ x: boundedX, y: boundedY });
    };

    const handleDragEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging]);

  if (!shouldRender) return null;

  // Responsive Styles
  const sheetStyles = isDesktop 
    ? {
        ...styles.sheet,
        position: 'absolute',
        top: '50%',
        left: '50%',
        bottom: 'auto',
        transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--bg-card-border)',
        boxShadow: 'var(--shadow-lg)',
        maxHeight: '80vh',
        cursor: isDragging ? 'grabbing' : 'default',
        pointerEvents: 'auto', // Enable pointer events for modal content on desktop
        // Smoother drag transition when NOT dragging (opening animations)
        transition: isDragging 
          ? 'none' 
          : 'transform 0.25s cubic-bezier(0.1, 0.76, 0.55, 0.94), opacity 0.25s ease-out',
      }
    : {
        ...styles.sheet,
        position: 'fixed',
        bottom: '0',
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        borderTopLeftRadius: 'var(--radius-lg)',
        borderTopRightRadius: 'var(--radius-lg)',
        pointerEvents: 'auto',
        transition: 'transform 0.25s cubic-bezier(0.1, 0.76, 0.55, 0.94)',
      };

  const overlayStyles = isDesktop
    ? {
        ...styles.overlay,
        backgroundColor: 'transparent', // No dimmed backdrop on desktop to see map clearly
        pointerEvents: 'none', // Allow clicks/drags to pass through to the map underneath
      }
    : {
        ...styles.overlay,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        pointerEvents: isOpen ? 'all' : 'none',
      };

  return (
    <div style={{
      ...overlayStyles,
      opacity: isOpen ? 1 : 0,
    }} onClick={isDesktop ? undefined : onClose}>
      
      <div 
        className="glass" 
        style={sheetStyles}
        onClick={(e) => e.stopPropagation()}
        ref={sheetRef}
      >
        {/* Top visual handlebar (acting as drag controller on PC) */}
        <div 
          style={{
            ...styles.dragHandleContainer,
            cursor: isDesktop ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
          }}
          onMouseDown={handleDragStart}
        >
          <div style={styles.dragHandle}></div>
        </div>

        {/* Header (acting as drag controller on PC) */}
        <div 
          style={{
            ...styles.header,
            cursor: isDesktop ? (isDragging ? 'grabbing' : 'grab') : 'default',
            userSelect: 'none',
          }}
          onMouseDown={handleDragStart}
        >
          <h3 style={styles.headerTitle}>{title}</h3>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={20} color="var(--text-secondary)" />
          </button>
        </div>

        {/* Content area */}
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    transition: 'opacity 0.25s ease-out',
  },
  sheet: {
    width: '90%',
    maxWidth: '460px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 'calc(var(--safe-bottom) + 8px)',
  },
  dragHandleContainer: {
    width: '100%',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
    fontSize: '17px',
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
    WebkitOverflowScrolling: 'touch',
  },
};
