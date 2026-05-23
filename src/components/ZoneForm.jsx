import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { getDbUserId } from '../utils/userUtils';

const ZONE_COLORS = [
  { value: '#6366F1', label: '인디고' },
  { value: '#10B981', label: '에메랄드' },
  { value: '#F59E0B', label: '앰버' },
  { value: '#EF4444', label: '레드' },
  { value: '#3B82F6', label: '블루' },
  { value: '#EC4899', label: '핑크' },
  { value: '#8B5CF6', label: '바이올렛' },
  { value: '#14B8A6', label: '민트' },
];

export default function ZoneForm({ zone, polygonCoords, currentUser, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366F1');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (zone) {
      setName(zone.name || '');
      setColor(zone.color || '#6366F1');
      setMemo(zone.memo || '');
    } else {
      setName('');
      setColor('#6366F1');
      setMemo('');
    }
  }, [zone]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('구역명을 입력해주세요.');
      return;
    }

    const validLoops = polygonCoords ? polygonCoords.filter(loop => loop.length >= 3) : [];

    if (!zone && validLoops.length === 0) {
      alert('지도상에 최소 1개 이상의 올바른 영역(꼭짓점 3개 이상)을 그려주세요.');
      return;
    }

    setSaving(true);
    setError(null);
    const dbUserId = getDbUserId(currentUser);

    try {
      if (zone) {
        // UPDATE Existing Zone
        const { error } = await supabase
          .from('rn_route_zones')
          .update({
            name: name.trim(),
            color,
            memo: memo.trim(),
            updated_by: dbUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', zone.id);

        if (error) throw error;
      } else {
        // INSERT New Zone as MultiPolygon GeoJSON
        // Coordinates structure: [ [ [ [lng, lat], ... (closed) ] ], [ [ [lng, lat], ... (closed) ] ] ]
        const multiPolygonCoords = validLoops.map(loop => {
          const ring = loop.map(pt => [pt.lng, pt.lat]);
          // Close the polygon ring loop by repeating the first coordinate
          ring.push([loop[0].lng, loop[0].lat]);
          return [ring];
        });

        const geoJSONPolygon = {
          type: 'MultiPolygon',
          coordinates: multiPolygonCoords
        };

        const { error } = await supabase
          .from('rn_route_zones')
          .insert({
            name: name.trim(),
            color,
            memo: memo.trim(),
            polygon: geoJSONPolygon,
            created_by: dbUserId,
            updated_by: dbUserId,
          });

        if (error) throw error;
      }
      onSave();
    } catch (err) {
      console.error('Error saving zone:', err);
      setError('구역 저장 오류: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalPoints = polygonCoords 
    ? polygonCoords.reduce((sum, loop) => sum + loop.length, 0) 
    : 0;
  const loopCount = polygonCoords ? polygonCoords.filter(l => l.length > 0).length : 0;

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {error && <div style={styles.errorBanner}>{error}</div>}

      <div className="input-group">
        <label className="input-label" htmlFor="zone-name">구역명 *</label>
        <input
          id="zone-name"
          type="text"
          className="input-field"
          placeholder="예) 319, 장전래미안, 313BC"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="input-group">
        <label className="input-label">구역 색상</label>
        <div style={styles.colorGrid}>
          {ZONE_COLORS.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              style={{
                ...styles.colorBtn,
                backgroundColor: c.value,
                transform: color === c.value ? 'scale(1.15)' : 'scale(1)',
                boxShadow: color === c.value ? `0 0 10px ${c.value}` : 'none',
                border: color === c.value ? '2px solid #FFFFFF' : '1px solid rgba(255,255,255,0.1)',
              }}
              title={c.label}
            />
          ))}
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="zone-memo">구역 메모</label>
        <textarea
          id="zone-memo"
          className="input-field"
          rows={3}
          placeholder="구역의 전반적인 특징이나 주 진입 시간대 등 기재"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          style={{ resize: 'none' }}
        />
      </div>

      {!zone && (
        <div style={styles.infoBox}>
          <span>분리된 영역 수: <strong>{loopCount}개</strong> (총 꼭짓점 수: {totalPoints}개)</span>
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
          {saving ? '저장 중...' : '구역 저장'}
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
  colorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: '8px',
    width: '100%',
    padding: '4px 0',
  },
  colorBtn: {
    aspectRatio: '1',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    outline: 'none',
  },
  infoBox: {
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
