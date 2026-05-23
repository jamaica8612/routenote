import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Landmark, Trash2, Edit3, Route, Plus, MapPin, ChevronRight, FileText } from 'lucide-react';

export default function ZoneDetail({ zone, currentUser, tips, onEdit, onDelete, onStartDrawPath, onSelectPath, activePathId }) {
  const [paths, setPaths] = useState([]);
  const [loadingPaths, setLoadingPaths] = useState(false);

  useEffect(() => {
    if (!zone) return;
    fetchPaths();
  }, [zone]);

  const fetchPaths = async () => {
    setLoadingPaths(true);
    try {
      const { data, error } = await supabase
        .from('rn_route_paths') // [Prefix Update] route_paths -> rn_route_paths
        .select('*')
        .eq('zone_id', zone.id)
        .eq('is_deleted', false);
      if (error) throw error;
      setPaths(data || []);
    } catch (err) {
      console.error('Error fetching paths:', err);
    } finally {
      setLoadingPaths(false);
    }
  };

  const handleDeletePath = async (e, pathId) => {
    e.stopPropagation();
    if (!confirm('이 동선을 정말 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('rn_route_paths') // [Prefix Update] route_paths -> rn_route_paths
        .update({ is_deleted: true })
        .eq('id', pathId);

      if (error) throw error;
      setPaths(paths.filter(p => p.id !== pathId));
      if (activePathId === pathId) {
        onSelectPath(null); // Clear selected map path
      }
    } catch (err) {
      alert('동선 삭제 실패: ' + err.message);
    }
  };

  // Find tips that belong to this zone
  const zoneTips = tips.filter(t => !t.is_deleted && t.zone_id === zone.id);

  return (
    <div style={styles.container}>
      {/* Zone Header */}
      <div style={styles.header}>
        <div style={{ ...styles.colorIndicator, backgroundColor: zone.color || '#6366F1' }} />
        <div>
          <h2 style={styles.title}>{zone.name}</h2>
          <span style={styles.subtitle}>이 구역 팁 {zoneTips.length}개</span>
        </div>
      </div>

      {/* Zone Memo */}
      {zone.memo && (
        <div style={styles.memoBox}>
          <FileText size={16} color="var(--text-secondary)" style={{ marginTop: '2px', flexShrink: 0 }} />
          <p style={styles.memoText}>{zone.memo}</p>
        </div>
      )}

      {/* Action Buttons for Zone */}
      {currentUser && currentUser.role === 'admin' && (
        <div style={styles.zoneActions}>
          <button className="btn btn-secondary" style={styles.actionBtn} onClick={() => onEdit(zone)}>
            <Edit3 size={16} /> 수정
          </button>
          <button
            className="btn btn-secondary"
            style={{ ...styles.actionBtn, color: 'var(--danger)' }}
            onClick={() => {
              if (confirm('이 구역을 정말 삭제하시겠습니까? (속한 팁은 유지되지만 소속 구역 설정이 풀립니다)')) {
                onDelete(zone.id);
              }
            }}
          >
            <Trash2 size={16} /> 삭제
          </button>
        </div>
      )}

      {/* Route Paths Section */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>배송 동선 ({paths.length})</h3>
          {currentUser && currentUser.role === 'admin' && (
            <button
              className="btn btn-primary"
              style={styles.addPathBtn}
              onClick={() => onStartDrawPath(zone.id)}
            >
              <Plus size={14} /> 동선 추가
            </button>
          )}
        </div>

        {loadingPaths && <p style={styles.loadingText}>동선을 로딩하는 중...</p>}

        {!loadingPaths && paths.length === 0 && (
          <div style={styles.emptyBox}>
            <p>등록된 동선이 없습니다.</p>
            {currentUser?.role === 'admin' && <p style={{ fontSize: '11px', marginTop: '4px' }}>[동선 추가]를 눌러 꼭짓점들을 순서대로 찍어주세요.</p>}
          </div>
        )}

        <div style={styles.pathList}>
          {paths.map(path => {
            const isActive = activePathId === path.id;
            return (
              <button
                key={path.id}
                style={{
                  ...styles.pathItem,
                  backgroundColor: isActive ? 'var(--bg-active)' : 'var(--bg-input)',
                  borderColor: isActive ? 'var(--primary)' : 'var(--bg-card-border)',
                }}
                onClick={() => onSelectPath(isActive ? null : path.id)}
              >
                <div style={styles.pathLeft}>
                  <Route size={18} color={isActive ? 'var(--primary)' : 'var(--text-secondary)'} />
                  <div>
                    <div style={{ ...styles.pathName, fontWeight: isActive ? '700' : '500' }}>{path.name}</div>
                    {path.memo && <div style={styles.pathMemo}>{path.memo}</div>}
                  </div>
                </div>

                <div style={styles.pathRight}>
                  {currentUser?.role === 'admin' && (
                    <button
                      style={styles.pathDeleteBtn}
                      onClick={(e) => handleDeletePath(e, path.id)}
                    >
                      <Trash2 size={14} color="var(--text-muted)" />
                    </button>
                  )}
                  <ChevronRight size={16} color="var(--text-muted)" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tip List in Zone */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>이 구역 팁 목록</h3>
        {zoneTips.length === 0 ? (
          <div style={styles.emptyBox}>이 구역에 등록된 팁 마커가 없습니다.</div>
        ) : (
          <div style={styles.tipList}>
            {zoneTips.map(t => (
              <button
                key={t.id}
                style={styles.tipItem}
                onClick={() => onSelectPath(t)} // Special routing: click to center tip marker
              >
                <div style={styles.tipLeft}>
                  <span style={styles.tipEmoji}>
                    {t.marker_type === 'vehicle_entrance' ? '🚗' :
                     t.marker_type === 'parking' ? '🅿️' :
                     t.marker_type === 'entrance' ? '🚪' :
                     t.marker_type === 'elevator' ? '🛗' :
                     t.marker_type === 'delivery_spot' ? '📦' :
                     t.marker_type === 'warning' ? '⚠️' :
                     t.marker_type === 'access_code' ? '🔑' : '⭐'}
                  </span>
                  <div style={styles.tipName}>{t.title}</div>
                </div>
                <ChevronRight size={16} color="var(--text-muted)" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  colorIndicator: {
    width: '16px',
    height: '36px',
    borderRadius: '4px',
    flexShrink: 0,
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  memoBox: {
    display: 'flex',
    gap: '8px',
    padding: '12px 14px',
    backgroundColor: 'var(--bg-input)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--bg-card-border)',
    marginBottom: '16px',
  },
  memoText: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
  zoneActions: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
  },
  actionBtn: {
    flex: 1,
    padding: '10px 16px',
    minHeight: '40px',
    fontSize: '13px',
    borderRadius: '10px',
  },
  section: {
    marginBottom: '24px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  addPathBtn: {
    padding: '6px 12px',
    minHeight: '32px',
    fontSize: '12px',
    borderRadius: '8px',
  },
  loadingText: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    padding: '12px 0',
  },
  emptyBox: {
    padding: '20px',
    backgroundColor: 'var(--bg-input)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--bg-card-border)',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    textAlign: 'center',
  },
  pathList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  pathItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--bg-card-border)',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    transition: 'all var(--transition-fast)',
  },
  pathLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pathName: {
    fontSize: '14px',
    color: 'var(--text-primary)',
  },
  pathMemo: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  },
  pathRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  pathDeleteBtn: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  tipItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    backgroundColor: 'var(--bg-input)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--bg-card-border)',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  },
  tipLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  tipEmoji: {
    fontSize: '16px',
  },
  tipName: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    fontWeight: '500',
  },
};
