import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export default function RoadviewModal({ lat, lng, onClose }) {
  const containerRef = useRef(null);
  const [address, setAddress] = useState('로드뷰 불러오는 중...');

  useEffect(() => {
    if (!window.naver || !window.naver.maps || !window.naver.maps.Panorama) {
      setAddress('네이버 로드뷰 API를 사용할 수 없습니다.');
      return;
    }

    let panorama;
    try {
      panorama = new window.naver.maps.Panorama(containerRef.current, {
        position: new window.naver.maps.LatLng(lat, lng),
        pov: {
          pan: 0,
          tilt: 0,
          fov: 100,
        },
        flightspot: false,
      });

      window.naver.maps.Event.addListener(panorama, 'pano_changed', () => {
        const location = panorama.getLocation();
        if (location && location.address) {
          setAddress(location.address);
        }
      });
    } catch (err) {
      console.error('Error creating panorama instance:', err);
      setAddress('로드뷰를 생성하지 못했습니다.');
    }

    return () => {
      if (panorama && window.naver?.maps?.Event) {
        window.naver.maps.Event.clearInstanceListeners(panorama);
      }
    };
  }, [lat, lng]);

  return (
    <div style={styles.overlay}>
      {/* Top Header Bar */}
      <div style={styles.header}>
        <span style={styles.addressText}>{address}</span>
        <button type="button" style={styles.closeBtn} onClick={onClose} title="닫기">
          <X size={20} color="#FFFFFF" />
        </button>
      </div>

      {/* Panorama Container */}
      <div ref={containerRef} style={styles.panoramaContainer} />
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
    backgroundColor: '#000000',
    zIndex: 1500,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    height: '56px',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
    zIndex: 10,
  },
  addressText: {
    color: 'var(--text-primary)',
    fontSize: '15px',
    fontWeight: '600',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    maxWidth: 'calc(100% - 48px)',
  },
  closeBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  panoramaContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
};
