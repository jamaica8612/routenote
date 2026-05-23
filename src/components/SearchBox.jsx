import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Search, MapPin, Map, Landmark, X } from 'lucide-react';

export default function SearchBox({ onSelectResult, zones, tips }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef(null);

  // Close search results when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async (val) => {
    setQuery(val);
    if (!val.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    setIsOpen(true);

    try {
      const searchResults = [];
      const lowerVal = val.toLowerCase().trim();

      // 1. Search Local Zones (Priority 1)
      const matchedZones = zones
        .filter(z => !z.is_deleted && z.name.toLowerCase().includes(lowerVal))
        .map(z => ({
          type: 'zone',
          id: z.id,
          title: z.name,
          subtitle: z.memo || '배송 구역',
          icon: <Map size={16} color="#6366F1" />,
          data: z,
        }));
      searchResults.push(...matchedZones);

      // 2. Search Local Tips (Priority 2)
      const matchedTips = tips
        .filter(t => {
          if (t.is_deleted) return false;
          const matchesTitle = t.title.toLowerCase().includes(lowerVal);
          const matchesMemo = t.memo && t.memo.toLowerCase().includes(lowerVal);
          const matchesTags = t.tags && t.tags.some(tag => tag.toLowerCase().includes(lowerVal));
          return matchesTitle || matchesMemo || matchesTags;
        })
        .map(t => ({
          type: 'tip',
          id: t.id,
          title: t.title,
          subtitle: `${t.marker_type} | ${t.memo || ''}`,
          icon: <MapPin size={16} color="#10B981" />,
          data: t,
        }));
      searchResults.push(...matchedTips);

      // 3. Search Naver Geocoding Proxy via Supabase Edge Function (Priority 3)
      if (val.length >= 2) {
        // [Name Update] geocode -> rn-geocode to avoid naming collisions in shared project
        const { data, error } = await supabase.functions.invoke('rn-geocode', {
          method: 'GET',
          queryParams: { query: val },
        });

        if (!error && data && data.addresses) {
          const matchedAddresses = data.addresses.map((addr, idx) => ({
            type: 'address',
            id: `address-${idx}`,
            title: addr.roadAddress || addr.jibunAddress,
            subtitle: addr.englishAddress || '도로명 주소',
            icon: <Landmark size={16} color="#F59E0B" />,
            data: {
              lat: parseFloat(addr.y),
              lng: parseFloat(addr.x),
              name: addr.roadAddress,
            },
          }));
          searchResults.push(...matchedAddresses);
        }
      }

      setResults(searchResults);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (item) => {
    onSelectResult(item);
    setQuery(item.title);
    setIsOpen(false);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div style={styles.container} ref={searchRef}>
      <div className="glass" style={styles.searchBar}>
        <Search size={20} color="var(--text-secondary)" style={styles.searchIcon} />
        <input
          type="text"
          style={styles.searchInput}
          placeholder="구역, 팁(엘베/비번), 주소 검색..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query.trim() && setIsOpen(true)}
        />
        {query && (
          <button style={styles.clearBtn} onClick={clearSearch}>
            <X size={16} color="var(--text-secondary)" />
          </button>
        )}
      </div>

      {isOpen && (results.length > 0 || loading) && (
        <div className="glass" style={styles.dropdown}>
          {loading && <div style={styles.loadingItem}>검색 중...</div>}
          
          {!loading && results.length === 0 && (
            <div style={styles.noResultItem}>검색 결과가 없습니다.</div>
          )}

          {!loading && results.map(item => (
            <button
              key={item.id}
              style={styles.resultItem}
              onClick={() => handleSelect(item)}
            >
              <div style={styles.resultIconWrapper}>
                {item.icon}
              </div>
              <div style={styles.resultTextContainer}>
                <div style={styles.resultTitle}>{item.title}</div>
                <div style={styles.resultSubtitle}>{item.subtitle}</div>
              </div>
            </button>
          ))}
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
    right: '16px',
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
    maxHeight: '300px',
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
    transition: 'background-color var(--transition-fast)',
  },
  resultItemHover: {
    backgroundColor: 'var(--bg-card-hover)',
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
    marginTop: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
