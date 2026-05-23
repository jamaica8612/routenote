import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { CheckCircle, Shield, MapPin, Truck, Key } from 'lucide-react';

export default function AuthScreen({ onDemoLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Attempt Google OAuth sign-in
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
        },
      });
      
      if (error) throw error;
    } catch (err) {
      console.error('Google Sign-in Error:', err);
      setError('구글 로그인 중 오류가 발생했습니다. 아래의 데모 모드로 테스트해보실 수 있습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.backgroundGlow1}></div>
      <div style={styles.backgroundGlow2}></div>

      <div className="glass" style={styles.loginCard}>
        {/* Logo and App Title */}
        <div style={styles.logoContainer}>
          <div style={styles.logoIcon}>
            <Truck size={32} color="#FFFFFF" />
          </div>
          <h1 style={styles.title}>구역노트</h1>
          <p style={styles.subtitle}>Route Note</p>
        </div>

        {/* Feature Highlights */}
        <div style={styles.features}>
          <div style={styles.featureItem}>
            <MapPin size={20} color="#6366F1" style={styles.featureIcon} />
            <div>
              <h4 style={styles.featureTitle}>배송 구역 매핑</h4>
              <p style={styles.featureDesc}>관리자가 설정한 배송 폴리곤 구역을 실시간으로 확인합니다.</p>
            </div>
          </div>
          <div style={styles.featureItem}>
            <Key size={20} color="#10B981" style={styles.featureIcon} />
            <div>
              <h4 style={styles.featureTitle}>배송 팁 마커 관리</h4>
              <p style={styles.featureDesc}>공동현관 비밀번호, 정차 구역, 진입로 등을 지도에 저장합니다.</p>
            </div>
          </div>
          <div style={styles.featureItem}>
            <Shield size={20} color="#F59E0B" style={styles.featureIcon} />
            <div>
              <h4 style={styles.featureTitle}>실시간 이력 및 사진</h4>
              <p style={styles.featureDesc}>누가 팁을 수정했는지 기록을 남기고, 사진을 첨부해 현장을 공유합니다.</p>
            </div>
          </div>
        </div>

        {error && <div style={styles.errorText}>{error}</div>}

        {/* Main Google Login Button */}
        <button
          className="btn btn-primary"
          style={styles.googleBtn}
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          {loading ? '로그인 연결 중...' : '구글 계정으로 로그인'}
        </button>

        {/* Local/Demo Testing Area */}
        <div style={styles.dividerContainer}>
          <div style={styles.dividerLine}></div>
          <span style={styles.dividerText}>또는 테스트 모드</span>
          <div style={styles.dividerLine}></div>
        </div>

        <p style={styles.demoNotice}>
          OAuth 설정 전이거나 빠른 확인을 원하시면, 아래 데모 버튼을 클릭하여 관리자(Admin) 또는 멤버(Member) 권한으로 즉시 웹앱을 사용해볼 수 있습니다.
        </p>

        <div style={styles.demoBtnGroup}>
          <button
            className="btn btn-secondary"
            style={{ ...styles.demoBtn, borderColor: '#6366F1' }}
            onClick={() => onDemoLogin({ id: 'demo-admin-id', email: 'admin@routenote.com', name: '홍길동(관리자)', role: 'admin', avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80' })}
          >
            관리자 데모 시작
          </button>
          <button
            className="btn btn-secondary"
            style={styles.demoBtn}
            onClick={() => onDemoLogin({ id: 'demo-member-id', email: 'driver@routenote.com', name: '이몽룡(기사님)', role: 'member', avatar_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=100&q=80' })}
          >
            일반 멤버 데모 시작
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    padding: '24px',
    backgroundColor: '#0B0F19', // Dark background override
    position: 'relative',
    overflow: 'hidden',
  },
  backgroundGlow1: {
    position: 'absolute',
    width: '300px',
    height: '300px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(0,0,0,0) 70%)',
    top: '10%',
    left: '10%',
    zIndex: 0,
  },
  backgroundGlow2: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(0,0,0,0) 70%)',
    bottom: '10%',
    right: '10%',
    zIndex: 0,
  },
  loginCard: {
    width: '100%',
    maxWidth: '420px',
    padding: '36px 24px',
    borderRadius: '24px',
    textAlign: 'center',
    zIndex: 1,
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
  },
  logoContainer: {
    marginBottom: '32px',
  },
  logoIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '20px',
    background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px auto',
    boxShadow: '0 8px 16px rgba(99, 102, 241, 0.3)',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#F3F4F6',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6366F1',
    fontWeight: '600',
    marginTop: '2px',
    letterSpacing: '0.1em',
  },
  features: {
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    marginBottom: '36px',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  featureIcon: {
    marginTop: '2px',
    flexShrink: 0,
  },
  featureTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#F3F4F6',
    marginBottom: '2px',
  },
  featureDesc: {
    fontSize: '13px',
    color: '#9CA3AF',
    lineHeight: '1.4',
  },
  errorText: {
    color: '#EF4444',
    fontSize: '13px',
    marginBottom: '16px',
    lineHeight: '1.4',
  },
  googleBtn: {
    width: '100%',
    fontSize: '16px',
    fontWeight: '600',
    borderRadius: '14px',
    padding: '16px',
    marginBottom: '24px',
  },
  dividerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dividerText: {
    fontSize: '12px',
    color: '#6B7280',
    fontWeight: '500',
  },
  demoNotice: {
    fontSize: '12px',
    color: '#9CA3AF',
    lineHeight: '1.5',
    marginBottom: '16px',
    textAlign: 'left',
  },
  demoBtnGroup: {
    display: 'flex',
    gap: '10px',
  },
  demoBtn: {
    flex: 1,
    fontSize: '13px',
    padding: '12px',
    minHeight: '40px',
    borderRadius: '10px',
    fontWeight: '500',
  },
};
