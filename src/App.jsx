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
import { Compass, LogOut, Plus, MapPin } from 'lucide-react';
import { getDbUserId } from './utils/userUtils';

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
    setSelectedTip(tip);
    setClickLat(lat);
    setClickLng(lng);
    setSheetTitle(tip ? '배송팁 수정하기' : '새로운 배송팁 등록');
    setSheetContent('tip-form');
    setSheetOpen(true);
  };

  const openZoneDetail = (zone) => {
    setSelectedZone(zone);
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
          />
        );
      case 'zone-form':
        return (
          <ZoneForm
            zone={selectedZone}
            polygonCoords={drawCoords}
            currentUser={currentUser}
            onSave={() => {
              fetchData();
              setSheetOpen(false);
              setIsDrawingZone(false);
              setDrawCoords([]);
            }}
            onCancel={() => {
              setSheetOpen(false);
              setIsDrawingZone(false);
              setDrawCoords([]);
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
        tips={tips}
        paths={[]} // not needed dynamically
        selectedResult={selectedResult}
        currentUser={currentUser}
        onMapClick={openTipForm}
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

      {/* 3. LOGOUT & CURRENT LOCATION TRIGGER FLOATS */}
      {!isDrawingZone && !isDrawingPath && (
        <div style={styles.floatingUI}>
          {/* Logout Button */}
          <button
            className="btn btn-secondary btn-icon"
            onClick={handleLogout}
            title="로그아웃"
            style={styles.circleFloatBtn}
          >
            <LogOut size={18} />
          </button>
          
          {/* GPS Current Location Tip Register */}
          <button
            className="btn btn-primary btn-icon"
            onClick={handleCurrentLocationRegister}
            title="현재 위치 기준 팁 등록"
            style={{ ...styles.circleFloatBtn, backgroundColor: 'var(--success)', color: '#FFFFFF' }}
          >
            <MapPin size={20} />
          </button>
        </div>
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
  floatingUI: {
    position: 'absolute',
    bottom: '24px',
    left: '16px',
    zIndex: 850,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  circleFloatBtn: {
    borderRadius: '50%',
    width: '52px',
    height: '52px',
    boxShadow: 'var(--shadow-md)',
  },
};
