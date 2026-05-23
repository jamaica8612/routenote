import React, { useEffect, useMemo, useState } from 'react';
import { Map as MapIcon, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getDbUserId } from '../utils/userUtils';
import { fetchPostcodeZone } from '../utils/postcodeZoneUtils';

const ZONE_COLORS = [
  { value: '#6366F1', label: 'Indigo' },
  { value: '#10B981', label: 'Green' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#EF4444', label: 'Red' },
  { value: '#3B82F6', label: 'Blue' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#8B5CF6', label: 'Violet' },
  { value: '#14B8A6', label: 'Teal' },
];

function makeEmptyRow() {
  return {
    postcode: '',
    label: '',
    data: null,
    error: '',
    loading: false,
  };
}

function makeGroup(prefix = '') {
  return {
    prefix,
    rows: [makeEmptyRow()],
  };
}

function makeDefaultCodeGroups() {
  return [
    { ...makeGroup('302A'), rows: [{ ...makeEmptyRow(), postcode: '46225', label: '302A01' }] },
  ];
}

function extractPostcodeRowsFromGeometry(geom) {
  if (!geom?.coordinates?.length) return [];

  const groupedRows = new Map();
  const subLabels = geom.subLabels || [];
  const postcodes = geom.postcodes || [];

  geom.coordinates.forEach((polygon, index) => {
    const label = subLabels[index] || '';
    const postcode = postcodes[index] || '';
    if (!label && !postcode) return;

    const key = `${label}|${postcode}`;
    const existing = groupedRows.get(key) || {
      postcode,
      label,
      data: {
        postcode,
        cityName: '',
        districtName: '',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [],
        },
      },
      error: '',
      loading: false,
    };

    existing.data.geometry.coordinates.push(polygon);
    groupedRows.set(key, existing);
  });

  return [...groupedRows.values()];
}

function getCodeGroupsFromZone(zone) {
  const geom = zone?.polygon;
  if (geom?.source !== 'postcode-boundary') return makeDefaultCodeGroups();

  const savedRows = extractPostcodeRowsFromGeometry(geom);
  if (savedRows.length === 0) return makeDefaultCodeGroups();

  if (Array.isArray(geom.codeGroups) && geom.codeGroups.length > 0) {
    return geom.codeGroups.map(group => {
      const rows = (group.codes || [])
        .map(code => savedRows.find(row => row.label === code.label && row.postcode === code.postcode))
        .filter(Boolean);

      return {
        prefix: group.prefix || '',
        rows: rows.length > 0 ? rows : [makeEmptyRow()],
      };
    });
  }

  return [{ prefix: '', rows: savedRows }];
}

function getLoopsFromZone(zone, polygonCoords) {
  let loops = [];
  let initialLabels = [];

  if (polygonCoords?.some(loop => loop.length >= 3)) {
    loops = polygonCoords.filter(loop => loop.length >= 3);
  } else if (zone?.polygon) {
    const geom = zone.polygon;
    if (geom.type === 'MultiPolygon') {
      loops = geom.coordinates.map(coordsGroup => coordsGroup[0].map(c => ({ lat: c[1], lng: c[0] })));
    } else if (geom.type === 'Polygon') {
      loops = [geom.coordinates[0].map(c => ({ lat: c[1], lng: c[0] }))];
    }
    initialLabels = geom.subLabels || [];
  }

  return loops.map((loop, idx) => ({
    loop,
    originalIndex: idx,
    label: initialLabels[idx] || '',
  }));
}

export default function ZoneForm({ zone, polygonCoords, currentUser, onSave, onCancel, onStartDrawing }) {
  const [name, setName] = useState('');
  const [regionName, setRegionName] = useState('');
  const [manualCodePrefix, setManualCodePrefix] = useState('302A');
  const [color, setColor] = useState('#6366F1');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [sortedZonesData, setSortedZonesData] = useState([]);
  const [codeGroups, setCodeGroups] = useState(makeDefaultCodeGroups);
  const [zoneInputMode, setZoneInputMode] = useState('postcode');

  const isPostcodeZone = zone?.polygon?.source === 'postcode-boundary';
  const hasDrawnGeometry = zoneInputMode === 'manual' && sortedZonesData.length > 0;
  const showPostcodeEditor = zoneInputMode === 'postcode';

  useEffect(() => {
    if (zone) {
      setName(zone.name || '');
      setRegionName(zone.polygon?.regionName || '');
      setColor(zone.color || '#6366F1');
      setMemo(zone.memo || '');
    } else {
      setName('');
      setRegionName('');
      setColor('#6366F1');
      setMemo('');
    }

    const hasIncomingDrawnCoords = polygonCoords?.some(loop => loop.length >= 3);
    const nextMode = hasIncomingDrawnCoords || (zone && !isPostcodeZone) ? 'manual' : 'postcode';

    setZoneInputMode(nextMode);
    setCodeGroups(zone ? getCodeGroupsFromZone(zone) : makeDefaultCodeGroups());
    setSortedZonesData(nextMode === 'manual' ? getLoopsFromZone(zone, polygonCoords) : []);
  }, [zone, polygonCoords, isPostcodeZone]);

  const totalPoints = useMemo(() => {
    if (polygonCoords && polygonCoords.length > 0) {
      return polygonCoords.reduce((sum, loop) => sum + loop.length, 0);
    }
    if (zone?.polygon?.coordinates) {
      return zone.polygon.coordinates.reduce((sum, group) => sum + (group[0] || []).length, 0);
    }
    return 0;
  }, [polygonCoords, zone]);

  const lookupCount = useMemo(() => (
    codeGroups.reduce((sum, group) => sum + group.rows.filter(row => row.data).length, 0)
  ), [codeGroups]);

  const updateGroup = (groupIndex, patch) => {
    setCodeGroups(prev => prev.map((group, index) => (
      index === groupIndex ? { ...group, ...patch } : group
    )));
  };

  const updateRow = (groupIndex, rowIndex, patch) => {
    setCodeGroups(prev => prev.map((group, currentGroupIndex) => {
      if (currentGroupIndex !== groupIndex) return group;

      return {
        ...group,
        rows: group.rows.map((row, currentRowIndex) => (
          currentRowIndex === rowIndex ? { ...row, ...patch } : row
        )),
      };
    }));
  };

  const addGroup = () => {
    setCodeGroups(prev => [...prev, makeGroup('')]);
  };

  const removeGroup = (groupIndex) => {
    setCodeGroups(prev => prev.filter((_, index) => index !== groupIndex));
  };

  const addRow = (groupIndex) => {
    setCodeGroups(prev => prev.map((group, index) => (
      index === groupIndex ? { ...group, rows: [...group.rows, makeEmptyRow()] } : group
    )));
  };

  const removeRow = (groupIndex, rowIndex) => {
    setCodeGroups(prev => prev.map((group, index) => {
      if (index !== groupIndex) return group;
      return { ...group, rows: group.rows.filter((_, currentRowIndex) => currentRowIndex !== rowIndex) };
    }));
  };

  const lookupPostcodeRow = async (groupIndex, rowIndex) => {
    const row = codeGroups[groupIndex]?.rows[rowIndex];
    if (!row) return;

    updateRow(groupIndex, rowIndex, { loading: true, error: '' });

    try {
      const data = await fetchPostcodeZone(row.postcode);
      updateRow(groupIndex, rowIndex, { data, loading: false, error: '' });

      const inferredRegion = `${data.cityName || ''} ${data.districtName || ''}`.trim();
      if (!regionName && inferredRegion) setRegionName(inferredRegion);
      if (!name && inferredRegion) setName(inferredRegion);
    } catch (err) {
      updateRow(groupIndex, rowIndex, {
        data: null,
        loading: false,
        error: err.message || 'Failed to load postcode boundary.',
      });
    }
  };

  const handleSubLabelChange = (index, value) => {
    setSortedZonesData(prev => {
      const next = [...prev];
      next[index] = { ...next[index], label: value };
      return next;
    });
  };

  const switchToPostcodeMode = () => {
    setZoneInputMode('postcode');
    setSortedZonesData([]);
    setCodeGroups(prev => {
      const hasSavedRows = prev.some(group => group.rows.some(row => row.data?.geometry));
      return hasSavedRows ? prev : makeDefaultCodeGroups();
    });
    setError(null);
  };

  const buildDrawnPolygon = () => {
    const sortedLoops = sortedZonesData.map(d => d.loop);
    const subLabelsToSave = sortedZonesData.map(d => d.label.trim() || name.trim());

    const multiPolygonCoords = sortedLoops.map(loop => {
      const ring = loop.map(pt => [pt.lng, pt.lat]);
      if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
        ring.push([loop[0].lng, loop[0].lat]);
      }
      return [ring];
    });

    return {
      type: 'MultiPolygon',
      coordinates: multiPolygonCoords,
      subLabels: subLabelsToSave,
      regionName: regionName.trim(),
      source: 'manual-drawing',
    };
  };

  const buildPostcodePolygon = () => {
    const coordinates = [];
    const subLabels = [];
    const postcodes = [];
    const codeGroupsMeta = [];

    codeGroups.forEach(group => {
      const prefix = group.prefix.trim().toUpperCase();
      const groupCodes = [];

      group.rows.forEach((row, rowIndex) => {
        if (!row.data?.geometry) return;

        const geom = row.data.geometry;
        const label = row.label.trim().toUpperCase();
        if (!label) return;
        groupCodes.push({ label, postcode: row.data.postcode });

        if (geom.type === 'Polygon') {
          coordinates.push(geom.coordinates);
          subLabels.push(label);
          postcodes.push(row.data.postcode);
        } else if (geom.type === 'MultiPolygon') {
          geom.coordinates.forEach(polygon => {
            coordinates.push(polygon);
            subLabels.push(label);
            postcodes.push(row.data.postcode);
          });
        }
      });

      if (groupCodes.length > 0) {
        codeGroupsMeta.push({ prefix, codes: groupCodes });
      }
    });

    if (coordinates.length === 0) return null;

    return {
      type: 'MultiPolygon',
      coordinates,
      subLabels,
      postcodes,
      codeGroups: codeGroupsMeta,
      regionName: regionName.trim(),
      source: 'postcode-boundary',
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('구역 이름을 입력해주세요.');
      return;
    }

    const geoJSONPolygon = hasDrawnGeometry ? buildDrawnPolygon() : buildPostcodePolygon();

    if (!geoJSONPolygon) {
      setError('우편번호를 조회하거나 지도에서 구역을 직접 그려주세요.');
      return;
    }

    setSaving(true);
    setError(null);
    const dbUserId = getDbUserId(currentUser);

    try {
      const payload = {
        name: name.trim(),
        color,
        memo: memo.trim(),
        polygon: geoJSONPolygon,
        updated_by: dbUserId,
      };

      if (zone) {
        const { data: savedZone, error: updateError } = await supabase
          .from('rn_route_zones')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', zone.id)
          .select('*')
          .single();

        if (updateError) throw updateError;
        onSave(savedZone);
      } else {
        const { data: savedZone, error: insertError } = await supabase
          .from('rn_route_zones')
          .insert({ ...payload, created_by: dbUserId })
          .select('*')
          .single();

        if (insertError) throw insertError;
        onSave(savedZone);
      }
    } catch (err) {
      console.error('Error saving zone:', err);
      setError('구역 저장 오류: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {error && <div style={styles.errorBanner}>{error}</div>}

      <div className="input-group">
        <label className="input-label" htmlFor="zone-name">구역 이름 *</label>
        <input
          id="zone-name"
          type="text"
          className="input-field"
          placeholder="예: 302A303D"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          required
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="zone-region">지역명</label>
        <input
          id="zone-region"
          type="text"
          className="input-field"
          placeholder="예: 부산 금정구"
          value={regionName}
          onChange={(e) => setRegionName(e.target.value)}
        />
      </div>

      {showPostcodeEditor && (
        <div style={styles.postcodePanel}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>우편번호로 구역 만들기</div>
              <div style={styles.sectionSubtitle}>각 우편번호마다 지도에 표시할 코드를 직접 입력합니다.</div>
            </div>
            {onStartDrawing && (
              <button type="button" className="btn btn-secondary" style={styles.iconTextBtn} onClick={onStartDrawing}>
                <MapIcon size={16} /> 직접 그리기
              </button>
            )}
          </div>

          <div style={styles.groupList}>
            {codeGroups.map((group, groupIndex) => (
              <div key={groupIndex} style={styles.groupBox}>
                <div style={styles.groupHeader}>
                  <div className="input-group" style={styles.groupPrefixField}>
                    <label className="input-label" htmlFor={`zone-code-prefix-${groupIndex}`}>코드 그룹</label>
                    <input
                      id={`zone-code-prefix-${groupIndex}`}
                      type="text"
                      className="input-field"
                      placeholder="302A"
                      value={group.prefix}
                      onChange={(e) => updateGroup(groupIndex, { prefix: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={styles.iconOnlyBtn}
                    onClick={() => removeGroup(groupIndex)}
                    disabled={codeGroups.length === 1}
                    title="코드 그룹 삭제"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={styles.postcodeRows}>
                  {group.rows.map((row, rowIndex) => {
                    const codeLabel = row.label.trim().toUpperCase();

                    return (
                      <div key={rowIndex} style={styles.postcodeRow}>
                        <div style={styles.postcodeRowControls}>
                          <div style={styles.postcodeGrid}>
                          <input
                            type="text"
                            className="input-field"
                            style={styles.codeInput}
                            placeholder="302A01"
                            value={row.label}
                            onChange={(e) => updateRow(groupIndex, rowIndex, {
                              label: e.target.value.toUpperCase(),
                              error: '',
                            })}
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={5}
                            className="input-field"
                            style={styles.postcodeInput}
                            placeholder="우편번호"
                            value={row.postcode}
                            onChange={(e) => updateRow(groupIndex, rowIndex, {
                              postcode: e.target.value.replace(/\D/g, '').slice(0, 5),
                              data: null,
                              error: '',
                            })}
                          />
                          </div>
                          <div style={styles.postcodeActions}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={styles.rowActionBtn}
                            onClick={() => lookupPostcodeRow(groupIndex, rowIndex)}
                            disabled={row.loading || row.postcode.length !== 5 || !row.label.trim()}
                            title="우편번호 조회"
                          >
                            <Search size={16} />
                            {row.loading ? '조회 중...' : '우편번호 조회'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={styles.iconOnlyBtn}
                            onClick={() => removeRow(groupIndex, rowIndex)}
                            disabled={group.rows.length === 1}
                            title="행 삭제"
                          >
                            <Trash2 size={16} />
                          </button>
                          </div>
                        </div>
                        {row.data && (
                          <div style={styles.lookupSuccess}>
                            {codeLabel} / {row.data.cityName} {row.data.districtName} {row.data.postcode}
                          </div>
                        )}
                        {row.error && <div style={styles.rowError}>{row.error}</div>}
                      </div>
                    );
                  })}
                </div>

                <button type="button" className="btn btn-secondary" style={styles.addRowBtn} onClick={() => addRow(groupIndex)}>
                  <Plus size={16} /> 이 그룹에 우편번호 추가
                </button>
              </div>
            ))}
          </div>

          <button type="button" className="btn btn-secondary" style={styles.addGroupBtn} onClick={addGroup}>
            <Plus size={16} /> 코드 그룹 추가
          </button>
        </div>
      )}

      {hasDrawnGeometry && (
        <div className="input-group" style={{ marginTop: '4px', marginBottom: '16px' }}>
          {zone && (
            <button
              type="button"
              className="btn btn-secondary"
              style={styles.switchModeBtn}
              onClick={switchToPostcodeMode}
            >
              <Search size={16} /> 우편번호 기준으로 수정
            </button>
          )}

          <label className="input-label" htmlFor="manual-code-prefix">직접 그리기 코드</label>
          <input
            id="manual-code-prefix"
            type="text"
            className="input-field"
            placeholder="302A"
            value={manualCodePrefix}
            onChange={(e) => setManualCodePrefix(e.target.value.toUpperCase())}
          />

          <div style={styles.subLabelsList}>
            {sortedZonesData.map((d, index) => (
              <div key={index} style={styles.subLabelItem}>
                <span style={styles.subLabelHint}>영역 {index + 1}</span>
                <input
                  type="text"
                  className="input-field"
                  style={{ marginTop: '4px' }}
                  placeholder="302A01"
                  value={d.label}
                  onChange={(e) => handleSubLabelChange(index, e.target.value.toUpperCase())}
                />
              </div>
            ))}
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
          placeholder="배송 특이사항이나 진입 팁"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          style={{ resize: 'none' }}
        />
      </div>

      <div style={styles.infoBox}>
        {hasDrawnGeometry ? (
          <span>분리 영역 <strong>{sortedZonesData.length}개</strong> / 점 {totalPoints}개</span>
        ) : (
          <span>조회 완료 우편번호 <strong>{lookupCount}개</strong></span>
        )}
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
  postcodePanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '14px',
    marginBottom: '16px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--bg-card-border)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  sectionSubtitle: {
    marginTop: '3px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  groupList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  groupBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--bg-card-border)',
  },
  groupHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 40px',
    gap: '8px',
    alignItems: 'end',
  },
  groupPrefixField: {
    marginBottom: 0,
  },
  postcodeRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  postcodeRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  postcodeRowControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  postcodeGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: '8px',
    alignItems: 'center',
  },
  codeInput: {
    minWidth: 0,
  },
  postcodeInput: {
    minWidth: 0,
    textAlign: 'center',
  },
  iconTextBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap',
  },
  iconOnlyBtn: {
    width: '40px',
    height: '40px',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postcodeActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 40px',
    gap: '8px',
    alignItems: 'center',
  },
  rowActionBtn: {
    minWidth: 0,
    height: '40px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  addRowBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  addGroupBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  switchModeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginBottom: '12px',
    width: '100%',
  },
  lookupSuccess: {
    fontSize: '12px',
    color: 'var(--success)',
  },
  rowError: {
    fontSize: '12px',
    color: 'var(--danger)',
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
    marginTop: '10px',
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
