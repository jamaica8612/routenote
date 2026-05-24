import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { isPointInPolygon } from '../utils/geoUtils';
import { Camera, Trash, AlertTriangle, Info } from 'lucide-react';
import { getDbUserId } from '../utils/userUtils';

const MARKER_TYPES = [
  { id: 'vehicle_entrance', emoji: '🚗', label: '차량 진입구' },
  { id: 'parking', emoji: '🅿️', label: '정차/주차' },
  { id: 'entrance', emoji: '🚪', label: '출입구/공동현관' },
  { id: 'elevator', emoji: '🛗', label: '엘리베이터' },
  { id: 'delivery_spot', emoji: '📦', label: '배송 위치' },
  { id: 'warning', emoji: '⚠️', label: '주의' },
  { id: 'access_code', emoji: '🔑', label: '비번/호출' },
  { id: 'important', emoji: '⭐', label: '중요' },
];

export default function TipForm({ tip, lat, lng, zones, currentUser, onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [markerType, setMarkerType] = useState('delivery_spot');
  const [memo, setMemo] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [photos, setPhotos] = useState([]); // Array of existing photos or new uploads
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Set default form values (existing tip or new tip coords)
  useEffect(() => {
    if (tip) {
      setTitle(tip.title || '');
      setMarkerType(tip.marker_type || 'delivery_spot');
      setMemo(tip.memo || '');
      setTagInput(tip.tags ? tip.tags.join(', ') : '');
      setZoneId(tip.zone_id || '');
      fetchExistingPhotos(tip.id);
    } else {
      // New Tip: Detect zone automatically based on coordinates
      const matchedZone = zones.find(z => !z.is_deleted && isPointInPolygon(lat, lng, z.polygon));
      setZoneId(matchedZone ? matchedZone.id : '');
      setTitle('');
      setMarkerType('delivery_spot');
      setMemo('');
      setTagInput('');
      setPhotos([]);
    }
  }, [tip, lat, lng, zones]);

  const fetchExistingPhotos = async (tipId) => {
    try {
      const { data, error } = await supabase
        .from('rn_route_tip_photos') // [Prefix Update] route_tip_photos -> rn_route_tip_photos
        .select('*')
        .eq('tip_id', tipId)
        .eq('is_deleted', false);
      if (error) throw error;
      setPhotos(data || []);
    } catch (err) {
      console.error('Error fetching photos:', err);
    }
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    if (photos.length + files.length > 3) {
      alert('사진은 최대 3장까지만 업로드 가능합니다.');
      return;
    }

    setUploading(true);
    setError(null);

    const uploadedList = [...photos];
    const dbUserId = getDbUserId(currentUser);

    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id || 'anonymous'}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        // 1. Upload to Supabase Storage Bucket
        const { data: storageData, error: uploadError } = await supabase.storage
          .from('tip-photos')
          .upload(fileName, file, { cacheControl: '3600', upsert: true });

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage
          .from('tip-photos')
          .getPublicUrl(fileName);

        // 3. Keep in temporary state (will insert to DB upon form save, or if existing tip, upload instantly)
        const newPhotoObj = {
          storage_path: publicUrl,
          uploaded_by: dbUserId,
          is_new: true,
          file: file,
          dbPath: fileName
        };

        if (tip) {
          // If editing existing tip, save photo immediately to DB
          const { data: dbData, error: dbError } = await supabase
            .from('rn_route_tip_photos') // [Prefix Update] route_tip_photos -> rn_route_tip_photos
            .insert({
              tip_id: tip.id,
              storage_path: publicUrl,
              uploaded_by: dbUserId,
            })
            .select()
            .single();

          if (dbError) throw dbError;
          uploadedList.push(dbData);
        } else {
          uploadedList.push(newPhotoObj);
        }
      }
      setPhotos(uploadedList);
    } catch (err) {
      console.error('Upload error:', err);
      setError('사진 업로드 실패: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoDelete = async (photoIndex) => {
    const photoToDelete = photos[photoIndex];
    if (!photoToDelete) return;

    setError(null);

    try {
      if (photoToDelete.is_new) {
        // If it's a new unsaved photo, just filter out
        setPhotos(photos.filter((_, idx) => idx !== photoIndex));
      } else {
        // Validate: only uploader or admin can delete
        const isOwner = photoToDelete.uploaded_by === currentUser.id;
        const isAdmin = currentUser.role === 'admin';

        if (!isOwner && !isAdmin) {
          alert('본인이 업로드한 사진 또는 관리자만 삭제할 수 있습니다.');
          return;
        }

        // Soft delete in DB
        const { error } = await supabase
          .from('rn_route_tip_photos') // [Prefix Update] route_tip_photos -> rn_route_tip_photos
          .update({ is_deleted: true })
          .eq('id', photoToDelete.id);

        if (error) throw error;
        setPhotos(photos.filter((_, idx) => idx !== photoIndex));
      }
    } catch (err) {
      console.error('Photo delete error:', err);
      setError('사진 삭제 실패: ' + err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    setSaving(true);
    setError(null);

    const parsedTags = tagInput
      ? tagInput.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : [];

    try {
      let savedTipId = tip ? tip.id : null;
      const dbUserId = getDbUserId(currentUser);

      if (tip) {
        // UPDATE Existing Tip
        const { data, error } = await supabase
          .from('rn_route_tips') // [Prefix Update] route_tips -> rn_route_tips
          .update({
            title: title.trim(),
            marker_type: markerType,
            memo: memo.trim(),
            tags: parsedTags,
            zone_id: zoneId || null,
            updated_by: dbUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tip.id)
          .select()
          .single();

        if (error) throw error;
      } else {
        // INSERT New Tip
        const { data, error } = await supabase
          .from('rn_route_tips') // [Prefix Update] route_tips -> rn_route_tips
          .insert({
            title: title.trim(),
            marker_type: markerType,
            memo: memo.trim(),
            lat,
            lng,
            tags: parsedTags,
            zone_id: zoneId || null,
            created_by: dbUserId,
            updated_by: dbUserId,
            last_verified_at: new Date().toISOString(),
            last_verified_by: dbUserId,
          })
          .select()
          .single();

        if (error) throw error;
        savedTipId = data.id;

        // Save new photos for new tip
        const newPhotos = photos.filter(p => p.is_new);
        if (newPhotos.length > 0) {
          const insertPayload = newPhotos.map(p => ({
            tip_id: savedTipId,
            storage_path: p.storage_path,
            uploaded_by: dbUserId,
          }));

          const { error: photoDbError } = await supabase
            .from('rn_route_tip_photos') // [Prefix Update] route_tip_photos -> rn_route_tip_photos
            .insert(insertPayload);
          
          if (photoDbError) throw photoDbError;
        }
      }

      onSave();
    } catch (err) {
      console.error('Saving tip failed:', err);
      setError('배송 팁 저장 오류: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {error && <div style={styles.errorBanner}>{error}</div>}

      <div className="input-group">
        <label className="input-label">마커 종류 *</label>
        <div style={styles.markerGrid}>
          {MARKER_TYPES.map(type => (
            <button
              key={type.id}
              type="button"
              onClick={() => setMarkerType(type.id)}
              style={{
                ...styles.markerBtn,
                backgroundColor: markerType === type.id ? 'var(--bg-active)' : 'var(--bg-input)',
                borderColor: markerType === type.id ? 'var(--primary)' : 'var(--bg-card-border)',
              }}
            >
              <span style={styles.markerEmoji}>{type.emoji}</span>
              <span style={styles.markerLabel}>{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="tip-title">제목 *</label>
        <input
          id="tip-title"
          type="text"
          className="input-field"
          placeholder="예) 후문 정차위치, 공동현관 호출법"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="tip-zone">소속 구역 (자동 감지)</label>
        <select
          id="tip-zone"
          className="input-field"
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
          style={{ appearance: 'none', backgroundImage: 'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\' fill=\'none\'%3E%3Cpath stroke=\'%236B7280\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3E%3C/svg%3E")', backgroundPosition: 'right 16px center', backgroundSize: '20px', backgroundRepeat: 'no-repeat' }}
        >
          <option value="">소속 구역 없음</option>
          {zones.filter(z => !z.is_deleted).map(z => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="tip-memo">메모</label>
        <textarea
          id="tip-memo"
          className="input-field"
          rows={3}
          placeholder="경비실 호출 비번, 도로 연석 높음 등 디테일한 팁 기재"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          style={{ resize: 'none' }}
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="tip-tags">태그 (쉼표로 구분)</label>
        <input
          id="tip-tags"
          type="text"
          className="input-field"
          placeholder="예) 엘베, 주차, 비번, 후문"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
        />
      </div>

      {/* Photo Uploader */}
      <div className="input-group">
        <div style={styles.photoHeader}>
          <label className="input-label">사진 첨부 (최대 3장)</label>
          <span style={styles.photoCount}>{photos.length} / 3</span>
        </div>

        <div style={styles.photoWarning}>
          <AlertTriangle size={14} color="var(--warning)" style={{ flexShrink: 0 }} />
          <span>사람 얼굴, 차량 번호판, 개인정보가 보이지 않도록 주의하세요.</span>
        </div>

        <div style={styles.photoGrid}>
          {photos.map((photo, index) => (
            <div key={index} style={styles.photoPreviewWrapper}>
              <img
                src={photo.storage_path}
                alt={`Tip photo ${index + 1}`}
                style={styles.photoPreview}
              />
              <button
                type="button"
                style={styles.photoDeleteBtn}
                onClick={() => handlePhotoDelete(index)}
              >
                <Trash size={14} color="#FFFFFF" />
              </button>
            </div>
          ))}

          {photos.length < 3 && (
            <label style={styles.photoUploadBtn}>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              <Camera size={24} color="var(--text-secondary)" />
              <span style={styles.uploadText}>{uploading ? '업로드중' : '사진 추가'}</span>
            </label>
          )}
        </div>
      </div>

      <div style={styles.actions}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={onCancel}
          disabled={saving || uploading}
        >
          취소
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ flex: 2 }}
          disabled={saving || uploading}
        >
          {saving ? '저장 중...' : '저장 완료'}
        </button>
      </div>
    </form>
  );
}

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: 'var(--danger)',
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    marginBottom: '16px',
    fontSize: '14px',
    lineHeight: '1.4',
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  markerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    width: '100%',
  },
  markerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    border: '1.5px solid var(--bg-card-border)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all var(--transition-fast)',
  },
  markerEmoji: {
    fontSize: '20px',
  },
  markerLabel: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    fontWeight: '500',
  },
  photoHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  photoCount: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  photoWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '11px',
    color: 'var(--warning)',
    lineHeight: '1.4',
    marginBottom: '12px',
    border: '1px solid rgba(245, 158, 11, 0.15)',
  },
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    width: '100%',
    marginBottom: '16px',
  },
  photoPreviewWrapper: {
    position: 'relative',
    aspectRatio: '1',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    border: '1px solid var(--bg-card-border)',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  photoUploadBtn: {
    aspectRatio: '1',
    borderRadius: 'var(--radius-md)',
    border: '1.5px dashed var(--bg-card-border)',
    backgroundColor: 'var(--bg-input)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    gap: '4px',
  },
  uploadText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
};
