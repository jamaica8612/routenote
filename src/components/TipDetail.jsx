import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Check, Calendar, User, Clock, Trash2, Edit3, ArrowRight, ShieldAlert, Image } from 'lucide-react';
import { getDbUserId } from '../utils/userUtils';

const MARKER_TYPES = {
  vehicle_entrance: { emoji: '🚗', label: '차량 진입구' },
  parking: { emoji: '🅿️', label: '정차/주차' },
  entrance: { emoji: '🚪', label: '출입구/공동현관' },
  elevator: { emoji: '🛗', label: '엘리베이터' },
  delivery_spot: { emoji: '📦', label: '배송 위치' },
  warning: { emoji: '⚠️', label: '주의' },
  access_code: { emoji: '🔑', label: '비번/호출' },
  important: { emoji: '⭐', label: '중요' },
};

export default function TipDetail({ tip, currentUser, onEdit, onDelete, onVerified }) {
  const [photos, setPhotos] = useState([]);
  const [creatorName, setCreatorName] = useState('알 수 없음');
  const [updaterName, setUpdaterName] = useState('알 수 없음');
  const [verifierName, setVerifierName] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!tip) return;

    fetchPhotos();
    fetchUserNames();
    setShowHistory(false);
  }, [tip]);

  const fetchPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from('rn_route_tip_photos') // [Prefix Update] route_tip_photos -> rn_route_tip_photos
        .select('*')
        .eq('tip_id', tip.id)
        .eq('is_deleted', false);
      if (error) throw error;
      setPhotos(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUserNames = async () => {
    try {
      const userIds = [tip.created_by, tip.updated_by, tip.last_verified_by].filter(Boolean);
      if (userIds.length === 0) return;

      const { data, error } = await supabase
        .from('rn_profiles') // [Prefix Update] profiles -> rn_profiles
        .select('id, name')
        .in('id', userIds);

      if (error) throw error;

      const nameMap = {};
      data.forEach(p => {
        nameMap[p.id] = p.name;
      });

      if (tip.created_by) setCreatorName(nameMap[tip.created_by] || '탈퇴 사용자');
      if (tip.updated_by) setUpdaterName(nameMap[tip.updated_by] || '탈퇴 사용자');
      if (tip.last_verified_by) setVerifierName(nameMap[tip.last_verified_by] || '탈퇴 사용자');
    } catch (err) {
      console.error(err);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const now = new Date().toISOString();
      const dbUserId = getDbUserId(currentUser);
      const { error } = await supabase
        .from('rn_route_tips') // [Prefix Update] route_tips -> rn_route_tips
        .update({
          last_verified_at: now,
          last_verified_by: dbUserId,
          updated_by: dbUserId,
        })
        .eq('id', tip.id);

      if (error) throw error;
      setVerifierName(currentUser.name);
      onVerified(now, dbUserId);
    } catch (err) {
      alert('확인 상태 갱신 실패: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleFetchHistory = async () => {
    setShowHistory(true);
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('rn_route_tip_history') // [Prefix Update] route_tip_history -> rn_route_tip_history
        .select(`
          id, action, old_data, new_data, changed_at,
          rn_profiles ( name )
        `) // Profiles join prefix
        .eq('tip_id', tip.id)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      // profiles 조인 이름도 rn_profiles로 바뀝니다.
      // DTO 데이터 파싱 시 DTO 구조를 맞추어 줍니다.
      const parsedHistory = (data || []).map(hist => ({
        ...hist,
        profiles: hist.rn_profiles // Map join name back for UI simplicity
      }));
      setHistory(parsedHistory);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatDiff = (hist) => {
    const oldD = hist.old_data || {};
    const newD = hist.new_data || {};
    const diffs = [];

    const keysToCompare = [
      { key: 'title', label: '제목' },
      { key: 'marker_type', label: '종류' },
      { key: 'memo', label: '메모' },
      { key: 'tags', label: '태그' },
    ];

    keysToCompare.forEach(({ key, label }) => {
      const oldVal = oldD[key];
      const newVal = newD[key];

      // Array comparison for tags
      if (key === 'tags') {
        const oldStr = Array.isArray(oldVal) ? oldVal.join(', ') : '';
        const newStr = Array.isArray(newVal) ? newVal.join(', ') : '';
        if (oldStr !== newStr) {
          diffs.push({ label, old: oldStr || '(없음)', new: newStr || '(없음)' });
        }
      } else if (oldVal !== newVal) {
        let oldDisplay = oldVal;
        let newDisplay = newVal;
        if (key === 'marker_type') {
          oldDisplay = MARKER_TYPES[oldVal]?.label || oldVal;
          newDisplay = MARKER_TYPES[newVal]?.label || newVal;
        }
        diffs.push({
          label,
          old: oldDisplay === undefined || oldDisplay === null || oldDisplay === '' ? '(없음)' : String(oldDisplay),
          new: newDisplay === undefined || newDisplay === null || newDisplay === '' ? '(없음)' : String(newDisplay),
        });
      }
    });

    if (diffs.length === 0) {
      if (hist.action === 'INSERT') return '새 팁이 생성되었습니다.';
      return '단순 설정이 변경되었습니다.';
    }

    return (
      <div style={styles.diffContainer}>
        {diffs.map((d, idx) => (
          <div key={idx} style={styles.diffRow}>
            <strong>{d.label}</strong>
            <span style={styles.diffOld}>{d.old}</span>
            <ArrowRight size={12} color="var(--text-secondary)" />
            <span style={styles.diffNew}>{d.new}</span>
          </div>
        ))}
      </div>
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '확인 이력 없음';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const typeInfo = MARKER_TYPES[tip.marker_type] || { emoji: '📦', label: '배송팁' };

  // Calculate tip age status
  let ageStatus = '최근 확인됨 (90일 이내)';
  let ageColor = 'var(--success)';
  let isOld = false;

  if (tip.last_verified_at) {
    const lastV = new Date(tip.last_verified_at);
    const now = new Date();
    const days = Math.ceil(Math.abs(now - lastV) / (1000 * 60 * 60 * 24));
    if (days >= 90 && days < 180) {
      ageStatus = '확인한 지 90일 경과 (살짝 흐림)';
      ageColor = 'var(--warning)';
    } else if (days >= 180) {
      ageStatus = '오래된 팁 (180일 경과/회색 표시)';
      ageColor = 'var(--danger)';
      isOld = true;
    }
  } else {
    ageStatus = '미확인된 오래된 팁 (회색 표시)';
    ageColor = 'var(--danger)';
    isOld = true;
  }

  return (
    <div style={styles.container}>
      {/* Visual Marker Title */}
      <div style={styles.titleSection}>
        <div style={styles.badge}>
          <span style={styles.badgeEmoji}>{typeInfo.emoji}</span>
          <span style={styles.badgeLabel}>{typeInfo.label}</span>
        </div>
        <h2 style={styles.mainTitle}>{tip.title}</h2>
      </div>

      {/* Age Badge Warning */}
      <div style={{ ...styles.ageBadge, borderColor: ageColor, color: ageColor }}>
        <ShieldAlert size={14} />
        <span>{ageStatus}</span>
      </div>

      {/* Photos Carousel */}
      {photos.length > 0 && (
        <div style={styles.photoContainer}>
          {photos.map(p => (
            <a key={p.id} href={p.storage_path} target="_blank" rel="noopener noreferrer" style={styles.photoLink}>
              <img src={p.storage_path} alt="Tip" style={styles.img} />
            </a>
          ))}
        </div>
      )}

      {/* Memo Details */}
      {tip.memo && (
        <div style={styles.memoBox}>
          <p style={styles.memoText}>{tip.memo}</p>
        </div>
      )}

      {/* Tags */}
      {tip.tags && tip.tags.length > 0 && (
        <div style={styles.tagGroup}>
          {tip.tags.map((tag, idx) => (
            <span key={idx} style={styles.tag}>#{tag}</span>
          ))}
        </div>
      )}

      {/* Metadata Panel */}
      <div className="glass" style={styles.metaPanel}>
        <div style={styles.metaRow}>
          <User size={14} color="var(--text-secondary)" />
          <span>등록: <strong>{creatorName}</strong> ({formatDate(tip.created_at)})</span>
        </div>
        <div style={styles.metaRow}>
          <Clock size={14} color="var(--text-secondary)" />
          <span>수정: <strong>{updaterName}</strong> ({formatDate(tip.updated_at)})</span>
        </div>
        <div style={styles.metaRow}>
          <Calendar size={14} color="var(--text-secondary)" />
          <span>최종 확인: <strong>{verifierName || '없음'}</strong> ({formatDate(tip.last_verified_at)})</span>
        </div>
      </div>

      {/* Primary Actions (Verification & Editing) */}
      <div style={styles.actions}>
        <button
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={handleVerify}
          disabled={verifying}
        >
          <Check size={18} color="var(--success)" />
          <span>{verifying ? '확인 중...' : '이 팁 아직 맞음'}</span>
        </button>

        <button className="btn btn-secondary" style={{ padding: '14px' }} onClick={handleFetchHistory} title="변경 이력">
          이력 보기
        </button>

        <button className="btn btn-primary" style={{ padding: '14px' }} onClick={() => onEdit(tip)}>
          <Edit3 size={18} />
          <span>수정</span>
        </button>

        {currentUser && currentUser.role === 'admin' && (
          <button
            className="btn btn-danger"
            style={{ padding: '14px' }}
            onClick={() => {
              if (confirm('이 배송팁을 정말 삭제하시겠습니까? (숨김 처리됨)')) {
                onDelete(tip.id);
              }
            }}
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* HISTORY MODAL (SLIDE OVERLAY) */}
      {showHistory && (
        <div style={styles.historyOverlay}>
          <div className="glass" style={styles.historyCard}>
            <div style={styles.historyHeader}>
              <h3 style={styles.historyTitle}>팁 수정 이력</h3>
              <button style={styles.historyClose} onClick={() => setShowHistory(false)}>✕</button>
            </div>

            <div style={styles.historyContent}>
              {loadingHistory && <p style={styles.centerText}>이력을 불러오는 중...</p>}
              
              {!loadingHistory && history.length === 0 && (
                <p style={styles.centerText}>수정 이력이 존재하지 않습니다.</p>
              )}

              {!loadingHistory && history.map((hist, idx) => (
                <div key={hist.id} style={styles.historyItem}>
                  <div style={styles.historyMeta}>
                    <span style={styles.historyUser}>{hist.profiles?.name || '탈퇴 사용자'}</span>
                    <span style={styles.historyTime}>{formatDate(hist.changed_at)}</span>
                    <span style={{
                      ...styles.historyAction,
                      backgroundColor: hist.action === 'INSERT' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color: hist.action === 'INSERT' ? 'var(--success)' : 'var(--primary)',
                    }}>{hist.action}</span>
                  </div>
                  <div style={styles.historyDiff}>
                    {formatDiff(hist)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  titleSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '12px',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    backgroundColor: 'var(--bg-input)',
    borderRadius: '10px',
    border: '1px solid var(--bg-card-border)',
  },
  badgeEmoji: {
    fontSize: '14px',
  },
  badgeLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    fontWeight: '600',
  },
  mainTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    lineHeight: '1.2',
  },
  ageBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1.5px solid',
    fontSize: '12px',
    fontWeight: '600',
    marginBottom: '16px',
    backgroundColor: 'var(--bg-input)',
  },
  photoContainer: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    marginBottom: '16px',
    paddingBottom: '4px',
  },
  photoLink: {
    width: '100px',
    height: '100px',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    flexShrink: 0,
    border: '1px solid var(--bg-card-border)',
  },
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  memoBox: {
    padding: '16px',
    backgroundColor: 'var(--bg-input)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--bg-card-border)',
    marginBottom: '16px',
  },
  memoText: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
  },
  tagGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '20px',
  },
  tag: {
    fontSize: '12px',
    color: 'var(--primary)',
    fontWeight: '500',
  },
  metaPanel: {
    padding: '14px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--bg-card-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '24px',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    width: '100%',
  },
  // History Modal Styles
  historyOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 1100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  historyCard: {
    width: '100%',
    maxWidth: '440px',
    maxHeight: '75vh',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--bg-card-border)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-lg)',
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--bg-card-border)',
  },
  historyTitle: {
    fontSize: '16px',
    fontWeight: '700',
  },
  historyClose: {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '18px',
    cursor: 'pointer',
  },
  historyContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  },
  centerText: {
    textAlign: 'center',
    fontSize: '14px',
    color: 'var(--text-secondary)',
    padding: '24px 0',
  },
  historyItem: {
    paddingBottom: '16px',
    marginBottom: '16px',
    borderBottom: '1px solid var(--bg-card-border)',
  },
  historyMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  historyUser: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  historyTime: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  historyAction: {
    fontSize: '10px',
    fontWeight: 'bold',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  historyDiff: {
    padding: '8px 12px',
    backgroundColor: 'var(--bg-input)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
  },
  diffContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  diffRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  diffOld: {
    color: 'var(--text-muted)',
    textDecoration: 'line-through',
  },
  diffNew: {
    color: 'var(--success)',
    fontWeight: '500',
  },
};
