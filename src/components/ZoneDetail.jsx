import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Landmark, Trash2, Edit3, Route, Plus, MapPin, ChevronRight, FileText, Camera, Image, Trash } from 'lucide-react';

export default function ZoneDetail({ zone, currentUser, tips, clickLat, clickLng, onAddTipAtClick, onEdit, onDelete, onStartDrawPath, onSelectPath, activePathId, onUpdate }) {
  const [paths, setPaths] = useState([]);
  const [loadingPaths, setLoadingPaths] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState(zone.image_url || '');
  const [memoText, setMemoText] = useState(zone.memo || '');
  const [savingMemo, setSavingMemo] = useState(false);
  const [isMemoExpanded, setIsMemoExpanded] = useState(false);
  const [textareaExpanded, setTextareaExpanded] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setCurrentImageUrl(zone.image_url || '');
    setMemoText(zone.memo || '');
  }, [zone]);

  const handleSaveMemo = async () => {
    setSavingMemo(true);
    try {
      const { error: dbError } = await supabase
        .from('rn_route_zones')
        .update({
          memo: memoText.trim(),
          updated_by: currentUser.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', zone.id);

      if (dbError) throw dbError;

      zone.memo = memoText.trim();
      alert('구역 배송팁 메모가 저장되었습니다.');
      setTextareaExpanded(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Error saving zone memo:', err);
      alert('메모 저장 실패: ' + err.message);
    } finally {
      setSavingMemo(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `zones/${zone.id}_${Date.now()}.${fileExt}`;

      // 1. Upload file to Supabase Storage bucket 'tip-photos'
      const { data: storageData, error: uploadError } = await supabase.storage
        .from('tip-photos')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('tip-photos')
        .getPublicUrl(fileName);

      // 3. Update rn_route_zones table with the new image_url
      const { error: dbError } = await supabase
        .from('rn_route_zones')
        .update({
          image_url: publicUrl,
          updated_by: currentUser.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', zone.id);

      if (dbError) throw dbError;

      setCurrentImageUrl(publicUrl);
      zone.image_url = publicUrl; // Update local reference
      alert('구역 이미지 팁이 등록되었습니다.');
    } catch (err) {
      console.error('Error uploading zone image:', err);
      alert('이미지 업로드 실패: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleImageDelete = async () => {
    if (!confirm('등록된 구역 이미지 팁을 삭제하시겠습니까?')) return;

    setUploading(true);
    try {
      // Update rn_route_zones table set image_url to null
      const { error: dbError } = await supabase
        .from('rn_route_zones')
        .update({
          image_url: null,
          updated_by: currentUser.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', zone.id);

      if (dbError) throw dbError;

      setCurrentImageUrl('');
      zone.image_url = null; // Update local reference
      alert('구역 이미지 팁이 삭제되었습니다.');
    } catch (err) {
      console.error('Error deleting zone image:', err);
      alert('이미지 삭제 실패: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

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

      {/* Shortcut to register a tip at exact clicked location inside the zone */}
      {clickLat && clickLng && (
        <button
          type="button"
          className="btn"
          style={styles.addTipAtClickBtn}
          onClick={() => onAddTipAtClick(clickLat, clickLng)}
        >
          <Plus size={18} /> 이 위치에 배송팁 등록
        </button>
      )}

      {/* Zone Image Tip Section */}
      <div style={{ marginBottom: '16px' }}>
        {currentImageUrl ? (
          <div>
            <div style={styles.zoneImageWrapper} onClick={() => setIsImageExpanded(true)}>
              <img src={currentImageUrl} alt={`${zone.name} 구역 전체 팁`} style={styles.zoneImage} />
            </div>
            {currentUser && currentUser.role !== 'viewer' && (
              <div style={styles.imageActions}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ ...styles.actionBtn, padding: '8px 12px', minHeight: '36px', fontSize: '13px' }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera size={14} /> 이미지 변경
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ ...styles.actionBtn, padding: '8px 12px', minHeight: '36px', fontSize: '13px', backgroundColor: 'var(--danger)', color: '#FFFFFF' }}
                  onClick={handleImageDelete}
                  disabled={uploading}
                >
                  <Trash size={14} /> 이미지 삭제
                </button>
              </div>
            )}
          </div>
        ) : (
          currentUser && currentUser.role !== 'viewer' && (
            <div style={styles.imagePlaceholderBtn} onClick={() => fileInputRef.current?.click()}>
              <Camera size={24} color="var(--text-secondary)" />
              <span style={styles.imagePlaceholderText}>
                {uploading ? '업로드 중...' : '➕ 이 구역 전체의 이미지 팁 등록 (배치도 등)'}
              </span>
            </div>
          )
        )}
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
      </div>

      {/* Image Zoom Lightbox Modal */}
      {isImageExpanded && (
        <div style={styles.imageModalOverlay} onClick={() => setIsImageExpanded(false)}>
          <img src={currentImageUrl} alt={`${zone.name} 구역 전체 팁`} style={styles.imageModalContent} />
          <button style={styles.imageModalCloseBtn} onClick={() => setIsImageExpanded(false)}>✕</button>
        </div>
      )}

      {/* Zone Memo (For Guest Viewer - Read Only) */}
      {currentUser?.role === 'viewer' && zone.memo && (
        <div style={{ ...styles.memoBox, cursor: 'pointer' }} onClick={() => setIsMemoExpanded(!isMemoExpanded)} title="클릭 시 전체 보기/접기">
          <FileText size={16} color="var(--text-secondary)" style={{ marginTop: '2px', flexShrink: 0 }} />
          <p style={{
            ...styles.memoText,
            display: isMemoExpanded ? 'block' : '-webkit-box',
            WebkitLineClamp: isMemoExpanded ? 'none' : 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {zone.memo}
          </p>
        </div>
      )}

      {/* Zone Memo (For Driver/Admin - Editable) */}
      {currentUser && currentUser.role !== 'viewer' && (
        <div style={styles.memoSection}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>구역 전체 배송팁 메모</h3>
            {textareaExpanded && (
              <button
                type="button"
                style={styles.collapseLink}
                onClick={() => setTextareaExpanded(false)}
              >
                메모창 접기
              </button>
            )}
          </div>
          <textarea
            className="input-field"
            style={{
              ...styles.memoTextarea,
              minHeight: textareaExpanded ? '200px' : '80px',
            }}
            placeholder="구역 전체의 특이사항(예: 공동현관 비밀번호, 주차 팁 등)을 입력해 주세요."
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            onFocus={() => setTextareaExpanded(true)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={styles.saveMemoBtn}
            onClick={handleSaveMemo}
            disabled={savingMemo || memoText.trim() === (zone.memo || '')}
          >
            {savingMemo ? '저장 중...' : '메모 저장'}
          </button>
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
  addTipAtClickBtn: {
    width: '100%',
    marginBottom: '16px',
    backgroundColor: 'var(--success)',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: '600',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
    cursor: 'pointer',
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
  zoneImageWrapper: {
    width: '100%',
    maxHeight: '220px',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    border: '1px solid var(--bg-card-border)',
    marginBottom: '10px',
    cursor: 'pointer',
    position: 'relative',
    backgroundColor: '#121824',
  },
  zoneImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    maxHeight: '220px',
    margin: '0 auto',
  },
  imageActions: {
    display: 'flex',
    gap: '8px',
    marginBottom: '10px',
  },
  imagePlaceholderBtn: {
    width: '100%',
    padding: '20px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px dashed var(--bg-card-border)',
    backgroundColor: 'var(--bg-input)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    marginBottom: '16px',
    transition: 'all var(--transition-fast)',
  },
  imagePlaceholderText: {
    fontSize: '13px',
    fontWeight: '600',
    textAlign: 'center',
  },
  imageModalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  imageModalContent: {
    maxWidth: '100%',
    maxHeight: '90vh',
    objectFit: 'contain',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
  },
  imageModalCloseBtn: {
    position: 'absolute',
    top: '24px',
    right: '24px',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: 'none',
    color: '#FFFFFF',
    fontSize: '20px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  memoSection: {
    marginBottom: '20px',
  },
  memoTextarea: {
    width: '100%',
    minHeight: '80px',
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--bg-card-border)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    lineHeight: '1.5',
    resize: 'vertical',
    fontFamily: 'inherit',
    marginBottom: '8px',
  },
  saveMemoBtn: {
    width: '100%',
    padding: '10px 16px',
    minHeight: '38px',
    fontSize: '13px',
    borderRadius: '10px',
  },
  collapseLink: {
    background: 'none',
    border: 'none',
    color: 'var(--primary)',
    fontSize: '12px',
    cursor: 'pointer',
    padding: 0,
    fontWeight: '600',
  },
};
