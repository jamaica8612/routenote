import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Edit2, History, Save, Search, X } from 'lucide-react';
import { supabase } from '../supabaseClient';

const BUILDINGS = [
  { code: 'cheonggwamul', name: '청과물동' },
  { code: 'mubaechu', name: '무배추동' },
  { code: 'yangnyeom', name: '양념동' },
  { code: 'hwahwe', name: '화훼단지' },
];

const COMPANY_COLORS = {
  '동부청과': { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
  '부산중앙청과': { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
  '농협반여공판장': { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412' },
};

const SECTION_BG = '#F5F3FF';
const SECTION_BORDER = '#C4B5FD';
const SECTION_TEXT = '#6D28D9';

function getCellStyle(cell, isHighlighted) {
  if (!cell) return { background: 'transparent', border: 'none' };

  const highlight = isHighlighted
    ? { outline: '2px solid #F59E0B', outlineOffset: '-2px', zIndex: 2, position: 'relative' }
    : {};

  if (cell.cell_type === 'company_header') {
    const co = COMPANY_COLORS[cell.vendor_name] || COMPANY_COLORS['동부청과'];
    return { background: co.bg, border: `1px solid ${co.border}`, color: co.text, fontWeight: 800, fontSize: 11, ...highlight };
  }
  if (cell.cell_type === 'section_header') {
    return { background: SECTION_BG, border: `1px solid ${SECTION_BORDER}`, color: SECTION_TEXT, fontWeight: 700, fontSize: 11, ...highlight };
  }
  if (cell.cell_type === 'walkway') {
    return { background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#64748B', fontSize: 10, fontStyle: 'italic', ...highlight };
  }
  if (cell.cell_type === 'facility') {
    return { background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 10, ...highlight };
  }
  if (cell.cell_type === 'label') {
    return { background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569', fontSize: 10, fontWeight: 700, ...highlight };
  }
  if (cell.cell_type === 'stall') {
    const co = cell.company_name ? (COMPANY_COLORS[cell.company_name] || {}) : {};
    const baseBg = co.bg || '#FAFAFA';
    const baseBorder = co.border || '#E2E8F0';
    return {
      background: isHighlighted ? '#FEF3C7' : baseBg,
      border: `1px solid ${isHighlighted ? '#F59E0B' : baseBorder}`,
      color: '#111827', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      ...highlight,
    };
  }
  if (cell.cell_type === 'vendor') {
    return {
      background: isHighlighted ? '#FEF3C7' : '#F8FAFC',
      border: `1px solid ${isHighlighted ? '#F59E0B' : '#E2E8F0'}`,
      color: '#374151', fontSize: 11, cursor: 'pointer',
      ...highlight,
    };
  }
  return { background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 11, ...highlight };
}

function buildGrid(stalls) {
  const grid = {};
  let maxRow = 0, maxCol = 0;
  for (const s of stalls) {
    grid[`${s.row_idx},${s.col_idx}`] = s;
    if (s.row_idx > maxRow) maxRow = s.row_idx;
    if (s.col_idx > maxCol) maxCol = s.col_idx;
  }
  return { grid, maxRow, maxCol };
}

function CheonggwamulGrid({ stalls, highlightIds, onCellClick }) {
  const { grid, maxRow, maxCol } = buildGrid(stalls);
  const rows = [];
  for (let r = 0; r <= maxRow; r++) {
    const cols = [];
    for (let c = 0; c <= maxCol; c++) {
      const cell = grid[`${r},${c}`];
      const isH = cell && highlightIds.has(cell.id);
      const display = cell ? (cell.stall_number || cell.vendor_name || cell.section_name || '') : '';
      cols.push(
        <td
          key={c}
          style={{
            ...getCellStyle(cell, isH),
            minWidth: 40, maxWidth: 40, width: 40, height: 28,
            padding: '2px 3px', textAlign: 'center', boxSizing: 'border-box',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            verticalAlign: 'middle',
          }}
          title={display}
          onClick={() => cell && (cell.cell_type === 'stall' || cell.cell_type === 'vendor') && onCellClick(cell)}
        >
          {display}
        </td>
      );
    }
    rows.push(<tr key={r}>{cols}</tr>);
  }
  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 12 }}>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

function MubaechuGrid({ stalls, highlightIds, onCellClick }) {
  const { grid, maxRow, maxCol } = buildGrid(stalls);
  const rows = [];
  for (let r = 0; r <= maxRow; r++) {
    const cols = [];
    for (let c = 0; c <= maxCol; c++) {
      const cell = grid[`${r},${c}`];
      const isH = cell && highlightIds.has(cell.id);
      const display = cell ? (cell.vendor_name || cell.stall_number || '') : '';
      cols.push(
        <td
          key={c}
          style={{
            ...getCellStyle(cell, isH),
            minWidth: 72, width: 72, height: 36,
            padding: '3px 5px', textAlign: 'center', boxSizing: 'border-box',
            whiteSpace: 'pre-wrap', verticalAlign: 'middle', fontSize: 12,
          }}
          title={display}
          onClick={() => cell && (cell.cell_type === 'stall' || cell.cell_type === 'vendor') && onCellClick(cell)}
        >
          {display}
        </td>
      );
    }
    rows.push(<tr key={r}>{cols}</tr>);
  }
  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 12 }}>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

function YangnyeomGrid({ stalls, highlightIds, onCellClick }) {
  const { grid, maxRow, maxCol } = buildGrid(stalls);

  const sectionCols = [0, 2, 4, 6];
  const sectionNames = {};
  for (const [key, cell] of Object.entries(grid)) {
    if (cell.section_name) sectionNames[cell.col_idx] = cell.section_name;
  }

  const headers = sectionCols.map((c) => (
    <th key={c} style={{
      padding: '8px 12px', background: SECTION_BG, color: SECTION_TEXT,
      fontWeight: 700, fontSize: 12, border: `1px solid ${SECTION_BORDER}`,
      textAlign: 'center', whiteSpace: 'pre-wrap', minWidth: 100,
    }}>
      {sectionNames[c] || ''}
    </th>
  ));

  const dataRows = [];
  for (let r = 0; r <= maxRow; r++) {
    const hasCells = sectionCols.some((c) => grid[`${r},${c}`] && grid[`${r},${c}`].cell_type !== 'section_header');
    if (!hasCells) continue;
    const cols = sectionCols.map((c) => {
      const cell = grid[`${r},${c}`];
      if (!cell || cell.cell_type === 'section_header') return <td key={c} style={{ border: '1px solid #E2E8F0', minWidth: 100, height: 32 }} />;
      const isH = highlightIds.has(cell.id);
      return (
        <td
          key={c}
          style={{
            ...getCellStyle(cell, isH),
            padding: '4px 8px', textAlign: 'center',
            boxSizing: 'border-box', minWidth: 100, height: 32,
            whiteSpace: 'pre-wrap', verticalAlign: 'middle',
          }}
          onClick={() => (cell.cell_type === 'stall' || cell.cell_type === 'vendor') && onCellClick(cell)}
        >
          {cell.vendor_name || cell.stall_number || ''}
        </td>
      );
    });
    dataRows.push(<tr key={r}>{cols}</tr>);
  }

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr>{headers}</tr></thead>
        <tbody>{dataRows}</tbody>
      </table>
    </div>
  );
}

function EmptyBuilding({ name }) {
  return (
    <div style={{ padding: '48px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🌸</div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{name} 데이터 없음</div>
      <div>셀을 클릭하여 직접 추가할 수 있습니다.</div>
    </div>
  );
}

function EditModal({ cell, currentUser, onClose, onSaved }) {
  const [vendorName, setVendorName] = useState(cell.vendor_name || '');
  const [stallNumber, setStallNumber] = useState(cell.stall_number || '');
  const [notes, setNotes] = useState(cell.notes || '');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    supabase
      .from('rn_market_stall_history')
      .select('*, changer:rn_profiles(name)')
      .eq('stall_id', cell.id)
      .order('changed_at', { ascending: false })
      .limit(10)
      .then(({ data }) => data && setHistory(data));
  }, [cell.id]);

  const handleSave = async () => {
    setSaving(true);
    const oldData = { vendor_name: cell.vendor_name, stall_number: cell.stall_number, notes: cell.notes };
    const newData = { vendor_name: vendorName || null, stall_number: stallNumber || null, notes: notes || null };

    const { error } = await supabase
      .from('rn_market_stalls')
      .update({ vendor_name: newData.vendor_name, stall_number: newData.stall_number, notes: newData.notes, updated_at: new Date().toISOString() })
      .eq('id', cell.id);

    if (error) { alert('저장 실패: ' + error.message); setSaving(false); return; }

    await supabase.from('rn_market_stall_history').insert({
      stall_id: cell.id,
      changed_by: currentUser.id,
      change_type: 'update',
      old_data: oldData,
      new_data: newData,
    });

    setSaving(false);
    onSaved({ ...cell, vendor_name: newData.vendor_name, stall_number: newData.stall_number, notes: newData.notes });
  };

  return (
    <div style={editStyles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={editStyles.modal}>
        <div style={editStyles.header}>
          <span style={editStyles.title}>
            {cell.section_name && <span style={editStyles.badge}>{cell.section_name}</span>}
            {cell.company_name && <span style={{ ...editStyles.badge, background: '#EFF6FF', color: '#1D4ED8' }}>{cell.company_name}</span>}
            {cell.cell_type === 'stall' ? '호수 수정' : '상호 수정'}
          </span>
          <button style={editStyles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={editStyles.fields}>
          <label style={editStyles.label}>호수</label>
          <input
            style={editStyles.input}
            value={stallNumber}
            onChange={(e) => setStallNumber(e.target.value)}
            placeholder="호수 번호"
          />
          <label style={editStyles.label}>상호명</label>
          <input
            style={editStyles.input}
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="상호명"
          />
          <label style={editStyles.label}>메모</label>
          <textarea
            style={{ ...editStyles.input, height: 60, resize: 'none' }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="메모 (선택)"
          />
        </div>

        <div style={editStyles.footer}>
          <button style={editStyles.historyBtn} onClick={() => setShowHistory(!showHistory)}>
            <History size={14} />
            수정이력
          </button>
          <button style={editStyles.saveBtn(saving)} disabled={saving} onClick={handleSave}>
            <Save size={14} />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>

        {showHistory && (
          <div style={editStyles.historyPanel}>
            {history.length === 0 && <div style={editStyles.historyEmpty}>수정이력 없음</div>}
            {history.map((h) => (
              <div key={h.id} style={editStyles.historyItem}>
                <div style={editStyles.historyMeta}>
                  <Clock size={11} />
                  {h.changer?.name || '?'} · {new Date(h.changed_at).toLocaleDateString('ko-KR')}
                </div>
                <div style={editStyles.historyChange}>
                  {h.old_data?.vendor_name !== h.new_data?.vendor_name && (
                    <span>상호: {h.old_data?.vendor_name || '-'} → {h.new_data?.vendor_name || '-'}</span>
                  )}
                  {h.old_data?.stall_number !== h.new_data?.stall_number && (
                    <span>호수: {h.old_data?.stall_number || '-'} → {h.new_data?.stall_number || '-'}</span>
                  )}
                  {h.old_data?.notes !== h.new_data?.notes && (
                    <span>메모: {h.old_data?.notes || '-'} → {h.new_data?.notes || '-'}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketMapModal({ isOpen, onClose, initialBuilding, currentUser }) {
  const [activeBuilding, setActiveBuilding] = useState(initialBuilding || 'cheonggwamul');
  const [stallsByBuilding, setStallsByBuilding] = useState({});
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCell, setEditingCell] = useState(null);

  useEffect(() => {
    if (initialBuilding) setActiveBuilding(initialBuilding);
  }, [initialBuilding]);

  useEffect(() => {
    if (!isOpen) return;
    supabase
      .from('rn_market_buildings')
      .select('*')
      .order('sort_order')
      .then(({ data }) => data && setBuildings(data));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (stallsByBuilding[activeBuilding]) return;

    setLoading(true);
    supabase
      .from('rn_market_buildings')
      .select('id')
      .eq('code', activeBuilding)
      .single()
      .then(({ data: building }) => {
        if (!building) { setLoading(false); return; }
        return supabase
          .from('rn_market_stalls')
          .select('*')
          .eq('building_id', building.id)
          .eq('is_deleted', false)
          .order('row_idx')
          .order('col_idx');
      })
      .then((res) => {
        if (res?.data) {
          setStallsByBuilding((prev) => ({ ...prev, [activeBuilding]: res.data }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isOpen, activeBuilding, stallsByBuilding]);

  const stalls = stallsByBuilding[activeBuilding] || [];

  const lowerQ = searchQuery.trim().toLowerCase();
  const highlightIds = new Set(
    lowerQ.length >= 1
      ? stalls.filter((s) =>
          (s.vendor_name && s.vendor_name.toLowerCase().includes(lowerQ)) ||
          (s.stall_number && s.stall_number.toLowerCase().includes(lowerQ)) ||
          (s.section_name && s.section_name.toLowerCase().includes(lowerQ))
        ).map((s) => s.id)
      : []
  );

  const handleCellClick = (cell) => {
    if (currentUser?.role === 'viewer') return;
    setEditingCell(cell);
  };

  const handleSaved = (updatedCell) => {
    setStallsByBuilding((prev) => ({
      ...prev,
      [activeBuilding]: (prev[activeBuilding] || []).map((s) => s.id === updatedCell.id ? updatedCell : s),
    }));
    setEditingCell(null);
  };

  if (!isOpen) return null;

  const buildingNames = Object.fromEntries(buildings.map((b) => [b.code, b.name]));

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerTitle}>반여농산물시장</span>
          </div>
          <button style={styles.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        <div style={styles.tabs}>
          {BUILDINGS.map((b) => (
            <button
              key={b.code}
              style={styles.tab(activeBuilding === b.code)}
              onClick={() => { setActiveBuilding(b.code); setSearchQuery(''); }}
            >
              {buildingNames[b.code] || b.name}
            </button>
          ))}
        </div>

        <div style={styles.searchRow}>
          <Search size={15} color="#94A3B8" style={{ flexShrink: 0 }} />
          <input
            style={styles.searchInput}
            placeholder="호수, 상호명, 구역 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button style={styles.clearBtn} onClick={() => setSearchQuery('')}><X size={13} /></button>
          )}
          {highlightIds.size > 0 && (
            <span style={styles.matchCount}>{highlightIds.size}건</span>
          )}
        </div>

        <div style={styles.gridContainer}>
          {loading && <div style={styles.loading}>데이터 불러오는 중...</div>}
          {!loading && stalls.length === 0 && <EmptyBuilding name={buildingNames[activeBuilding] || activeBuilding} />}
          {!loading && stalls.length > 0 && activeBuilding === 'cheonggwamul' && (
            <CheonggwamulGrid stalls={stalls} highlightIds={highlightIds} onCellClick={handleCellClick} />
          )}
          {!loading && stalls.length > 0 && activeBuilding === 'mubaechu' && (
            <MubaechuGrid stalls={stalls} highlightIds={highlightIds} onCellClick={handleCellClick} />
          )}
          {!loading && stalls.length > 0 && (activeBuilding === 'yangnyeom' || activeBuilding === 'hwahwe') && (
            <YangnyeomGrid stalls={stalls} highlightIds={highlightIds} onCellClick={handleCellClick} />
          )}
        </div>

        {currentUser?.role !== 'viewer' && (
          <div style={styles.hint}>셀을 클릭하면 수정할 수 있습니다</div>
        )}
      </div>

      {editingCell && (
        <EditModal
          cell={editingCell}
          currentUser={currentUser}
          onClose={() => setEditingCell(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)',
    zIndex: 9000, display: 'flex', alignItems: 'flex-end',
  },
  modal: {
    width: '100%', height: '92vh',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px 12px', borderBottom: '1px solid #F1F5F9', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: 800, color: '#111827' },
  closeBtn: {
    width: 34, height: 34, borderRadius: '50%', border: 'none',
    backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#374151',
  },
  tabs: {
    display: 'flex', gap: 4, padding: '0 16px 10px', flexShrink: 0, overflowX: 'auto',
  },
  tab: (active) => ({
    padding: '7px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
    backgroundColor: active ? '#6366F1' : '#F1F5F9',
    color: active ? '#FFFFFF' : '#64748B',
    boxShadow: active ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
  }),
  searchRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    margin: '0 16px 10px', padding: '8px 12px',
    backgroundColor: '#F8FAFC', borderRadius: 12,
    border: '1px solid #E2E8F0', flexShrink: 0,
  },
  searchInput: {
    flex: 1, border: 'none', background: 'transparent',
    fontSize: 14, color: '#111827', outline: 'none',
  },
  clearBtn: {
    width: 22, height: 22, borderRadius: '50%', border: 'none',
    backgroundColor: '#E2E8F0', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  matchCount: {
    flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#F59E0B',
    backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: 12,
  },
  gridContainer: { flex: 1, overflow: 'hidden', padding: '0 8px 8px' },
  loading: { padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 14 },
  hint: {
    padding: '6px 16px 10px', textAlign: 'center',
    fontSize: 11, color: '#94A3B8', flexShrink: 0,
  },
};

const editStyles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 9100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    padding: '0 0 0 0',
  },
  modal: {
    width: '100%', maxWidth: 480, backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: '20px 20px 32px', boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: '#111827' },
  badge: {
    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
    background: SECTION_BG, color: SECTION_TEXT,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: '50%', border: 'none',
    backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', color: '#374151',
  },
  fields: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: '#64748B', marginTop: 4 },
  input: {
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC',
    color: '#111827', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  },
  footer: { display: 'flex', gap: 8, marginTop: 4 },
  historyBtn: {
    display: 'flex', alignItems: 'center', gap: 5, padding: '10px 14px',
    borderRadius: 10, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC',
    color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  saveBtn: (disabled) => ({
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    padding: '10px 14px', borderRadius: 10, border: 'none',
    backgroundColor: disabled ? '#CBD5E1' : '#6366F1',
    color: '#FFFFFF', fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  historyPanel: {
    borderTop: '1px solid #F1F5F9', paddingTop: 10,
    display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto',
  },
  historyEmpty: { fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '8px 0' },
  historyItem: {
    padding: '8px 10px', backgroundColor: '#F8FAFC',
    borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 3,
  },
  historyMeta: {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 11, color: '#94A3B8', fontWeight: 600,
  },
  historyChange: {
    display: 'flex', flexDirection: 'column', gap: 2,
    fontSize: 12, color: '#374151',
  },
};
