import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, History, Plus, Save, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { supabase } from '../supabaseClient';

const BUILDINGS = [
  { code: 'cheonggwamul', name: '청과물동' },
  { code: 'mubaechu', name: '무배추동' },
  { code: 'yangnyeom', name: '양념동' },
  { code: 'hwahwe', name: '화훼단지' },
];

const COMPANY_COLORS = {
  '동부청과': { bg: '#DBEAFE', border: '#93C5FD', text: '#1D4ED8', soft: '#EFF6FF' },
  '부산중앙청과': { bg: '#FECACA', border: '#FCA5A5', text: '#B91C1C', soft: '#FEF2F2' },
  '농협반여공판장': { bg: '#BBF7D0', border: '#86EFAC', text: '#166534', soft: '#F0FDF4' },
};

const COMPANY_SHORT = {
  '동부청과': '동부',
  '부산중앙청과': '중앙',
  '농협반여공판장': '농협',
};

const SECTION_BG = '#F5F3FF';
const SECTION_BORDER = '#C4B5FD';
const SECTION_TEXT = '#6D28D9';
const GROUP_BORDER = '#475569';

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

function computeCompanyRanges(stalls, maxCol) {
  const headers = stalls
    .filter((s) => s.cell_type === 'company_header')
    .sort((a, b) => a.col_idx - b.col_idx);
  if (headers.length === 0) return [];
  const ranges = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].col_idx;
    const end = i + 1 < headers.length ? headers[i + 1].col_idx - 1 : maxCol;
    ranges.push({ name: headers[i].vendor_name, start, end });
  }
  return ranges;
}

function computeSectionRanges(stalls, maxCol) {
  const headers = stalls
    .filter((s) => s.cell_type === 'section_header')
    .sort((a, b) => a.col_idx - b.col_idx);
  if (headers.length === 0) return [];
  const ranges = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].col_idx;
    const end = i + 1 < headers.length ? headers[i + 1].col_idx - 1 : maxCol;
    ranges.push({
      name: headers[i].section_name,
      company: headers[i].company_name,
      start,
      end,
    });
  }
  return ranges;
}

function makeColMap(ranges, key = 'name') {
  const map = {};
  for (const r of ranges) {
    for (let c = r.start; c <= r.end; c++) map[c] = r[key];
  }
  return map;
}

const CELL_W = 42;
const CELL_H = 24;

function CheonggwamulGrid({ stalls, highlightIds, onCellClick, onEmptyClick, scrollRef }) {
  const { grid, maxRow, maxCol } = buildGrid(stalls);
  const companyRanges = useMemo(() => computeCompanyRanges(stalls, maxCol), [stalls, maxCol]);
  const sectionRanges = useMemo(() => computeSectionRanges(stalls, maxCol), [stalls, maxCol]);
  const colCompany = useMemo(() => makeColMap(companyRanges), [companyRanges]);
  const colSection = useMemo(() => makeColMap(sectionRanges), [sectionRanges]);

  const headerRows = useMemo(() => {
    const rows = new Set();
    for (const s of stalls) {
      if (s.cell_type === 'company_header' || s.cell_type === 'section_header') rows.add(s.row_idx);
    }
    return rows;
  }, [stalls]);

  const minDataRow = useMemo(() => {
    const sectionRows = stalls
      .filter((s) => s.cell_type === 'section_header')
      .map((s) => s.row_idx);
    if (sectionRows.length === 0) return 2;
    return Math.max(...sectionRows) + 1;
  }, [stalls]);

  const sectionKeyAt = useCallback((r, c) => {
    const cell = grid[`${r},${c}`];
    if (cell && cell.section_name && cell.company_name && cell.cell_type !== 'section_header' && cell.cell_type !== 'company_header') {
      return `${cell.section_name}|${cell.company_name}`;
    }
    return null;
  }, [grid]);

  const hasAnyBorders = useMemo(
    () => stalls.some((s) => s.borders && (s.borders.l || s.borders.r || s.borders.t || s.borders.b)),
    [stalls]
  );

  const totalCols = maxCol + 1;

  const companyBand = (
    <tr>
      {Array.from({ length: totalCols }).map((_, c) => {
        const r = companyRanges.find((x) => x.start === c);
        if (r) {
          const co = COMPANY_COLORS[r.name] || {};
          return (
            <td
              key={c}
              colSpan={r.end - r.start + 1}
              style={{
                background: co.bg,
                color: co.text,
                fontWeight: 800,
                fontSize: 12,
                textAlign: 'center',
                padding: '8px 4px',
                border: `1px solid ${co.border}`,
              }}
              data-company={r.name}
            >
              {r.name}
            </td>
          );
        }
        if (companyRanges.some((x) => c > x.start && c <= x.end)) return null;
        return <td key={c} style={{ background: '#F8FAFC', height: 32 }} />;
      })}
    </tr>
  );

  const sectionBand = (
    <tr>
      {Array.from({ length: totalCols }).map((_, c) => {
        const r = sectionRanges.find((x) => x.start === c);
        if (r) {
          return (
            <td
              key={c}
              colSpan={r.end - r.start + 1}
              style={{
                background: SECTION_BG,
                color: SECTION_TEXT,
                fontWeight: 700,
                fontSize: 11,
                textAlign: 'center',
                padding: '4px',
                border: `1px solid ${SECTION_BORDER}`,
              }}
            >
              {r.name}
            </td>
          );
        }
        if (sectionRanges.some((x) => c > x.start && c <= x.end)) return null;
        return <td key={c} style={{ background: '#F8FAFC', height: 24, border: '1px solid #E2E8F0' }} />;
      })}
    </tr>
  );

  const dataRows = [];
  for (let r = minDataRow; r <= maxRow; r++) {
    if (headerRows.has(r)) continue;
    const cols = [];
    for (let c = 0; c <= maxCol; c++) {
      const cell = grid[`${r},${c}`];
      const isH = cell && highlightIds.has(cell.id);
      const company = cell?.company_name || colCompany[c];
      const section = cell?.section_name || colSection[c];
      const co = COMPANY_COLORS[company] || {};

      const myKey = sectionKeyAt(r, c);
      const borders = {};
      if (hasAnyBorders) {
        const b = cell?.borders || {};
        if (b.t) borders.borderTop = `2px solid ${GROUP_BORDER}`;
        if (b.b) borders.borderBottom = `2px solid ${GROUP_BORDER}`;
        if (b.l) borders.borderLeft = `2px solid ${GROUP_BORDER}`;
        if (b.r) borders.borderRight = `2px solid ${GROUP_BORDER}`;
      } else if (myKey) {
        if (sectionKeyAt(r - 1, c) !== myKey) borders.borderTop = `2px solid ${GROUP_BORDER}`;
        if (sectionKeyAt(r + 1, c) !== myKey) borders.borderBottom = `2px solid ${GROUP_BORDER}`;
        if (sectionKeyAt(r, c - 1) !== myKey) borders.borderLeft = `2px solid ${GROUP_BORDER}`;
        if (sectionKeyAt(r, c + 1) !== myKey) borders.borderRight = `2px solid ${GROUP_BORDER}`;
      }

      const isFacility = cell?.cell_type === 'facility';
      const isWalkway = cell?.cell_type === 'walkway';
      const display = cell ? (cell.stall_number || cell.vendor_name || '') : '';

      let bg = company ? (co.soft || '#FFFFFF') : '#FFFFFF';
      if (cell && (cell.cell_type === 'stall' || cell.cell_type === 'vendor')) bg = co.soft || '#FAFAFA';
      if (isFacility) bg = '#FEF2F2';
      if (isWalkway) bg = '#F1F5F9';
      if (isH) bg = '#FEF3C7';

      const baseBorder = isH
        ? `2px solid #F59E0B`
        : myKey
          ? `1px solid rgba(71,85,105,0.18)`
          : `1px dashed rgba(148,163,184,0.25)`;

      const handleClick = () => {
        if (cell) onCellClick(cell);
        else onEmptyClick({ row_idx: r, col_idx: c, section_name: section || null, company_name: company || null });
      };

      cols.push(
        <td
          key={c}
          style={{
            width: CELL_W,
            minWidth: CELL_W,
            maxWidth: CELL_W,
            height: CELL_H,
            background: bg,
            color: isFacility ? '#DC2626' : isWalkway ? '#64748B' : '#111827',
            fontSize: isFacility || isWalkway ? 9 : 10,
            fontStyle: isWalkway ? 'italic' : 'normal',
            fontWeight: isH ? 700 : 600,
            textAlign: 'center',
            verticalAlign: 'middle',
            padding: '1px 2px',
            boxSizing: 'border-box',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'pointer',
            border: baseBorder,
            ...borders,
          }}
          title={display || `${section || ''} R${r}·C${c}`}
          onClick={handleClick}
          data-company-col={companyRanges.find((x) => x.start === c)?.name || undefined}
        >
          {display || (cell ? '' : '')}
        </td>
      );
    }
    dataRows.push(<tr key={r}>{cols}</tr>);
  }

  return (
    <table
      ref={scrollRef}
      style={{
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        fontSize: 11,
        userSelect: 'none',
      }}
    >
      <tbody>
        {companyBand}
        {sectionBand}
        {dataRows}
      </tbody>
    </table>
  );
}

function MubaechuGrid({ stalls, highlightIds, onCellClick, onEmptyClick, scrollRef }) {
  const { grid } = buildGrid(stalls);

  // 데이터가 있는 열만 추출 (라벨 행 제외)
  const dataCols = useMemo(() => {
    const cols = new Set();
    for (const s of stalls) {
      if (s.cell_type !== 'label') cols.add(s.col_idx);
    }
    return Array.from(cols).sort((a, b) => a - b);
  }, [stalls]);

  // 데이터 행 (label 제외)
  const dataRows = useMemo(() => {
    const rows = new Set();
    for (const s of stalls) {
      if (s.cell_type !== 'label') rows.add(s.row_idx);
    }
    return Array.from(rows).sort((a, b) => a - b);
  }, [stalls]);

  const walkwaySet = useMemo(() => {
    const s = new Set();
    for (const st of stalls) if (st.cell_type === 'walkway') s.add(st.row_idx);
    return s;
  }, [stalls]);

  // 라벨 셀 (무배추동 제목)
  const labelCell = useMemo(() => stalls.find((s) => s.cell_type === 'label'), [stalls]);

  const STALL_W = 88;
  const OUTER = '#1F2937';   // 검정 외곽선
  const INNER = '#94A3B8';   // 회색 내부선
  const TITLE_BG = '#FEF3C7';     // 노랑 (제목)
  const TITLE_BORDER = '#D97706'; // 진한 노랑
  const WALK_BG = '#D1FAE5';      // 연두 (통로)

  const tableRows = [];
  const totalRows = dataRows.length;

  dataRows.forEach((r, rowIdx) => {
    const isWalkway = walkwaySet.has(r);
    const isFirstRow = rowIdx === 0;
    const isLastRow = rowIdx === totalRows - 1;

    if (isWalkway) {
      const wCell = grid[`${r},${dataCols[0]}`];
      tableRows.push(
        <tr key={r}>
          <td
            colSpan={dataCols.length}
            style={{
              background: WALK_BG,
              color: '#065F46',
              fontSize: 11, textAlign: 'center',
              padding: '7px 8px', fontWeight: 700, letterSpacing: 8,
              borderLeft: `2px solid ${OUTER}`,
              borderRight: `2px solid ${OUTER}`,
              borderTop: `1px solid ${INNER}`,
              borderBottom: `1px solid ${INNER}`,
            }}
          >
            {wCell?.vendor_name || '통    로'}
          </td>
        </tr>
      );
      return;
    }

    const cols = [];
    dataCols.forEach((c, colIdx) => {
      const cell = grid[`${r},${c}`];
      const isH = cell && highlightIds.has(cell.id);
      const display = cell ? (cell.vendor_name || cell.stall_number || cell.section_name || '') : '';
      const isVendor = cell?.cell_type === 'vendor';
      const isStall = cell?.cell_type === 'stall';
      const isEmpty = !cell;

      const isFirstCol = colIdx === 0;
      const isLastCol = colIdx === dataCols.length - 1;

      // 외곽선: 표의 가장자리만 굵게
      const borderTop = isFirstRow ? `2px solid ${OUTER}` : `1px solid ${INNER}`;
      const borderBottom = isLastRow ? `2px solid ${OUTER}` : `1px solid ${INNER}`;
      const borderLeft = isFirstCol ? `2px solid ${OUTER}` : `1px solid ${INNER}`;
      const borderRight = isLastCol ? `2px solid ${OUTER}` : `1px solid ${INNER}`;

      let bg = '#FFFFFF';
      let color = '#111827';
      let fw = 600;
      let fs = isStall ? 12 : 11;
      if (isEmpty) bg = '#FAFAFA';
      if (isH) bg = '#FEF3C7';

      cols.push(
        <td
          key={c}
          style={{
            width: STALL_W, minWidth: STALL_W,
            height: isVendor ? 36 : 30,
            background: bg, color, fontWeight: fw, fontSize: fs,
            textAlign: 'center', verticalAlign: 'middle',
            padding: '2px 6px', boxSizing: 'border-box',
            cursor: 'pointer',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            borderTop, borderBottom, borderLeft, borderRight,
            ...(isH && { outline: '2px solid #F59E0B', outlineOffset: '-2px' }),
          }}
          title={display}
          onClick={() => cell ? onCellClick(cell) : onEmptyClick({ row_idx: r, col_idx: c })}
        >
          {display}
        </td>
      );
    });
    tableRows.push(<tr key={r}>{cols}</tr>);
  });

  return (
    <div style={{ display: 'inline-block' }}>
      {/* 노란 제목 배너 */}
      <div
        style={{
          background: TITLE_BG,
          color: '#78350F',
          border: `2px solid ${TITLE_BORDER}`,
          borderRadius: 4,
          padding: '10px 16px',
          fontSize: 16,
          fontWeight: 800,
          textAlign: 'center',
          letterSpacing: 4,
          marginBottom: 8,
          width: STALL_W * dataCols.length - 4,
        }}
      >
        {labelCell?.vendor_name || '무배추동'}
      </div>
      <table ref={scrollRef} style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11 }}>
        <tbody>{tableRows}</tbody>
      </table>
    </div>
  );
}

function YangnyeomGrid({ stalls, highlightIds, onCellClick, onEmptyClick, scrollRef }) {
  const get = useCallback((r, c) => stalls.find((s) => s.row_idx === r && s.col_idx === c), [stalls]);
  const OUTER = '#1C3B4A';

  // 절대 위치 기반 평면도
  // 캔버스 크기
  const W = 1100;
  const H = 600;

  // 위치/크기 상수
  const TOP_STALL_W = 64;
  const TOP_STALL_H = 70;
  const TOP_LEFT_X = 290; // 상단 점포 시작 X (육일상회 12호의 왼쪽)
  const TOP_Y = 90;

  const RIGHT_FAC_W = TOP_STALL_W;
  const RIGHT_FAC_H = 28; // 시설 한 칸 높이
  const RIGHT_FAC_X = TOP_LEFT_X;
  const RIGHT_FAC_Y = TOP_Y + TOP_STALL_H; // 12호 점포 바로 아래

  const HARYEOK_X = W - 80;
  const HARYEOK_Y = TOP_Y + 100;

  const MID_Y = 320;
  const MID_STALL_W = 70;
  const MID_STALL_H = 70;
  const MID_LEFT_X = 10;
  const HWAJANG_W = 36;

  const BOT_Y = 460;
  const BOT_H = 80;
  const BOT_LEFT_X = 10;
  const BOT_W = W - 20;

  // 셀 렌더 헬퍼
  const stallBox = (cell, x, y, w, h, opts = {}) => {
    const isH = cell && highlightIds.has(cell.id);
    return (
      <div
        key={opts.key}
        onClick={() => cell ? onCellClick(cell) : onEmptyClick({ row_idx: opts.r, col_idx: opts.c })}
        style={{
          position: 'absolute', left: x, top: y, width: w, height: h,
          border: `1.5px solid ${OUTER}`,
          background: isH ? '#FEF3C7' : (cell ? '#FFFFFF' : '#FAFAFA'),
          color: cell ? '#0F172A' : '#CBD5E1',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontSize: opts.small ? 10 : 12,
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1.2,
          padding: '3px 2px',
          boxSizing: 'border-box',
          cursor: 'pointer',
          whiteSpace: 'normal',
          overflow: 'hidden',
          ...(isH && { outline: '2px solid #F59E0B' }),
        }}
        title={cell?.vendor_name || ''}
      >
        {cell ? (
          <>
            <div>{cell.vendor_name}</div>
            {cell.stall_number && (
              <div style={{ fontSize: opts.small ? 9 : 10.5, fontWeight: 500, marginTop: 2 }}>
                ({cell.stall_number}호)
              </div>
            )}
          </>
        ) : '—'}
      </div>
    );
  };

  const facilityBox = (cell, label, x, y, w, h, opts = {}) => {
    const isH = cell && highlightIds.has(cell.id);
    return (
      <div
        key={opts.key}
        onClick={() => cell && onCellClick(cell)}
        style={{
          position: 'absolute', left: x, top: y, width: w, height: h,
          border: `1.5px solid ${OUTER}`,
          background: isH ? '#FEF3C7' : '#FFFFFF',
          color: '#1C3B4A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700,
          textAlign: 'center', lineHeight: 1.25,
          boxSizing: 'border-box', cursor: cell ? 'pointer' : 'default',
          ...opts.style,
        }}
      >
        {cell?.vendor_name || label}
      </div>
    );
  };

  const labelText = (cell, text, x, y, w, h) => (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: w, height: h,
        color: '#1C3B4A', fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', boxSizing: 'border-box',
      }}
    >
      {cell?.vendor_name || text}
    </div>
  );

  return (
    <div style={{ padding: '8px 12px 16px' }}>
      {/* 양념동 점포찾기 타이틀 */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div style={{
          border: `1.5px solid ${OUTER}`, padding: '8px 36px',
          fontSize: 18, fontWeight: 800, letterSpacing: 4, color: OUTER,
        }}>
          양념동 점포찾기
        </div>
      </div>

      {/* 평면도 캔버스 */}
      <div ref={scrollRef} style={{ position: 'relative', width: W, height: H, background: '#FFFFFF' }}>

        {/* 북문 (좌상단 단독 박스) */}
        {facilityBox(get(1, 9), '북문', 20, TOP_Y + 8, 70, 34, { key: 'bukmun' })}

        {/* 공동작업장 (좌상단 단독 박스, 큼) */}
        {facilityBox(get(1, 10), '공동작업장', 130, TOP_Y, 110, 60, { key: 'gongdong' })}

        {/* 상단 점포 12호 → 1호 (우측 일렬) */}
        {/* col 0-7: 8개 단일 점포 */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((c, i) => (
          stallBox(get(0, c), TOP_LEFT_X + i * TOP_STALL_W, TOP_Y, TOP_STALL_W, TOP_STALL_H, { key: `t-${c}`, r: 0, c })
        ))}
        {/* col 8: 경북농산 (3~4호) - 2칸 너비 */}
        {stallBox(get(0, 8), TOP_LEFT_X + 8 * TOP_STALL_W, TOP_Y, TOP_STALL_W * 2, TOP_STALL_H, { key: 't-8', r: 0, c: 8 })}
        {/* col 10: 마늘나라 (2호) */}
        {stallBox(get(0, 10), TOP_LEFT_X + 10 * TOP_STALL_W, TOP_Y, TOP_STALL_W, TOP_STALL_H, { key: 't-10', r: 0, c: 10 })}
        {/* col 11: 생강마을 (1호) */}
        {stallBox(get(0, 11), TOP_LEFT_X + 11 * TOP_STALL_W, TOP_Y, TOP_STALL_W, TOP_STALL_H, { key: 't-11', r: 0, c: 11 })}

        {/* 좌측 시설 (12호 점포 바로 아래) */}
        {/* 출입구 라벨 */}
        {labelText(get(1, 0), '출입구', RIGHT_FAC_X - 65, RIGHT_FAC_Y, 60, RIGHT_FAC_H)}
        {/* 기계실 박스 */}
        {facilityBox(get(2, 0), '기계실', RIGHT_FAC_X, RIGHT_FAC_Y, RIGHT_FAC_W, 50, { key: 'gigye' })}
        {/* 경비실 박스 */}
        {facilityBox(get(3, 0), '경비실', RIGHT_FAC_X, RIGHT_FAC_Y + 50, RIGHT_FAC_W, 50, { key: 'gyungbi' })}
        {/* 차량출입구 (좌측 라벨, 경비실 아래) */}
        {labelText(get(4, 0), '차량출입구', RIGHT_FAC_X - 10, RIGHT_FAC_Y + 105, 90, 28)}

        {/* 하역반 (우측 단독 박스) */}
        {facilityBox(get(2, 11), '하역반', HARYEOK_X, HARYEOK_Y, 70, 60, { key: 'haryeok' })}

        {/* 중간 점포 20호 → 13호 (좌측 일렬) */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((c, i) => (
          stallBox(get(5, c), MID_LEFT_X + i * MID_STALL_W, MID_Y, MID_STALL_W, MID_STALL_H, { key: `m-${c}`, r: 5, c })
        ))}

        {/* 화장실 (예천농산 13호 옆, 세로 글자) */}
        <div
          onClick={() => { const c = get(5, 8); c && onCellClick(c); }}
          style={{
            position: 'absolute',
            left: MID_LEFT_X + 8 * MID_STALL_W, top: MID_Y,
            width: HWAJANG_W, height: MID_STALL_H,
            border: `1.5px solid ${OUTER}`, background: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxSizing: 'border-box',
          }}
        >
          <div style={{
            writingMode: 'vertical-rl', textOrientation: 'upright',
            fontSize: 13, fontWeight: 700, color: OUTER, letterSpacing: 2,
          }}>
            화장실
          </div>
        </div>

        {/* 차량출입구 (우측 라벨, 중간 행 우측) */}
        {labelText(get(5, 10), '차량출입구', HARYEOK_X - 30, MID_Y + 20, 120, 28)}

        {/* 출입구 (좌측 하단 라벨) */}
        {labelText(get(6, 0), '출입구', BOT_LEFT_X, BOT_Y - 30, 60, 26)}

        {/* 상장 지도원실 (우측 단독 박스) */}
        {facilityBox(get(6, 11), '상장\n지도원실', HARYEOK_X, BOT_Y - 30, 70, 56,
          { key: 'sangjang', style: { fontSize: 11, whiteSpace: 'pre-line' } })}

        {/* 하단 점포 21호 → 40호 (가로 전체) */}
        {Array.from({ length: 20 }).map((_, i) => {
          const cellW = BOT_W / 20;
          return stallBox(get(7, i), BOT_LEFT_X + i * cellW, BOT_Y, cellW, BOT_H, {
            key: `b-${i}`, r: 7, c: i, small: true,
          });
        })}
      </div>
    </div>
  );
}

function GenericGrid({ stalls, highlightIds, onCellClick, onEmptyClick, minCellW = 56, scrollRef }) {
  const { grid } = buildGrid(stalls);

  // 데이터가 있는 행/열만 추출 (빈 row/col 제거)
  const dataCols = useMemo(() => {
    const cols = new Set();
    for (const s of stalls) cols.add(s.col_idx);
    return Array.from(cols).sort((a, b) => a - b);
  }, [stalls]);

  const dataRows = useMemo(() => {
    const rows = new Set();
    for (const s of stalls) rows.add(s.row_idx);
    return Array.from(rows).sort((a, b) => a - b);
  }, [stalls]);

  // 섹션 헤더가 있는 행 → 다음 데이터까지 한 섹션
  const headerRows = useMemo(() => {
    const s = new Set();
    for (const st of stalls) {
      if (st.cell_type === 'section_header' || st.cell_type === 'label') s.add(st.row_idx);
    }
    return s;
  }, [stalls]);

  // 화훼단지의 col별 섹션 색상 팔레트
  const COL_PALETTE = [
    { bg: '#FCE7F3', border: '#F9A8D4', text: '#9D174D', soft: '#FDF2F8' },  // 핑크
    { bg: '#DBEAFE', border: '#93C5FD', text: '#1E40AF', soft: '#EFF6FF' },  // 블루
    { bg: '#D1FAE5', border: '#6EE7B7', text: '#065F46', soft: '#ECFDF5' },  // 그린
    { bg: '#FED7AA', border: '#FDBA74', text: '#9A3412', soft: '#FFF7ED' },  // 오렌지
    { bg: '#E0E7FF', border: '#A5B4FC', text: '#3730A3', soft: '#EEF2FF' },  // 인디고
    { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E', soft: '#FFFBEB' },  // 노랑
  ];
  const colPalette = (c) => COL_PALETTE[dataCols.indexOf(c) % COL_PALETTE.length];

  const tableRows = [];
  for (const r of dataRows) {
    const isHeaderRow = headerRows.has(r);
    const cols = [];

    for (const c of dataCols) {
      const cell = grid[`${r},${c}`];
      const isH = cell && highlightIds.has(cell.id);
      const display = cell ? (cell.vendor_name || cell.stall_number || cell.section_name || '') : '';
      const isHeader = cell?.cell_type === 'section_header' || cell?.cell_type === 'label';
      const isFacility = cell?.cell_type === 'facility';
      const isWalkway = cell?.cell_type === 'walkway';

      const pal = colPalette(c);
      let bg = pal.soft;
      let color = '#0F172A';
      let fontWeight = 600;
      let borderStyle = `1px solid ${pal.border}55`;

      if (isHeader) {
        bg = pal.bg;
        color = pal.text;
        fontWeight = 800;
        borderStyle = `1.5px solid ${pal.border}`;
      } else if (isFacility) {
        bg = '#FEE2E2'; color = '#991B1B'; fontWeight = 700;
        borderStyle = '1.5px solid #FCA5A5';
      } else if (isWalkway) {
        bg = '#F1F5F9'; color = '#64748B';
        borderStyle = '1px dashed #CBD5E1';
      } else if (!cell) {
        bg = '#FAFAFA';
        color = '#CBD5E1';
        borderStyle = '1px dashed #E2E8F0';
      }
      if (isH) { bg = '#FEF3C7'; borderStyle = '2px solid #F59E0B'; }

      cols.push(
        <td
          key={c}
          style={{
            width: minCellW, minWidth: minCellW, maxWidth: minCellW,
            height: isHeader ? 36 : 30,
            background: bg, color, fontWeight,
            fontSize: isHeader ? 12 : 11,
            fontStyle: isWalkway ? 'italic' : 'normal',
            textAlign: 'center', verticalAlign: 'middle',
            padding: '4px 6px', boxSizing: 'border-box',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            cursor: 'pointer',
            border: borderStyle,
            borderRadius: isHeader ? 6 : 0,
            transition: 'background 0.12s',
          }}
          title={display}
          onClick={() => cell ? onCellClick(cell) : onEmptyClick({ row_idx: r, col_idx: c, section_name: null, company_name: null })}
        >
          {display}
        </td>
      );
    }
    tableRows.push(
      <tr key={r}>{cols}</tr>
    );
    // 헤더 행 다음에 4px 간격 추가
    if (isHeaderRow) {
      tableRows.push(
        <tr key={`${r}-gap`}>
          <td colSpan={dataCols.length} style={{ height: 4, padding: 0, border: 'none' }} />
        </tr>
      );
    }
  }

  return (
    <table ref={scrollRef} style={{ borderCollapse: 'separate', borderSpacing: '3px 1px', tableLayout: 'fixed', fontSize: 11 }}>
      <tbody>{tableRows}</tbody>
    </table>
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

function EditModal({ cell, buildingId, currentUser, onClose, onSaved }) {
  const isInsert = !cell.id;
  const [vendorName, setVendorName] = useState(cell.vendor_name || '');
  const [stallNumber, setStallNumber] = useState(cell.stall_number || '');
  const [notes, setNotes] = useState(cell.notes || '');
  const [cellType, setCellType] = useState(cell.cell_type || 'stall');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (isInsert) return;
    supabase
      .from('rn_market_stall_history')
      .select('*, changer:rn_profiles(name)')
      .eq('stall_id', cell.id)
      .order('changed_at', { ascending: false })
      .limit(10)
      .then(({ data }) => data && setHistory(data));
  }, [cell.id, isInsert]);

  const handleSave = async () => {
    setSaving(true);
    if (isInsert) {
      const payload = {
        building_id: buildingId,
        row_idx: cell.row_idx,
        col_idx: cell.col_idx,
        stall_number: stallNumber || null,
        vendor_name: vendorName || null,
        section_name: cell.section_name || null,
        company_name: cell.company_name || null,
        cell_type: cellType,
        notes: notes || null,
      };
      const { data, error } = await supabase
        .from('rn_market_stalls')
        .insert(payload)
        .select()
        .single();
      if (error) { alert('추가 실패: ' + error.message); setSaving(false); return; }
      if (currentUser?.id && !String(currentUser.id).startsWith('preview-')) {
        await supabase.from('rn_market_stall_history').insert({
          stall_id: data.id, changed_by: currentUser.id, change_type: 'create',
          old_data: null, new_data: payload,
        });
      }
      setSaving(false);
      onSaved(data);
      return;
    }

    const oldData = { vendor_name: cell.vendor_name, stall_number: cell.stall_number, notes: cell.notes };
    const newData = { vendor_name: vendorName || null, stall_number: stallNumber || null, notes: notes || null };
    const { error } = await supabase
      .from('rn_market_stalls')
      .update({ ...newData, updated_at: new Date().toISOString() })
      .eq('id', cell.id);
    if (error) { alert('저장 실패: ' + error.message); setSaving(false); return; }

    if (currentUser?.id && !String(currentUser.id).startsWith('preview-')) {
      await supabase.from('rn_market_stall_history').insert({
        stall_id: cell.id, changed_by: currentUser.id, change_type: 'update',
        old_data: oldData, new_data: newData,
      });
    }
    setSaving(false);
    onSaved({ ...cell, ...newData });
  };

  return (
    <div style={editStyles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={editStyles.modal}>
        <div style={editStyles.header}>
          <span style={editStyles.title}>
            {cell.section_name && <span style={editStyles.badge}>{cell.section_name}</span>}
            {cell.company_name && <span style={{ ...editStyles.badge, background: '#EFF6FF', color: '#1D4ED8' }}>{cell.company_name}</span>}
            {isInsert ? '셀 추가' : (cell.cell_type === 'stall' ? '호수 수정' : '상호 수정')}
          </span>
          <button style={editStyles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={editStyles.fields}>
          {isInsert && (
            <>
              <label style={editStyles.label}>셀 유형</label>
              <select
                style={editStyles.input}
                value={cellType}
                onChange={(e) => setCellType(e.target.value)}
              >
                <option value="stall">호수 (stall)</option>
                <option value="vendor">상호 (vendor)</option>
                <option value="facility">시설 (facility)</option>
                <option value="walkway">통로 (walkway)</option>
              </select>
            </>
          )}
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
          {!isInsert && (
            <button style={editStyles.historyBtn} onClick={() => setShowHistory(!showHistory)}>
              <History size={14} />
              수정이력
            </button>
          )}
          <button style={editStyles.saveBtn(saving)} disabled={saving} onClick={handleSave}>
            <Save size={14} />
            {saving ? '저장 중...' : (isInsert ? '추가' : '저장')}
          </button>
        </div>

        {showHistory && !isInsert && (
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
  const [zoom, setZoom] = useState(1);

  const scrollWrapRef = useRef(null);
  const tableRef = useRef(null);

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
  const activeBuildingRow = buildings.find((b) => b.code === activeBuilding);

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

  const companyRanges = useMemo(() => {
    if (activeBuilding !== 'cheonggwamul') return [];
    const maxCol = stalls.reduce((m, s) => Math.max(m, s.col_idx), 0);
    return computeCompanyRanges(stalls, maxCol);
  }, [stalls, activeBuilding]);

  const handleCellClick = (cell) => {
    if (currentUser?.role === 'viewer') return;
    setEditingCell(cell);
  };

  const handleEmptyClick = (payload) => {
    if (currentUser?.role === 'viewer') return;
    setEditingCell(payload);
  };

  const handleSaved = (updatedCell) => {
    setStallsByBuilding((prev) => {
      const list = prev[activeBuilding] || [];
      const exists = list.find((s) => s.id === updatedCell.id);
      const next = exists
        ? list.map((s) => (s.id === updatedCell.id ? updatedCell : s))
        : [...list, updatedCell];
      return { ...prev, [activeBuilding]: next };
    });
    setEditingCell(null);
  };

  const jumpToCompany = (name) => {
    if (!scrollWrapRef.current || !tableRef.current) return;
    const r = companyRanges.find((x) => x.name === name);
    if (!r) return;
    const left = r.start * CELL_W * zoom;
    scrollWrapRef.current.scrollTo({ left: Math.max(0, left - 12), behavior: 'smooth' });
  };

  const zoomIn = () => setZoom((z) => Math.min(1.6, +(z + 0.2).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)));
  const zoomReset = () => setZoom(1);

  if (!isOpen) return null;

  const buildingNames = Object.fromEntries(buildings.map((b) => [b.code, b.name]));

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>반여농산물시장</span>
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
            placeholder="검색..."
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

        {activeBuilding === 'cheonggwamul' && companyRanges.length > 0 && (
          <div style={styles.companyNav}>
            {companyRanges.map((r) => {
              const co = COMPANY_COLORS[r.name] || {};
              return (
                <button
                  key={r.name}
                  style={{
                    ...styles.companyBtn,
                    background: co.bg,
                    color: co.text,
                    borderColor: co.border,
                  }}
                  onClick={() => jumpToCompany(r.name)}
                >
                  {COMPANY_SHORT[r.name] || r.name}
                </button>
              );
            })}
          </div>
        )}

        <div style={styles.gridContainer} ref={scrollWrapRef}>
          {loading && <div style={styles.loading}>데이터 불러오는 중...</div>}
          {!loading && stalls.length === 0 && <EmptyBuilding name={buildingNames[activeBuilding] || activeBuilding} />}
          {!loading && stalls.length > 0 && (
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                transition: 'transform 0.15s ease',
                touchAction: 'pinch-zoom',
                display: 'inline-block',
                padding: '4px',
              }}
            >
              {activeBuilding === 'cheonggwamul' ? (
                <CheonggwamulGrid
                  stalls={stalls}
                  highlightIds={highlightIds}
                  onCellClick={handleCellClick}
                  onEmptyClick={handleEmptyClick}
                  scrollRef={tableRef}
                />
              ) : activeBuilding === 'mubaechu' ? (
                <MubaechuGrid
                  stalls={stalls}
                  highlightIds={highlightIds}
                  onCellClick={handleCellClick}
                  onEmptyClick={handleEmptyClick}
                  scrollRef={tableRef}
                />
              ) : activeBuilding === 'yangnyeom' ? (
                <YangnyeomGrid
                  stalls={stalls}
                  highlightIds={highlightIds}
                  onCellClick={handleCellClick}
                  onEmptyClick={handleEmptyClick}
                  scrollRef={tableRef}
                />
              ) : (
                <GenericGrid
                  stalls={stalls}
                  highlightIds={highlightIds}
                  onCellClick={handleCellClick}
                  onEmptyClick={handleEmptyClick}
                  minCellW={100}
                  scrollRef={tableRef}
                />
              )}
            </div>
          )}
        </div>

        <div style={styles.bottomBar}>
          <div style={styles.zoomGroup}>
            <button style={styles.zoomBtn} onClick={zoomOut} aria-label="zoom out"><ZoomOut size={14} /></button>
            <button style={styles.zoomLabel} onClick={zoomReset}>{Math.round(zoom * 100)}%</button>
            <button style={styles.zoomBtn} onClick={zoomIn} aria-label="zoom in"><ZoomIn size={14} /></button>
          </div>
          {currentUser?.role !== 'viewer' && (
            <span style={styles.hintInline}>
              <Plus size={11} style={{ verticalAlign: '-2px' }} /> 빈 칸 클릭으로 추가 · 셀 클릭으로 수정
            </span>
          )}
        </div>
      </div>

      {editingCell && (
        <EditModal
          cell={editingCell}
          buildingId={activeBuildingRow?.id}
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
    margin: '0 16px 8px', padding: '8px 12px',
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
  companyNav: {
    display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, overflowX: 'auto',
  },
  companyBtn: {
    padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
    border: '1px solid', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },
  gridContainer: {
    flex: 1, overflow: 'auto', padding: '0 8px 8px',
    WebkitOverflowScrolling: 'touch',
  },
  loading: { padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 14 },
  bottomBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 16px 12px', borderTop: '1px solid #F1F5F9', flexShrink: 0,
    gap: 12,
  },
  zoomGroup: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: '#F1F5F9', padding: 3, borderRadius: 10,
  },
  zoomBtn: {
    width: 28, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer',
    background: '#FFFFFF', color: '#475569',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  zoomLabel: {
    minWidth: 44, height: 26, padding: '0 6px', borderRadius: 7, border: 'none',
    background: 'transparent', color: '#475569',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  hintInline: { fontSize: 11, color: '#94A3B8', textAlign: 'right' },
};

const editStyles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 9100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
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
