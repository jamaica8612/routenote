import React, { useEffect, useState, useRef } from 'react';
import { Bell, CheckCircle2, Compass, Globe2, Locate, LogOut, MapPin, Plus, Users } from 'lucide-react';
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
import { isPointInPolygon } from './utils/geoUtils';
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
  

  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [locationShareTarget, setLocationShareTarget] = useState(null);
  const [locationShareMembers, setLocationShareMembers] = useState([]);
  const [loadingShareMembers, setLoadingShareMembers] = useState(false);
  const [teamMembers, setTeamMembers] = useState({});
  const presenceChannelRef = useRef(null);
  const myLatLngRef = useRef(null);

  // 알림 상태
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(session);
        if (session) {
          fetchUserProfile(session.user);
        } else {
          setAuthLoading(false);
        }
      } catch (err) {
        console.warn('Failed to restore Supabase session:', err);
        if (!mounted) return;
        setSession(null);
        setCurrentUser(null);
        setAuthLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user);
      } else {
        setCurrentUser(null);
        setAuthLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
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

  // 알림 구독
  useEffect(() => {
    if (!currentUser || isDemoUser(currentUser)) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('rn_notifications')
        .select('*')
        .eq('recipient_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(30);
      setNotifications(data || []);
      setUnreadCount((data || []).filter((n) => !n.is_read).length);
    };
    fetchNotifications();

    const notiChannel = supabase
      .channel(`rn_noti_${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rn_notifications', filter: `recipient_id=eq.${currentUser.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(notiChannel);
  }, [currentUser]);

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

  const handleOpenNotifications = async () => {
    setSheetTitle('알림');
    setSheetContent('notifications');
    setSheetOpen(true);
    // 읽음 처리
    if (unreadCount > 0 && currentUser && !isDemoUser(currentUser)) {
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await supabase
        .from('rn_notifications')
        .update({ is_read: true })
        .eq('recipient_id', currentUser.id)
        .eq('is_read', false);
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
    setTrackLocationTrigger(prev => prev + 1);
  };

  const trackSharedLocation = async (lat, lng, targetId = locationShareTarget) => {
    if (!presenceChannelRef.current) return;
    await presenceChannelRef.current.track({
      user_id: currentUser?.id,
      name: currentUser?.name || 'Member',
      target_id: targetId,
      lat,
      lng,
      updated_at: new Date().toISOString(),
    });
  };

  const handleLocationUpdate = (lat, lng) => {
    myLatLngRef.current = { lat, lng };
    if (isSharingLocation) {
      trackSharedLocation(lat, lng);
    }
  };

  const ensurePresenceChannel = () => {
    if (presenceChannelRef.current) return;

    presenceChannelRef.current = supabase.channel('rn_team_presence', {
      config: { presence: { key: currentUser?.id || 'unknown' } },
    });

    presenceChannelRef.current
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannelRef.current.presenceState();
        const members = {};
        Object.entries(state).forEach(([userId, presences]) => {
          const presence = presences[0];
          if (
            userId !== currentUser?.id
            && presence
            && (!presence.target_id || presence.target_id === currentUser?.id)
          ) {
            members[userId] = presence;
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
        if (status === 'SUBSCRIBED' && myLatLngRef.current && isSharingLocation) {
          await trackSharedLocation(myLatLngRef.current.lat, myLatLngRef.current.lng);
        }
      });
  };

  const stopLocationSharing = () => {
    presenceChannelRef.current?.untrack();
    setIsSharingLocation(false);
    setLocationShareTarget(null);
    setSheetOpen(false);
  };

  const startLocationSharing = async (targetId = null) => {
    setLocationShareTarget(targetId);
    ensurePresenceChannel();
    if (myLatLngRef.current) {
      await trackSharedLocation(myLatLngRef.current.lat, myLatLngRef.current.lng, targetId);
    }
    setIsSharingLocation(true);
    setTrackLocationTrigger((prev) => prev + 1);
    setSheetOpen(false);
  };

  const fetchLocationShareMembers = async () => {
    if (!currentUser) return;
    setLoadingShareMembers(true);
    try {
      const { data, error } = await supabase
        .from('rn_profiles')
        .select('id, name, role')
        .neq('id', currentUser.id)
        .order('name');
      if (error) throw error;
      setLocationShareMembers(data || []);
    } catch (err) {
      console.error('Failed to load share targets:', err);
      setLocationShareMembers([]);
    } finally {
      setLoadingShareMembers(false);
    }
  };

  const handleOpenLocationSharing = () => {
    fetchLocationShareMembers();
    setSheetTitle('위치 공유');
    setSheetContent('location-share');
    setSheetOpen(true);
  };

  useEffect(() => {
    if (!currentUser || isDemoUser(currentUser)) return;
    ensurePresenceChannel();
  }, [currentUser?.id]);

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
      case 'location-share': {
        const activeTargetName = locationShareTarget
          ? locationShareMembers.find(member => member.id === locationShareTarget)?.name || '선택한 팀원'
          : '전체 팀원';

        return (
          <div style={stylesShare.container}>
            <div style={stylesShare.statusCard}>
              <div style={stylesShare.statusIcon(isSharingLocation)}>
                {isSharingLocation ? <CheckCircle2 size={18} /> : <Users size={18} />}
              </div>
              <div style={stylesShare.statusText}>
                <strong>{isSharingLocation ? '공유 중' : '공유 대기'}</strong>
                <span>{isSharingLocation ? `${activeTargetName}에게 내 위치를 보여주는 중입니다.` : '공유할 대상을 선택하세요.'}</span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              style={stylesShare.targetBtn(!locationShareTarget)}
              onClick={() => startLocationSharing(null)}
            >
              <Globe2 size={18} />
              <span>전체 팀원에게 공유</span>
              {!locationShareTarget && isSharingLocation && <CheckCircle2 size={16} color="var(--success)" />}
            </button>

            <div style={stylesShare.memberList}>
              {loadingShareMembers && <p style={stylesShare.emptyText}>팀원 목록을 불러오는 중...</p>}
              {!loadingShareMembers && locationShareMembers.length === 0 && (
                <p style={stylesShare.emptyText}>공유할 팀원이 없습니다.</p>
              )}
              {!loadingShareMembers && locationShareMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="btn btn-secondary"
                  style={stylesShare.targetBtn(locationShareTarget === member.id)}
                  onClick={() => startLocationSharing(member.id)}
                >
                  <span style={stylesShare.avatar}>{(member.name || '팀').charAt(0)}</span>
                  <span style={stylesShare.memberName}>{member.name || '이름 없음'}</span>
                  <span style={stylesShare.memberRole}>{member.role || 'member'}</span>
                  {locationShareTarget === member.id && isSharingLocation && <CheckCircle2 size={16} color="var(--success)" />}
                </button>
              ))}
            </div>

            {isSharingLocation && (
              <button
                type="button"
                className="btn btn-danger"
                style={stylesShare.stopBtn}
                onClick={stopLocationSharing}
              >
                위치 공유 중지
              </button>
            )}
          </div>
        );
      }
      case 'notifications':
        return (
          <div style={stylesNoti.container}>
            {notifications.length === 0 && (
              <p style={stylesNoti.empty}>아직 알림이 없습니다 🔕</p>
            )}
            {notifications.map((noti) => (
              <div key={noti.id} style={{ ...stylesNoti.item, ...(noti.is_read ? {} : stylesNoti.itemUnread) }}>
                <div style={stylesNoti.icon}>💬</div>
                <div style={stylesNoti.body}>
                  <p style={stylesNoti.message}>{noti.message}</p>
                  <span style={stylesNoti.time}>
                    {(() => {
                      const d = new Date(noti.created_at);
                      const diff = Math.floor((Date.now() - d) / 60000);
                      if (diff < 1) return '방금 전';
                      if (diff < 60) return `${diff}분 전`;
                      if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
                      return `${Math.floor(diff / 1440)}일 전`;
                    })()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  const stylesNoti = {
    container: { display: 'flex', flexDirection: 'column', gap: '2px', paddingBottom: '8px' },
    empty: { textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)', padding: '32px 0' },
    item: {
      display: 'flex', alignItems: 'flex-start', gap: '12px',
      padding: '14px 16px', borderRadius: 'var(--radius-md)',
      backgroundColor: 'transparent', transition: 'background 0.1s',
    },
    itemUnread: { backgroundColor: 'rgba(99,102,241,0.07)', borderLeft: '3px solid var(--primary)' },
    icon: { fontSize: '20px', flexShrink: 0, marginTop: '1px' },
    body: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 },
    message: { fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.45', margin: 0 },
    time: { fontSize: '11px', color: 'var(--text-muted)' },
  };

  const stylesShare = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      paddingBottom: '8px',
    },
    statusCard: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '14px',
      borderRadius: '14px',
      backgroundColor: 'rgba(99, 102, 241, 0.08)',
      border: '1px solid rgba(99, 102, 241, 0.18)',
    },
    statusIcon: (active) => ({
      width: '36px',
      height: '36px',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#FFFFFF',
      background: active
        ? 'linear-gradient(135deg, #10B981, #059669)'
        : 'linear-gradient(135deg, #6366F1, #4F46E5)',
      flexShrink: 0,
    }),
    statusText: {
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      fontSize: '13px',
      color: 'var(--text-secondary)',
    },
    targetBtn: (active) => ({
      width: '100%',
      minHeight: '48px',
      justifyContent: 'flex-start',
      gap: '10px',
      padding: '12px 14px',
      borderRadius: '14px',
      backgroundColor: active ? 'rgba(16, 185, 129, 0.10)' : 'var(--bg-input)',
      border: active ? '1px solid rgba(16, 185, 129, 0.36)' : '1px solid var(--bg-card-border)',
      color: 'var(--text-primary)',
    }),
    memberList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
    avatar: {
      width: '28px',
      height: '28px',
      borderRadius: '10px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(99, 102, 241, 0.16)',
      color: 'var(--primary)',
      fontSize: '13px',
      fontWeight: 800,
      flexShrink: 0,
    },
    memberName: {
      flex: 1,
      textAlign: 'left',
      fontSize: '14px',
      fontWeight: 700,
    },
    memberRole: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
    },
    emptyText: {
      padding: '16px 4px',
      textAlign: 'center',
      fontSize: '13px',
      color: 'var(--text-muted)',
    },
    stopBtn: {
      marginTop: '4px',
      width: '100%',
      borderRadius: '14px',
      minHeight: '46px',
    },
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
          className="btn btn-icon map-action-btn"
          onClick={handleLogout}
          aria-label="로그아웃"
          title="로그아웃"
          style={styles.headerLogoutBtn}
        >
          <LogOut size={19} color="#FFFFFF" strokeWidth={2.2} />
        </button>
      )}

      {!isDrawingZone && !isDrawingPath && !isDemoUser(currentUser) && (
        <button
          className="btn btn-icon map-action-btn"
          onClick={handleOpenNotifications}
          aria-label={`알림${unreadCount > 0 ? ` ${unreadCount}개` : ''}`}
          title="알림"
          style={styles.bellBtn}
        >
          <Bell size={19} color="#FFFFFF" strokeWidth={2.2} />
          {unreadCount > 0 && (
            <span style={styles.bellBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>
      )}

      {!isDrawingZone && !isDrawingPath && currentUser?.role !== 'viewer' && !isDemoUser(currentUser) && (
        <button
          className="btn btn-icon map-action-btn"
          onClick={handleOpenLocationSharing}
          aria-label={isSharingLocation ? '위치 공유 중지' : '팀원에게 위치 공유'}
          title={isSharingLocation ? '위치 공유 설정' : '팀원에게 위치 공유'}
          style={styles.locationShareBtn(isSharingLocation, currentUser?.role === 'admin')}
        >
          <Users size={18} color="#FFFFFF" strokeWidth={2.2} />
          {isSharingLocation && <span style={styles.liveDot} />}
        </button>
      )}

      {!isDrawingZone && !isDrawingPath && (
        <button
          className="btn btn-icon map-action-btn"
          onClick={handleMoveToCurrentLocation}
          aria-label="현재 위치로 지도 이동"
          title="현재 위치로 지도 이동"
          style={styles.floatingCompassBtn(currentUser?.role === 'admin')}
        >
          <Locate size={19} color="#FFFFFF" strokeWidth={2.2} />
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
  bellBtn: {
    position: 'absolute',
    top: '16px',
    right: '76px',
    width: '46px',
    height: '46px',
    borderRadius: '14px',
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.24)',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.78), rgba(15, 23, 42, 0.62))',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    cursor: 'pointer',
  },
  bellBadge: {
    position: 'absolute',
    top: '-5px',
    right: '-5px',
    minWidth: '19px',
    height: '19px',
    borderRadius: '999px',
    background: 'linear-gradient(135deg, #F43F5E, #EF4444)',
    color: '#fff',
    fontSize: '10px',
    fontWeight: '800',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    border: '2px solid rgba(15, 23, 42, 0.88)',
    boxShadow: '0 6px 14px rgba(239, 68, 68, 0.32)',
  },
  headerLogoutBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    width: '46px',
    height: '46px',
    borderRadius: '14px',
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.24)',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.78), rgba(15, 23, 42, 0.62))',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    cursor: 'pointer',
  },
  locationShareBtn: (isSharing, isAdmin) => ({
    position: 'absolute',
    bottom: '40px',
    left: isSharing || isAdmin ? '70px' : 'auto',
    right: isSharing || isAdmin ? 'auto' : '70px',
    width: '46px',
    height: '46px',
    borderRadius: '14px',
    boxShadow: isSharing
      ? '0 14px 30px rgba(16, 185, 129, 0.26)'
      : '0 12px 28px rgba(15, 23, 42, 0.22)',
    zIndex: 850,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: isSharing
      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.96), rgba(5, 150, 105, 0.86))'
      : 'linear-gradient(180deg, rgba(17, 24, 39, 0.72), rgba(15, 23, 42, 0.54))',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: isSharing
      ? '1px solid rgba(167, 243, 208, 0.46)'
      : '1px solid rgba(255, 255, 255, 0.14)',
    cursor: 'pointer',
  }),
  liveDot: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#ECFDF5',
    boxShadow: '0 0 0 4px rgba(236, 253, 245, 0.20)',
  },
  floatingCompassBtn: (isAdmin) => ({
    position: 'absolute',
    bottom: '40px',
    left: isAdmin ? '16px' : 'auto',
    right: isAdmin ? 'auto' : '16px',
    width: '46px',
    height: '46px',
    borderRadius: '14px',
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.22)',
    zIndex: 850,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.72), rgba(15, 23, 42, 0.54))',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
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
