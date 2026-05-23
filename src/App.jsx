import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import AuthScreen from './components/AuthScreen';
import MapContainer from './components/MapContainer';
import SearchBox from './components/SearchBox';
import BottomSheet from './components/BottomSheet';
import TipForm from './components/TipForm';
import TipDetail from './components/TipDetail';
import ZoneForm from './components/ZoneForm';
import ZoneDetail from './components/ZoneDetail';
import PathForm from './components/PathForm';
import { Compass, LogOut, Plus, MapPin, Locate } from 'lucide-react';
import { getDbUserId } from './utils/userUtils';
import { isPointInPolygon } from './utils/geoUtils';

export default function App() {
  // Authentication States
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Map Global Data States
  const [zones, setZones] = useState([]);
  const [tips, setTips] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);

  // Drawing States (For Admins)
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [isDrawingPath, setIsDrawingPath] = useState(false);
  const [drawCoords, setDrawCoords] = useState([]);
  const [drawingZoneId, setDrawingZoneId] = useState(null);
  const [activePathId, setActivePathId] = useState(null);

  // Bottom Sheet Control States
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetContent, setSheetContent] = useState(null); // 'tip-detail' | 'tip-form' | 'zone-detail' | 'zone-form' | 'path-form'
  const [selectedTip, setSelectedTip] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [clickLat, setClickLat] = useState(null);
  const [clickLng, setClickLng] = useState(null);

  // Listen to Auth State
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user);
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user);
      } else {
        setCurrentUser(null);
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (authUser) => {
    try {
      const { data, error } = await supabase
        .from('rn_profiles') // [Prefix Update] profiles -> rn_profiles
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error) {
        // Fallback profile if record is still being created by trigger
        setCurrentUser({
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata.name || authUser.email.split('@')[0],
          role: 'member', // default role
        });
      } else {
        setCurrentUser(data);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  // Sync Data when logged in
  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser]);

  const fetchData = async () => {
    try {
      // Fetch Zones
      const { data: zoneData, error: zoneError } = await supabase
        .from('rn_route_zones') // [Prefix Update] route_zones -> rn_route_zones
        .select('*')
        .eq('is_deleted', false);
      if (zoneError) throw zoneError;
      setZones(zoneData || []);

      // Fetch Tips
      const { data: tipData, error: tipError } = await supabase
        .from('rn_route_tips') // [Prefix Update] route_tips -> rn_route_tips
        .select('*')
        .eq('is_deleted', false);
      if (tipError) throw tipError;
      setTips(tipData || []);
    } catch (err) {
      console.error('Error fetching application data:', err);
    }
  };

  // Handle Demo Login Bypass
  const handleDemoLogin = (demoProfile) => {
    setSession({ user: { id: demoProfile.id, email: demoProfile.email } });
    setCurrentUser(demoProfile);
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    if (currentUser.id.startsWith('demo-')) {
      // Bypass Supabase if demo session
      setSession(null);
      setCurrentUser(null);
      return;
    }
    await supabase.auth.signOut();
  };

  // Bottom Sheet content management
  const openTipDetail = (tip) => {
    setSelectedTip(tip);
    setSheetTitle('배송팁 세부 정보');
    setSheetContent('tip-detail');
    setSheetOpen(true);
  };

  const openTipForm = (lat, lng, tip = null) => {
    if (currentUser?.role === 'viewer') {
      alert('둘러보기 모드에서는 배송팁을 등록/수정할 수 없습니다.');
      return;
    }
    setSelectedTip(tip);
    setClickLat(lat);
    setClickLng(lng);
    setSheetTitle(tip ? '배송팁 수정하기' : '새로운 배송팁 등록');
    setSheetContent('tip-form');
    setSheetOpen(true);
  };

  const handleMapClick = (lat, lng) => {
    const matchedZone = zones.find(z => !z.is_deleted && isPointInPolygon(lat, lng, z.polygon));
    
    // If viewer (guest) and not inside any zone, do nothing
    if (currentUser?.role === 'viewer' && !matchedZone) {
      return;
    }

    setClickLat(lat);
    setClickLng(lng);
    setSelectedTip(null);
    
    if (currentUser?.role === 'viewer') {
      // If guest and inside a zone, go straight to zone details
      openZoneDetail(matchedZone, lat, lng);
      return;
    }

    setSheetTitle('팁 보기 / 팁 등록하기');
    setSheetContent('map-click-menu');
    setSheetOpen(true);
  };

  const openZoneDetail = (zone, lat = null, lng = null) => {
    setSelectedZone(zone);
    setClickLat(lat);
    setClickLng(lng);
    setSheetTitle('구역 세부 정보');
    setSheetContent('zone-detail');
    setSheetOpen(true);
  };

  // GPS Current Location Tip Register
  const handleCurrentLocationRegister = () => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 GPS 위치 조회를 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Open Form on GPS coordinates
        openTipForm(latitude, longitude);
      },
      (error) => {
        alert('GPS 위치를 획득할 수 없습니다: ' + error.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Move Map to Current GPS Location
  const handleMoveToCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 GPS 위치 조회를 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setSelectedResult({
          type: 'address',
          data: {
            lat: latitude,
            lng: longitude,
            name: '현재 위치'
          }
        });
      },
      (error) => {
        alert('현재 위치를 가져올 수 없습니다: ' + error.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Render content dynamically inside sliding BottomSheet
  const renderSheetContent = () => {
    switch (sheetContent) {
      case 'tip-detail':
        return (
          <TipDetail
            tip={selectedTip}
            currentUser={currentUser}
            onEdit={(t) => openTipForm(t.lat, t.lng, t)}
            onDelete={async (tipId) => {
              try {
                const { error } = await supabase
                  .from('rn_route_tips') // [Prefix Update] route_tips -> rn_route_tips
                  .update({ is_deleted: true, updated_by: getDbUserId(currentUser) })
                  .eq('id', tipId);
                if (error) throw error;
                fetchData();
                setSheetOpen(false);
              } catch (err) {
                alert('팁 삭제 실패: ' + err.message);
              }
            }}
            onVerified={(time, verifierId) => {
              // Update local state without fetching again to prevent map flicker
              setTips(prev => prev.map(t => t.id === selectedTip.id ? { ...t, last_verified_at: time, last_verified_by: verifierId } : t));
              setSelectedTip(prev => ({ ...prev, last_verified_at: time, last_verified_by: verifierId }));
            }}
          />
        );
      case 'tip-form':
        return (
          <TipForm
            tip={selectedTip}
            lat={clickLat}
            lng={clickLng}
            zones={zones}
            currentUser={currentUser}
            onSave={() => {
              fetchData();
              setSheetOpen(false);
            }}
            onCancel={() => setSheetOpen(false)}
          />
        );
      case 'zone-detail':
        return (
          <ZoneDetail
            zone={selectedZone}
            currentUser={currentUser}
            tips={tips}
            clickLat={clickLat}
            clickLng={clickLng}
            onAddTipAtClick={(lat, lng) => {
              openTipForm(lat, lng);
            }}
            onEdit={(z) => {
              setSheetTitle('구역 정보 수정');
              setSheetContent('zone-form');
            }}
            onDelete={async (zoneId) => {
              try {
                const { error } = await supabase
                  .from('rn_route_zones') // [Prefix Update] route_zones -> rn_route_zones
                  .update({ is_deleted: true, updated_by: getDbUserId(currentUser) })
                  .eq('id', zoneId);
                if (error) throw error;
                fetchData();
                setSheetOpen(false);
              } catch (err) {
                alert('구역 삭제 실패: ' + err.message);
              }
            }}
            onStartDrawPath={(zoneId) => {
              setDrawingZoneId(zoneId);
              setIsDrawingPath(true);
              setDrawCoords([]);
              setSheetOpen(false); // Close Bottom Sheet so admin can draw on map
            }}
            onSelectPath={(pathId) => {
              if (typeof pathId === 'object' && pathId !== null) {
                // If clicked a tip link within zone list
                setSheetOpen(false);
                setSelectedResult({ type: 'tip', data: pathId });
              } else {
                setActivePathId(pathId);
              }
            }}
            activePathId={activePathId}
            onUpdate={fetchData}
          />
        );
      case 'map-click-menu': {
        const matchedZone = zones.find(z => !z.is_deleted && isPointInPolygon(clickLat, clickLng, z.polygon));
        return (
          <div style={styles.menuContainer}>
            <p style={styles.menuText}>선택한 위치: {matchedZone ? `[${matchedZone.name}] 구역 내부` : '구역 바깥 영역'}</p>
            <div style={styles.menuButtons}>
              {matchedZone && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={styles.menuBtn}
                  onClick={() => openZoneDetail(matchedZone, clickLat, clickLng)}
                >
                  <MapPin size={18} />
                  <span>팁 보기</span>
                </button>
              )}

              <button
                type="button"
                className={matchedZone ? "btn btn-secondary" : "btn btn-primary"}
                style={styles.menuBtn}
                onClick={() => {
                  setSheetTitle('새로운 배송팁 등록');
                  setSheetContent('tip-form');
                }}
              >
                <Plus size={18} />
                <span>팁 등록하기</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ ...styles.menuBtn, color: 'var(--text-muted)' }}
                onClick={() => setSheetOpen(false)}
              >
                <span>취소</span>
              </button>
            </div>
          </div>
        );
      }
      case 'zone-form':
        return (
          <ZoneForm
            zone={selectedZone}
            polygonCoords={drawCoords}
            currentUser={currentUser}
            onSave={(savedZone) => {
              fetchData();
              if (savedZone) {
                setSelectedResult({ type: 'zone', data: savedZone });
                setSelectedZone(savedZone);
              }
              setSheetOpen(false);
              setIsDrawingZone(false);
              setDrawCoords([]);
            }}
            onCancel={() => {
              setSheetOpen(false);
              setIsDrawingZone(false);
              setDrawCoords([]);
            }}
            onStartDrawing={() => {
              setSheetOpen(false);
              setDrawCoords([[]]);
              setIsDrawingZone(true);
            }}
          />
        );
      case 'path-form':
        return (
          <PathForm
            path={null}
            pathPoints={drawCoords[0] || []}
            zoneId={drawingZoneId}
            currentUser={currentUser}
            onSave={() => {
              fetchData();
              setSheetOpen(false);
              setIsDrawingPath(false);
              setDrawCoords([]);
            }}
            onCancel={() => {
              setSheetOpen(false);
              setIsDrawingPath(false);
              setDrawCoords([]);
            }}
          />
        );
      default:
        return null;
    }
  };

  // Rendering Loader screen
  if (authLoading) {
    return (
      <div style={styles.loaderContainer}>
        <Compass size={48} className="spin-icon" color="var(--primary)" />
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)', fontWeight: '600' }}>구역노트 데이터 불러오는 중...</p>
        <style>{`
          .spin-icon {
            animation: spin 2s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Display Login screen if unauthorized
  if (!currentUser) {
    return <AuthScreen onDemoLogin={handleDemoLogin} />;
  }

  // Filter tips to display: only show tips of the active zone when bottom sheet is open
  const activeZoneId = sheetOpen ? (selectedZone?.id || selectedTip?.zone_id) : null;
  const filteredTips = activeZoneId ? tips.filter(t => t.zone_id === activeZoneId) : [];

  return (
    <div className="app-container">
      {/* 1. UPPER FIXED SEARCH BOX */}
      {!isDrawingZone && !isDrawingPath && (
        <SearchBox
          onSelectResult={(item) => setSelectedResult(item)}
          zones={zones}
          tips={tips}
        />
      )}

      {/* 2. BACKGROUND MAP DISPLAY */}
      <MapContainer
        zones={zones}
        tips={filteredTips}
        paths={[]} // not needed dynamically
        selectedResult={selectedResult}
        currentUser={currentUser}
        onMapClick={handleMapClick}
        onMarkerClick={openTipDetail}
        onZoneClick={openZoneDetail}
        isDrawingZone={isDrawingZone}
        setIsDrawingZone={setIsDrawingZone}
        isDrawingPath={isDrawingPath}
        setIsDrawingPath={setIsDrawingPath}
        activePathId={activePathId}
        setActivePathId={setActivePathId}
        drawCoords={drawCoords}
        setDrawCoords={setDrawCoords}
        selectedZone={selectedZone} // [New Prop] Pass currently open zone detail
        onCreateZone={() => {
          setSelectedZone(null);
          setDrawCoords([]);
          setSheetTitle('배송구역 만들기');
          setSheetContent('zone-form');
          setSheetOpen(true);
        }}
        onFinishDrawingZone={() => {
          setSelectedZone(null);
          setSheetTitle('새 배송구역 등록');
          setSheetContent('zone-form');
          setSheetOpen(true);
        }}
        onFinishDrawingPath={() => {
          setSheetTitle('새 배송동선 저장');
          setSheetContent('path-form');
          setSheetOpen(true);
        }}
      />

      {/* 3. UPPER LOGOUT UTILITY */}
      {!isDrawingZone && !isDrawingPath && (
        <button
          className="btn btn-icon"
          onClick={handleLogout}
          title="로그아웃"
          style={styles.headerLogoutBtn}
        >
          <LogOut size={18} color="#FFFFFF" />
        </button>
      )}

      {/* 3.5. FLOATING COMPASS BUTTON */}
      {!isDrawingZone && !isDrawingPath && (
        <button
          className="btn btn-icon"
          onClick={handleMoveToCurrentLocation}
          title="현재 위치로 지도 이동"
          style={styles.floatingCompassBtn(currentUser?.role === 'admin')}
        >
          <Locate size={18} color="#FFFFFF" />
        </button>
      )}

      {/* 4. MODAL SLIDE BOTTOM SHEET */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetTitle}
      >
        {renderSheetContent()}
      </BottomSheet>
    </div>
  );
}

const styles = {
  loaderContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    backgroundColor: '#0B0F19',
  },
  headerLogoutBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    width: '54px',
    height: '54px',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-md)',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)', // Black semi-transparent
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    cursor: 'pointer',
  },
  floatingCompassBtn: (isAdmin) => ({
    position: 'absolute',
    bottom: '40px',
    left: isAdmin ? '16px' : 'auto',
    right: isAdmin ? 'auto' : '16px',
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    boxShadow: 'var(--shadow-md)',
    zIndex: 850,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)', // More transparent (0.45)
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    cursor: 'pointer',
  }),
  menuContainer: {
    padding: '16px 8px 8px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    alignItems: 'center',
    textAlign: 'center',
  },
  menuText: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  menuButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
  },
  menuBtn: {
    width: '100%',
    padding: '14px 20px',
    minHeight: '48px',
    fontSize: '15px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
};
