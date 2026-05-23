import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Navigation } from 'lucide-react';

export default function PathForm({ path, pathPoints, zoneId, currentUser, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (path) {
      setName(path.name || '');
      setMemo(path.memo || '');
    } else {
      setName('');
      setMemo('');
    }
  }, [path]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('동선명을 입력해주세요.');
      return;
    }

    if (!path && (!pathPoints || pathPoints.length < 2)) {
      alert('지도에 최소 2개 이상의 포인트를 찍어 경로를 구성해주세요.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (path) {
        // UPDATE Existing Path
        const { error } = await supabase
          .from('rn_route_paths') // [Prefix Update] route_paths -> rn_route_paths
          .update({
            name: name.trim(),
            memo: memo.trim(),
            updated_by: currentUser.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', path.id);

        if (error) throw error;
      } else {
        // INSERT New Path
        const { data: pathData, error: pathError } = await supabase
          .from('rn_route_paths') // [Prefix Update] route_paths -> rn_route_paths
          .insert({
            name: name.trim(),
            memo: memo.trim(),
            zone_id: zoneId || null,
            created_by: currentUser.id,
            updated_by: currentUser.id,
          })
          .select()
          .single();

        if (pathError) throw pathError;

        // INSERT Path Points
        const pointsPayload = pathPoints.map((pt, idx) => ({
          path_id: pathData.id,
          order_index: idx + 1,
          lat: pt.lat,
          lng: pt.lng,
          title: pt.title || `${idx + 1}번 포인트`,
          memo: pt.memo || '',
        }));

        const { error: pointsError } = await supabase
          .from('rn_route_path_points') // [Prefix Update] route_path_points -> rn_route_path_points
          .insert(pointsPayload);

        if (pointsError) throw pointsError;
      }
      onSave();
    } catch (err) {
      console.error('Error saving path:', err);
      setError('동선 저장 오류: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {error && <div style={styles.errorBanner}>{error}</div>}

      <div className="input-group">
        <label className="input-label" htmlFor="path-name">동선 이름 *</label>
        <input
          id="path-name"
          type="text"
          className="input-field"
          placeholder="예) 후문진입 단지동선, A라인 정차순서"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="path-memo">메모</label>
        <textarea
          id="path-memo"
          className="input-field"
          rows={3}
          placeholder="진입 팁이나 특이사항 등 메모"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          style={{ resize: 'none' }}
        />
      </div>

      {!path && (
        <div style={styles.infoBox}>
          <Navigation size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
          <span>지정된 동선 포인트 수: <strong>{pathPoints?.length || 0}개</strong> (순서대로 화살표 선 연결)</span>
        </div>
      )}

      <div style={styles.actions}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={onCancel}
          disabled={saving}
        >
          취소
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ flex: 2 }}
          disabled={saving}
        >
          {saving ? '저장 중...' : '동선 저장'}
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
  infoBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    backgroundColor: 'var(--bg-input)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '16px',
    borderLeft: '3px solid var(--primary)',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
};
