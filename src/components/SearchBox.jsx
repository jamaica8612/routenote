import React, { useEffect, useRef, useState } from 'react';
import { Landmark, Map, MapPin, Search, X } from 'lucide-react';

const MARKER_TYPE_LABELS = {
  vehicle_entrance: '차량 진입구',
  parking: '정차/주차',
  entrance: '출입구/공동현관',
  elevator: '엘리베이터',
  delivery_spot: '배송 위치',
  warning: '주의',
  access_code: '비번/호출',
  important: '중요',
};

const RESULT_META = {
  zone: { label: '구역', color: '#6366F1', icon: <Map size={16} color="#6366F1" /> },
  tip: { label: '팁', color: '#10B981', icon: <MapPin size={16} color="#10B981" /> },
  address: { label: '주소', color: '#F59E0B', icon: <Landmark size={16} color="#F59E0B" /> },
};

export default function SearchBox({ onSelectResult, zones, tips }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      setSearchError('');
      setIsOpen(false);
      setLoading(false);
      return;
    }

    setIsOpen(true);
    setLoading(true);
    setSearchError('');

    const timeoutId = window.setTimeout(async () => {
      const lowerQuery = trimmedQuery.toLowerCase();

      try {
        const matchedZones = zones
          .filter((zone) => {
            if (zone.is_deleted) return false;
            const matchesName = zone.name?.toLowerCase().includes(lowerQuery);
            const matchesSubLabel = zone.polygon?.subLabels?.some((label) =>
              label.toLowerCase().includes(lowerQuery)
            );
            return matchesName || matchesSubLabel;
          })
          .map((zone) => ({
            type: 'zone',
            id: zone.id,
            title: zone.name,
            subtitle: zone.polygon?.subLabels?.length
              ? `${zone.polygon.subLabels.join(', ')} | ${zone.memo || '배송 구역'}`
              : zone.memo || '배송 구역',
            data: zone,
          }));

        const matchedTips = tips
          .filter((tip) => {
            if (tip.is_deleted) return false;
            const matchesTitle = tip.title?.toLowerCase().includes(lowerQuery);
            const matchesMemo = tip.memo?.toLowerCase().includes(lowerQuery);
            const matchesTags = tip.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery));
            return matchesTitle || matchesMemo || matchesTags;
          })
          .map((tip) => {
            const zone = zones.find((z) => z.id === tip.zone_id);
            const zonePrefix = zone ? `[${zone.name}] ` : '';
            const typeLabel = MARKER_TYPE_LABELS[tip.marker_type] || tip.marker_type || '배송 팁';

            return {
              type: 'tip',
              id: tip.id,
              title: tip.title,
              subtitle: `${zonePrefix}${typeLabel}${tip.memo ? ` | ${tip.memo}` : ''}`,
              data: tip,
            };
          });

        const nextResults = [...matchedZones, ...matchedTips];
        let nextSearchError = '';

        if (trimmedQuery.length >= 2) {
          const geocodeResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rn-geocode?query=${encodeURIComponent(trimmedQuery)}`,
            {
              method: 'GET',
              headers: {
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
            }
          );
          const data = await geocodeResponse.json();

          if (!geocodeResponse.ok) {
            nextSearchError = '주소 검색 API 설정을 확인해주세요.';
          } else if (data?.error) {
            nextSearchError = data.error.message || data.error || '주소 검색에 실패했습니다.';
          } else if (data?.addresses?.length) {
            const matchedAddresses = data.addresses.map((address, index) => ({
              type: 'address',
              id: `address-${index}`,
              title: address.roadAddress || address.jibunAddress,
              subtitle: address.jibunAddress || address.englishAddress || '도로명 주소',
              data: {
                lat: parseFloat(address.y),
                lng: parseFloat(address.x),
                name: address.roadAddress || address.jibunAddress,
              },
            }));

            nextResults.push(...matchedAddresses);
          }
        }

        setResults(nextResults);
        setSearchError(nextSearchError);
      } catch (err) {
        console.error('Search error:', err);
        setSearchError('검색 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [query, zones, tips]);

  const handleSelect = (item) => {
    onSelectResult(item);
    setQuery(item.title);
    setIsOpen(false);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearchError('');
    setIsOpen(false);
  };

  return (
    <div style={styles.container} ref={searchRef}>
      <div className="glass" style={styles.searchBar}>
        <Search size={20} color="var(--text-secondary)" style={styles.searchIcon} />
        <input
          type="text"
          style={styles.searchInput}
          placeholder="구역, 팁, 주소 검색..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => query.trim() && setIsOpen(true)}
        />
        {query && (
          <button style={styles.clearBtn} onClick={clearSearch} title="검색어 지우기">
            <X size={16} color="var(--text-secondary)" />
          </button>
        )}
      </div>

      {isOpen && (query.trim() || results.length > 0 || loading || searchError) && (
        <div className="glass" style={styles.dropdown}>
          {loading && <div style={styles.loadingItem}>검색 중...</div>}

          {!loading && searchError && <div style={styles.errorItem}>{searchError}</div>}

          {!loading && results.length === 0 && !searchError && (
            <div style={styles.noResultItem}>검색 결과가 없습니다.</div>
          )}

          {!loading &&
            results.map((item) => {
              const meta = RESULT_META[item.type] || RESULT_META.tip;

              return (
                <button
                  key={`${item.type}-${item.id}`}
                  style={styles.resultItem}
                  onClick={() => handleSelect(item)}
                >
                  <div style={styles.resultIconWrapper}>{meta.icon}</div>
                  <div style={styles.resultTextContainer}>
                    <div style={styles.resultTitleRow}>
                      <span style={{ ...styles.resultBadge, borderColor: meta.color, color: meta.color }}>
                        {meta.label}
                      </span>
                      <span style={styles.resultTitle}>{item.title}</span>
                    </div>
                    <div style={styles.resultSubtitle}>{item.subtitle}</div>
                  </div>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    right: '136px',
    zIndex: 900,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: '54px',
    borderRadius: 'var(--radius-md)',
    padding: '0 16px',
    border: '1px solid var(--bg-card-border)',
    boxShadow: 'var(--shadow-md)',
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '16px',
    marginLeft: '12px',
    outline: 'none',
    minWidth: 0,
  },
  clearBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'var(--bg-input)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  dropdown: {
    width: '100%',
    maxHeight: '320px',
    overflowY: 'auto',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--bg-card-border)',
    boxShadow: 'var(--shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
  },
  loadingItem: {
    padding: '16px',
    fontSize: '14px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
  },
  noResultItem: {
    padding: '16px',
    fontSize: '14px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
  },
  errorItem: {
    padding: '12px 16px',
    fontSize: '13px',
    color: 'var(--danger)',
    borderBottom: '1px solid var(--bg-card-border)',
    lineHeight: '1.4',
  },
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    border: 'none',
    borderBottom: '1px solid var(--bg-card-border)',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
  },
  resultIconWrapper: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-input)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '12px',
    flexShrink: 0,
  },
  resultTextContainer: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
  resultTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  resultBadge: {
    flexShrink: 0,
    padding: '2px 6px',
    border: '1px solid',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: 1.2,
  },
  resultTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  resultSubtitle: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
