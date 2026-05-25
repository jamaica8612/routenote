import React, { useEffect, useState, useRef } from 'react';
import { Compass, Locate, LogOut, MapPin, Plus, Users } from 'lucide-react';
import { supabase } from './supabaseClient';
import AuthScreen from './components/AuthScreen';
import BottomSheet from './components/BottomSheet';
import MapContainer from './components/MapContainer';
import PathForm from './components/PathForm';
import RoadviewModal from './components/RoadviewModal';
import SearchBox from './components/SearchBox';
import TipDetail from './components/TipDetail';
import TipForm from './components/TipForm';
import ZoneDetail from './components/ZoneDetail';
import ZoneForm from './components/ZoneForm';
import { isPointInPolygon, findNearbyZone } from './utils/geoUtils';
import { getDbUserId, isDemoUser } from './utils/userUtils';

export default function App() {
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [zones, setZones] = useState([]);
  const [tips, setTips] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);

  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [isDrawingPath, setIsDrawingPath] = useState(false);
  const [drawCoords, setDrawCoords] = useState([]);
  const [drawingZoneId, setDrawingZoneId] = useState(null);
  const [activePathId, setActivePathId] = useState(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetContent, setSheetContent] = useState(null);
  const [selectedTip, setSelectedTip] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [clickLat, setClickLat] = useState(null);
  const [clickLng, setClickLng] = useState(null);
  const [trackLocationTrigger, setTrackLocationTrigger] = useState(0);
  const [activeRoadviewCoords, setActiveRoadviewCoords] = useState(null);
  
  const lastAutoOpenedZoneIdRef = useRef(null);

  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [teamMembers, setTeamMembers] = useState({});
  const presenceChannelRef = useRef(null);
  const myLatLngRef = useRef(null); // 현재 내 위치 저장용

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

  useEffect(() => {
    if (!currentUser) return;

    fetchData();

    // Subscribe to database changes for realtime updates
    const channel = supabase
      .channel('rn_realtime_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rn_route_tips' },
        (payload) => {
          console.log('Realtime change in rn_route_tips:', payload);
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rn_route_zones' },
        (payload) => {
          console.log('Realtime change in rn_route_zones:', payload);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  useEffect(() => {
    return () => {
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
      }
    };
  }, []);

  // Sync open tip details bottom sheet with updates from database
  useEffect(() => {
    if (selectedTip && tips.length > 0) {
      const updatedTip = tips.find(t => t.id === selectedTip.id);
      if (updatedTip) {
        if (
          updatedTip.title !== selectedTip.title ||
          updatedTip.memo !== selectedTip.memo ||
          updatedTip.marker_type !== selectedTip.marker_type ||
          updatedTip.last_verified_at !== selectedTip.last_verified_at ||
          updatedTip.is_deleted !== selectedTip.is_deleted
        ) {
          if (updatedTip.is_deleted) {
            setSelectedTip(null);
            setSheetOpen(false);
          } else {
            setSelectedTip(updatedTip);
          }
        }
      } else {
        setSelectedTip(null);
        setSheetOpen(false);
      }
    }
  }, [tips]);

  // Sync open zone details bottom sheet with updates from database
  useEffect(() => {
    if (selectedZone && zones.length > 0) {
      const updatedZone = zones.find(z => z.id === selectedZone.id);
      if (updatedZone) {
        if (
          updatedZone.name !== selectedZone.name ||
          updatedZone.color !== selectedZone.color ||
          updatedZone.memo !== selectedZone.memo ||
          JSON.stringify(updatedZone.polygon) !== JSON.stringify(selectedZone.polygon)
        ) {
          setSelectedZone(updatedZone);
        }
      } else {
        setSelectedZone(null);
        setSheetOpen(false);
      }
    }
  }, [zones]);

  const fetchUserProfile = async (authUser) => {
    try {
      const { data, error } = await supabase
        .from('rn_profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error) {
        setCurrentUser({
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata.name || authUser.email.split('@')[0],
          role: 'member',
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

  const fetchData = async () => {
    try {
      const { data: zoneData, error: zoneError } = await supabase
        .from('rn_route_zones')
        .select('*')
        .eq('is_deleted', false);
      if (zoneError) throw zoneError;
      setZones(zoneData || []);

      const { data: tipData, error: tipError } = await supabase
        .from('rn_route_tips')
        .select('*')
        .eq('is_deleted', false);
      if (tipError) throw tipError;
      setTips(tipData || []);
    } catch (err) {
      console.error('Error fetching application data:', err);
    }
  };

  const handleDemoLogin = (demoProfile) => {
    setSession({ user: { id: demoProfile.id, email: demoProfile.email } });
    setCurrentUser(demoProfile);
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    if (currentUser.id.startsWith('demo-')) {
      setSession(null);
      setCurrentUser(null);
      return;
    }

    await supabase.auth.signOut();
  };

  const openTipDetail = (tip) => {
    setSelectedTip(tip);
    setSelectedZone(zones.find(zone => zone.id === tip.zone_id) || null);
    setSheetTitle('배송팁 세부 정보');
    setSheetContent('tip-detail');
    setSheetOpen(true);
  };

  const openTipForm = (lat, lng, tip = null) => {
    if (currentUser?.role === 'viewer') {
      alert('둘러보기 모드에서는 배송팁을 등록하거나 수정할 수 없습니다.');
      return;
    }

    setSelectedTip(tip);
    setClickLat(lat);
    setClickLng(lng);
    setSheetTitle(tip ? '배송팁 수정하기' : '새로운 배송팁 등록');
    setSheetContent('tip-form');
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

  const handleMapClick = (lat, lng) => {
    const matchedZone = zones.find(zone => !zone.is_deleted && isPointInPolygon(lat, lng, zone.polygon));

    if (currentUser?.role === 'viewer' && !matchedZone) {
      return;
    }

    setClickLat(lat);
    setClickLng(lng);
    setSelectedTip(null);

    if (currentUser?.role === 'viewer') {
      openZoneDetail(matchedZone, lat, lng);
      return;
    }

    setSheetTitle('팁 보기 / 팁 등록하기');
    setSheetContent('map-click-menu');
    setSheetOpen(true);
  };

  const handleZoneClick = (zone, lat = null, lng = null) => {
    if (!lat || !lng || currentUser?.role === 'viewer') {
      openZoneDetail(zone, lat, lng);
      return;
    }

    setClickLat(lat);
    setClickLng(lng);
    setSelectedTip(null);
    setSelectedZone(zone);
    setSheetTitle('팁 보기 / 팁 등록하기');
    setSheetContent('map-click-menu');
    setSheetOpen(true);
  };

  const handleSelectResult = (item) => {
    setSelectedResult(item);

    if (item.type === 'zone') {
      setSelectedZone(item.data);
      setSelectedTip(null);
      return;
    }

    if (item.type === 'tip') {
      setSelectedTip(item.data);
      setSelectedZone(zones.find(zone => zone.id === item.data.zone_id) || null);
      return;
    }

    if (item.type === 'address') {
      const matchedZone = zones.find(zone =>
        !zone.is_deleted && isPointInPolygon(item.data.lat, item.data.lng, zone.polygon)
      );
      setSelectedZone(matchedZone || null);
      setSelectedTip(null);
      return;
    }

    setSelectedZone(null);
    setSelectedTip(null);
  };

  const handleMoveToCurrentLocation = () => {
    lastAutoOpenedZoneIdRef.current = null; // Clear auto-open block so it forces re-evaluation!
    setTrackLocationTrigger(prev => prev + 1);
  };

  const handleLocationUpdate = (lat, lng) => {
    if (!zones || zones.length === 0) return;

    // Avoid disturbing the user if they are drawing, creating, or editing forms
    if (isDrawingZone || isDrawingPath || sheetContent === 'zone-form' || sheetContent === 'tip-form' || sheetContent === 'path-form') {
      return;
    }

    const nearby = findNearbyZone(lat, lng, zones, 150);

    if (nearby) {
      const zone = nearby.zone;
      if (zone.id !== lastAutoOpenedZoneIdRef.current) {
        lastAutoOpenedZoneIdRef.current = zone.id;
        setSelectedZone(zone);
        setSelectedTip(null);
        
        // Auto display the zone details bottom sheet
        setSheetTitle(zone.name);
        setSheetContent('zone-detail');
        setSheetOpen(true);
      }
    } else {
      // Reset auto-open trigger block once the user walks away from all zones
      lastAutoOpenedZoneIdRef.current = null;
    }

  // 위치 공유 중이면 Presence 업데이트
  myLatLngRef.current = { lat, lng };
  if (isSharingLocation && presenceChannelRef.current) {
    presenceChannelRef.current.track({
      user_id: currentUser?.id,
      name: currentUser?.name || '팀원',
      lat,
      lng,
      updated_at: new Date().toISOString(),
    });
  }
};

  const handleToggleLocationSharing = () => {
    if (isSharingLocation) {
      presenceChannelRef.current?.untrack();
      setIsSharingLocation(false);
      setTeamMembers({});
      return;
    }

    // 새 채널 생성 (없을 때만)
    if (!presenceChannelRef.current) {
      presenceChannelRef.current = supabase.channel('rn_team_presence', {
        config: { presence: { key: currentUser?.id || 'unknown' } },
      });

      presenceChannelRef.current
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannelRef.current.presenceState();
          const members = {};
          Object.entries(state).forEach(([userId, presences]) => {
            if (userId !== currentUser?.id && presences.length > 0) {
              members[userId] = presences[0];
            }
          });
          setTeamMembers(members);
        })
        .on('presence', { event: 'leave' }, ({ key }) => {
          setTeamMembers((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && myLatLngRef.current) {
            await presenceChannelRef.current.track({
              user_id: currentUser?.id,
              name: currentUser?.name || '팀원',
              lat: myLatLngRef.current.lat,
              lng: myLatLngRef.current.lng,
              updated_at: new Date().toISOString(),
            });
          }
        });
    }

    setIsSharingLocation(true);
    // 위치 추적도 자동 시작
    setTrackLocationTrigger((prev) => prev + 1);
  };

  const handleOpenRoadview = (lat, lng) => {
    setActiveRoadviewCoords({ lat, lng });
  };

  const renderSheetContent = () => {
    switch (sheetContent) {
      case 'tip-detail':
        return (
          <TipDetail
            tip={selectedTip}
            currentUser={currentUser}
            onOpenRoadview={handleOpenRoadview}
            onEdit={(tip) => openTipForm(tip.lat, tip.lng, tip)}
            onDelete={async (tipId) => {
              try {
                const { error } = await supabase
                  .from('rn_route_tips')
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
              setTips(prev => prev.map(tip => (
                tip.id === selectedTip.id
                  ? { ...tip, last_verified_at: time, last_verified_by: verifierId }
                  : tip
              )));
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
            onAddTipAtClick={(lat, lng) => openTipForm(lat, lng)}
            onEdit={() => {
              setSheetTitle('구역 정보 수정');
              setSheetContent('zone-form');
            }}
            onDelete={async (zoneId) => {
              try {
                const { error } = await supabase
                  .from('rn_route_zones')
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
              setSheetOpen(false);
            }}
            onSelectPath={(pathId) => {
              if (typeof pathId === 'object' && pathId !== null) {
                setSheetOpen(false);
                handleSelectResult({ type: 'tip', data: pathId });
              } else {
                setActivePathId(pathId);
              }
            }}
            activePathId={activePathId}
            onUpdate={fetchData}
          />
        );
      case 'map-click-menu': {
        const matchedZone = zones.find(zone => !zone.is_deleted && isPointInPolygon(clickLat, clickLng, zone.polygon));

        return (
          <div style={styles.menuContainer}>
            <p style={styles.menuText}>
              선택한 위치: {matchedZone ? `[${matchedZone.name}] 구역 내부` : '구역 바깥 영역'}
            </p>
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
                className={matchedZone ? 'btn btn-secondary' : 'btn btn-primary'}
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
                handleSelectResult({ type: 'zone', data: savedZone });
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

  if (authLoading) {
    return (
      <div style={styles.loaderContainer}>
        <Compass size={48} className="spin-icon" color="var(--primary)" />
        <p style={styles.loaderText}>구역노트 데이터 불러오는 중...</p>
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

  if (!currentUser) {
    return <AuthScreen onDemoLogin={handleDemoLogin} />;
  }

  const visibleZoneIds = new Set([
    selectedResult?.type === 'zone' ? selectedResult.data.id : null,
    selectedZone?.id || null,
    selectedTip?.zone_id || null,
  ].filter(Boolean));

  const visibleTips = visibleZoneIds.size > 0
    ? tips.filter(tip => visibleZoneIds.has(tip.zone_id))
    : [];

  return (
    <div className="app-container">
      {!isDrawingZone && !isDrawingPath && (
        <SearchBox
          onSelectResult={handleSelectResult}
          zones={zones}
          tips={tips}
        />
      )}

      <MapContainer
        zones={zones}
        tips={visibleTips}
        paths={[]}
        selectedResult={selectedResult}
        currentUser={currentUser}
        onMapClick={handleMapClick}
        onMarkerClick={openTipDetail}
        onZoneClick={handleZoneClick}
        onOpenRoadview={handleOpenRoadview}
        isDrawingZone={isDrawingZone}
        setIsDrawingZone={setIsDrawingZone}
        isDrawingPath={isDrawingPath}
        setIsDrawingPath={setIsDrawingPath}
        activePathId={activePathId}
        setActivePathId={setActivePathId}
        drawCoords={drawCoords}
        setDrawCoords={setDrawCoords}
        selectedZone={selectedZone}
        trackLocationTrigger={trackLocationTrigger}
        onLocationUpdate={handleLocationUpdate}
        teamMembers={teamMembers}
        isSharingLocation={isSharingLocation}
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

      {!isDrawingZone && !isDrawingPath && currentUser?.role !== 'viewer' && !isDemoUser(currentUser) && (
        <button
          className="btn btn-icon"
          onClick={handleToggleLocationSharing}
          title={isSharingLocation ? '위치 공유 중 (탭하여 중지)' : '팀원에게 위치 공유'}
          style={{
            position: 'absolute',
            bottom: '40px',
            left: isSharingLocation || currentUser?.role === 'admin' ? '68px' : 'auto',
            right: isSharingLocation || currentUser?.role === 'admin' ? 'auto' : '68px',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            boxShadow: 'var(--shadow-md)',
            zIndex: 850,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isSharingLocation ? 'rgba(16, 185, 129, 0.75)' : 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: isSharingLocation ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
          }}
        >
          <Users size={17} color="#FFFFFF" />
        </button>
      )}

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

      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetTitle}
      >
        {renderSheetContent()}
      </BottomSheet>

      {activeRoadviewCoords && (
        <RoadviewModal
          lat={activeRoadviewCoords.lat}
          lng={activeRoadviewCoords.lng}
          onClose={() => setActiveRoadviewCoords(null)}
        />
      )}
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
  loaderText: {
    marginTop: '16px',
    color: 'var(--text-secondary)',
    fontWeight: '600',
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
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
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
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
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
