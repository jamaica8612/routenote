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
  
  // Sorted zones coordinates & sub-label text states
  const [sortedZonesData, setSortedZonesData] = useState([]);

  // Extract loops and match with subLabels, preserving original drawing sequence mapping (matching map index 1, 2...)
  const getSortedLoopsAndLabels = () => {
    let loops = [];
    let initialLabels = [];

    if (zone) {
      // Modifying existing zone
      const geom = zone.polygon;
      if (geom.type === 'MultiPolygon') {
        loops = geom.coordinates.map(coordsGroup => {
          return coordsGroup[0].map(c => ({ lat: c[1], lng: c[0] }));
        });
      } else if (geom.type === 'Polygon') {
        loops = [geom.coordinates[0].map(c => ({ lat: c[1], lng: c[0] }))];
      }
      initialLabels = geom.subLabels || [];
    } else if (polygonCoords) {
      // Creating new zone
      loops = polygonCoords.filter(loop => loop.length >= 3);
    }

    // Map each loop strictly preserving coordinates array order to match map labels 1, 2, 3...
    return loops.map((loop, idx) => {
      let label = '';
      if (zone) {
        label = initialLabels[idx] || '';
      }
      
      return {
        loop,
        originalIndex: idx,
        label: label
      };
    });
  };

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
    
    const sorted = getSortedLoopsAndLabels();
    setSortedZonesData(sorted);
  }, [zone, polygonCoords]);

  const handleSubLabelChange = (index, value) => {
    setSortedZonesData(prev => {
      const next = [...prev];
      next[index] = { ...next[index], label: value };
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('구역명을 입력해주세요.');
      return;
    }

    if (!zone && sortedZonesData.length === 0) {
      alert('지도상에 최소 1개 이상의 올바른 영역(꼭짓점 3개 이상)을 그려주세요.');
      return;
    }

    setSaving(true);
    setError(null);
    const dbUserId = getDbUserId(currentUser);

    try {
      // Re-map sorted loops to GeoJSON structures
      const sortedLoops = sortedZonesData.map(d => d.loop);
      const subLabelsToSave = sortedZonesData.map(d => d.label.trim() || name.trim()); // Fallback to main zone name if empty

      const multiPolygonCoords = sortedLoops.map(loop => {
        const ring = loop.map(pt => [pt.lng, pt.lat]);
        // Close the polygon ring loop by repeating the first coordinate
        if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
          ring.push([loop[0].lng, loop[0].lat]);
        }
        return [ring];
      });

      const geoJSONPolygon = {
        type: 'MultiPolygon',
        coordinates: multiPolygonCoords,
        subLabels: subLabelsToSave
      };

      if (zone) {
        // UPDATE Existing Zone (including its subLabels inside polygon JSONB)
        const { error } = await supabase
          .from('rn_route_zones')
          .update({
            name: name.trim(),
            color,
            memo: memo.trim(),
            polygon: geoJSONPolygon,
            updated_by: dbUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', zone.id);

        if (error) throw error;
      } else {
        // INSERT New Zone as MultiPolygon GeoJSON
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
    : (zone && zone.polygon ? (zone.polygon.coordinates || []).reduce((sum, group) => sum + (group[0] || []).length, 0) : 0);
  const loopCount = sortedZonesData.length;

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {error && <div style={styles.errorBanner}>{error}</div>}

      <div className="input-group">
        <label className="input-label" htmlFor="zone-name">구역명 *</label>
        <input
          id="zone-name"
          type="text"
          className="input-field"
          placeholder="예) 장전래미안, 온천삼거리구역"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {sortedZonesData.length > 0 && (
        <div className="input-group" style={{ marginTop: '4px', marginBottom: '16px' }}>
          <label className="input-label">구역 내 각 영역별 표시 텍스트</label>
          <div style={styles.subLabelsList}>
            {sortedZonesData.map((d, index) => {
              return (
                <div key={index} style={styles.subLabelItem}>
                  <span style={styles.subLabelHint}>
                    영역 {index + 1} (지도 상의 {index + 1}번 덩어리)
                  </span>
                  <input
                    type="text"
                    className="input-field"
                    style={{ marginTop: '4px' }}
                    placeholder={`예) A동, 101동 등 개별 명칭 입력 (미기입시 "${name || '구역명'}")`}
                    value={d.label}
                    onChange={(e) => handleSubLabelChange(index, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      <div style={styles.infoBox}>
        <span>분리된 영역 수: <strong>{loopCount}개</strong> (총 꼭짓점 수: {totalPoints}개)</span>
      </div>

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
  subLabelsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    backgroundColor: 'var(--bg-input)',
    padding: '12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--bg-card-border)',
    marginTop: '6px',
  },
  subLabelItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  subLabelHint: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
  },
};
