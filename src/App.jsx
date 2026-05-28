import React, { useEffect, useState, useRef } from 'react';
import { Bell, CheckCircle2, Compass, Locate, LogOut, MapPin, Megaphone, Plus, Users, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import AuthScreen from './components/AuthScreen';
import BottomSheet from './components/BottomSheet';
import MapContainer from './components/MapContainer';
import MarketMapModal from './components/MarketMapModal';
import PathForm from './components/PathForm';
import RoadviewModal from './components/RoadviewModal';
import SearchBox from './components/SearchBox';
import TipDetail from './components/TipDetail';
import TipForm from './components/TipForm';
import ZoneDetail from './components/ZoneDetail';
import ZoneForm from './components/ZoneForm';
import { enablePushNotifications, getPushPermissionState, getPushSupportState, sendPushForNotification } from './utils/pushNotifications';
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
  const [locationShareRequests, setLocationShareRequests] = useState([]);
  const [locationShareReady, setLocationShareReady] = useState(true);
  const [teamMembers, setTeamMembers] = useState({});
  const presenceChannelRef = useRef(null);
  const myLatLngRef = useRef(null);

  // 알림 상태
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushPermission, setPushPermission] = useState('default');
  const [pushSaving, setPushSaving] = useState(false);

  // 공지사항 상태
  const [announcements, setAnnouncements] = useState([]);
  const [announcementModal, setAnnouncementModal] = useState(null);
  const [announcementForm, setAnnouncementForm] = useState({ open: false, title: '', content: '' });
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [expandedAnnId, setExpandedAnnId] = useState(null);

  // 시장지도 상태
  const [marketModalOpen, setMarketModalOpen] = useState(true);
  const [marketBuilding, setMarketBuilding] = useState('cheonggwamul');
  const [annComments, setAnnComments] = useState({});
  const [annCommentInput, setAnnCommentInput] = useState('');
  const [annCommentSaving, setAnnCommentSaving] = useState(false);

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

  useEffect(() => {
    if (!currentUser || isDemoUser(currentUser)) return;
    getPushPermissionState().then(setPushPermission);
  }, [currentUser]);

  // 공지사항 구독
  useEffect(() => {
    if (!currentUser) return;

    const isDismissed = (id) => localStorage.getItem(`rn_ann_dismissed_${id}`) === '1';

    const fetchAnnouncements = async () => {
      const { data, error } = await supabase
        .from('rn_announcements')
        .select('*, creator:rn_profiles!created_by(name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) console.error('[announcements] fetch error:', error);
      const list = data || [];
      setAnnouncements(list);
      const undismissed = list.find((a) => !isDismissed(a.id));
      if (undismissed) setAnnouncementModal(undismissed);
    };
    fetchAnnouncements();

    const annChannel = supabase
      .channel('rn_announcements_all')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rn_announcements' }, (payload) => {
        const item = payload.new;
        setAnnouncements((prev) => [item, ...prev]);
        if (!isDismissed(item.id)) setAnnouncementModal(item);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rn_announcements' }, (payload) => {
        if (!payload.new.is_active) {
          setAnnouncements((prev) => prev.filter((a) => a.id !== payload.new.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(annChannel);
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

  const handleSaveAnnouncement = async () => {
    if (!announcementForm.title.trim() || announcementSaving) return;
    setAnnouncementSaving(true);
    try {
      await supabase.from('rn_announcements').insert({
        title: announcementForm.title.trim(),
        content: announcementForm.content.trim() || null,
        created_by: currentUser.id,
      });
      setAnnouncementForm({ open: false, title: '', content: '' });
    } catch (err) {
      alert('공지 등록 실패: ' + err.message);
    } finally {
      setAnnouncementSaving(false);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    await supabase.from('rn_announcements').update({ is_active: false }).eq('id', id);
    if (expandedAnnId === id) setExpandedAnnId(null);
  };

  const handleDismissAnnouncement = (id, permanent) => {
    if (permanent) localStorage.setItem(`rn_ann_dismissed_${id}`, '1');
    setAnnouncementModal(null);
  };

  const handleExpandAnn = async (id) => {
    if (expandedAnnId === id) { setExpandedAnnId(null); return; }
    setExpandedAnnId(id);
    setAnnCommentInput('');
    if (annComments[id]) return;
    const { data } = await supabase
      .from('rn_announcement_comments')
      .select('*, author:rn_profiles!created_by(name)')
      .eq('announcement_id', id)
      .order('created_at', { ascending: true });
    setAnnComments((prev) => ({ ...prev, [id]: data || [] }));
  };

  const handleAddAnnComment = async (announcementId) => {
    if (!annCommentInput.trim() || annCommentSaving) return;
    setAnnCommentSaving(true);
    try {
      const { data } = await supabase
        .from('rn_announcement_comments')
        .insert({ announcement_id: announcementId, content: annCommentInput.trim(), created_by: currentUser.id })
        .select('*, author:rn_profiles!created_by(name)')
        .single();
      if (data) {
        setAnnComments((prev) => ({ ...prev, [announcementId]: [...(prev[announcementId] || []), data] }));
        setAnnCommentInput('');
      }
    } catch (err) {
      alert('댓글 등록 실패: ' + err.message);
    } finally {
      setAnnCommentSaving(false);
    }
  };

  const handleEnablePushNotifications = async () => {
    if (!currentUser || isDemoUser(currentUser)) return;
    setPushSaving(true);
    try {
      await enablePushNotifications(currentUser.id);
      setPushPermission(await getPushPermissionState());
      alert('푸시 알림이 켜졌습니다.');
    } catch (err) {
      setPushPermission(await getPushPermissionState());
      alert('푸시 알림 설정 실패: ' + err.message);
    } finally {
      setPushSaving(false);
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
    if (!item) return;

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
    setSheetTitle('위치공유 요청');
    setSheetContent('location-share');
    setSheetOpen(true);
  };

  useEffect(() => {
    if (!currentUser || isDemoUser(currentUser)) return;
    ensurePresenceChannel();
  }, [currentUser?.id]);

  const getLocationSharePartnerId = (request) => {
    if (!request || !currentUser) return null;
    return request.requester_id === currentUser.id ? request.recipient_id : request.requester_id;
  };

  const getLocationSharePartnerName = (request) => {
    const partnerId = getLocationSharePartnerId(request);
    return locationShareMembers.find(member => member.id === partnerId)?.name || '선택한 팀원';
  };

  const fetchLocationShareRequests = async () => {
    if (!currentUser || isDemoUser(currentUser)) return;
    const { data, error } = await supabase
      .from('rn_location_share_requests')
      .select('*')
      .or(`requester_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
      .in('status', ['pending', 'accepted'])
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      console.warn('Location share request table is not ready:', error.message);
      setLocationShareReady(false);
      setLocationShareRequests([]);
      return;
    }

    setLocationShareReady(true);
    setLocationShareRequests(data || []);
  };

  const notifyLocationShare = async ({ recipientId, type, message }) => {
    try {
      const { data, error } = await supabase
        .from('rn_notifications')
        .insert({
          recipient_id: recipientId,
          sender_id: currentUser.id,
          type,
          message,
        })
        .select('id')
        .single();
      if (error) throw error;
      await sendPushForNotification(data?.id);
    } catch (err) {
      console.warn('Location share notification failed:', err.message);
    }
  };

  const requestLocationShare = async (recipientId) => {
    if (!locationShareReady) {
      alert('위치공유 요청 기능을 사용하려면 DB 마이그레이션 적용이 필요합니다.');
      return;
    }

    const recipient = locationShareMembers.find(member => member.id === recipientId);
    const { error } = await supabase
      .from('rn_location_share_requests')
      .insert({
        requester_id: currentUser.id,
        recipient_id: recipientId,
      });

    if (error) {
      alert('위치공유 요청 실패: ' + error.message);
      return;
    }

    await notifyLocationShare({
      recipientId,
      type: 'location_share_request',
      message: `${currentUser.name || '팀원'}님이 위치공유를 요청했습니다.`,
    });
    await fetchLocationShareRequests();
    alert(`${recipient?.name || '팀원'}님에게 위치공유 요청을 보냈습니다.`);
  };

  const acceptLocationShareRequest = async (request) => {
    const partnerId = getLocationSharePartnerId(request);
    const { error } = await supabase
      .from('rn_location_share_requests')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id);

    if (error) {
      alert('위치공유 수락 실패: ' + error.message);
      return;
    }

    await notifyLocationShare({
      recipientId: partnerId,
      type: 'location_share_accepted',
      message: `${currentUser.name || '팀원'}님이 위치공유 요청을 수락했습니다.`,
    });
    await fetchLocationShareRequests();
    await startLocationSharing(partnerId);
  };

  const updateLocationShareRequestStatus = async (request, status) => {
    const patch = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'ended' || status === 'canceled') patch.ended_at = new Date().toISOString();
    if (status === 'declined') patch.responded_at = new Date().toISOString();

    const { error } = await supabase
      .from('rn_location_share_requests')
      .update(patch)
      .eq('id', request.id);

    if (error) {
      alert('위치공유 상태 변경 실패: ' + error.message);
      return;
    }

    await fetchLocationShareRequests();
    if (status === 'ended' || status === 'canceled') {
      stopLocationSharing();
    }
  };

  useEffect(() => {
    if (!currentUser || isDemoUser(currentUser)) return;

    fetchLocationShareRequests();
    const channel = supabase
      .channel(`rn_location_share_requests_${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rn_location_share_requests' },
        (payload) => {
          fetchLocationShareRequests();
          if (
            payload.eventType === 'UPDATE'
            && payload.new?.status === 'accepted'
            && payload.new?.requester_id === currentUser.id
          ) {
            startLocationSharing(payload.new.recipient_id);
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
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
        const acceptedRequest = locationShareRequests.find(request => request.status === 'accepted');
        const incomingRequests = locationShareRequests.filter(
          request => request.status === 'pending' && request.recipient_id === currentUser?.id,
        );
        const outgoingRequests = locationShareRequests.filter(
          request => request.status === 'pending' && request.requester_id === currentUser?.id,
        );
        const activePartnerId = acceptedRequest ? getLocationSharePartnerId(acceptedRequest) : locationShareTarget;
        const activePartnerName = acceptedRequest
          ? getLocationSharePartnerName(acceptedRequest)
          : locationShareMembers.find(member => member.id === locationShareTarget)?.name || '상대';

        return (
          <div style={stylesShare.container}>
            <div style={stylesShare.statusCard}>
              <div style={stylesShare.statusIcon(isSharingLocation || !!acceptedRequest)}>
                {isSharingLocation || acceptedRequest ? <CheckCircle2 size={18} /> : <Users size={18} />}
              </div>
              <div style={stylesShare.statusText}>
                <strong>
                  {isSharingLocation ? '위치공유 중' : acceptedRequest ? '수락된 위치공유' : '위치공유 요청'}
                </strong>
                <span>
                  {isSharingLocation
                    ? `${activePartnerName}님과 서로 위치를 공유하고 있습니다.`
                    : acceptedRequest
                      ? `${activePartnerName}님과의 공유가 일시 중지되어 있습니다. 다시 시작할 수 있습니다.`
                      : '상대에게 요청을 보내고, 상대가 수락하면 서로 위치가 보입니다.'}
                </span>
              </div>
            </div>

            {!locationShareReady && (
              <div style={stylesShare.notice}>
                위치공유 요청 DB가 아직 준비되지 않았습니다. 마이그레이션 적용 후 사용할 수 있습니다.
              </div>
            )}

            {acceptedRequest && (
              <div style={stylesShare.section}>
                <h3 style={stylesShare.sectionTitle}>진행 중인 공유</h3>
                <div style={stylesShare.requestCard}>
                  <div>
                    <strong>{activePartnerName}님</strong>
                    <p style={stylesShare.requestText}>{isSharingLocation ? '현재 서로 위치를 보는 중입니다.' : '공유를 다시 시작할 수 있습니다.'}</p>
                  </div>
                  <div style={stylesShare.requestActions}>
                    {!isSharingLocation && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={stylesShare.compactBtn}
                        onClick={() => startLocationSharing(activePartnerId)}
                      >
                        다시 시작
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={stylesShare.compactBtn}
                      onClick={() => updateLocationShareRequestStatus(acceptedRequest, 'ended')}
                    >
                      종료
                    </button>
                  </div>
                </div>
              </div>
            )}

            {incomingRequests.length > 0 && (
              <div style={stylesShare.section}>
                <h3 style={stylesShare.sectionTitle}>받은 요청</h3>
                {incomingRequests.map((request) => (
                  <div key={request.id} style={stylesShare.requestCard}>
                    <div>
                      <strong>{getLocationSharePartnerName(request)}님</strong>
                      <p style={stylesShare.requestText}>위치공유를 요청했습니다.</p>
                    </div>
                    <div style={stylesShare.requestActions}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={stylesShare.compactBtn}
                        onClick={() => acceptLocationShareRequest(request)}
                      >
                        수락
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={stylesShare.compactBtn}
                        onClick={() => updateLocationShareRequestStatus(request, 'declined')}
                      >
                        거절
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {outgoingRequests.length > 0 && (
              <div style={stylesShare.section}>
                <h3 style={stylesShare.sectionTitle}>보낸 요청</h3>
                {outgoingRequests.map((request) => (
                  <div key={request.id} style={stylesShare.requestCard}>
                    <div>
                      <strong>{getLocationSharePartnerName(request)}님</strong>
                      <p style={stylesShare.requestText}>수락을 기다리는 중입니다.</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={stylesShare.compactBtn}
                      onClick={() => updateLocationShareRequestStatus(request, 'canceled')}
                    >
                      취소
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!acceptedRequest && (
              <div style={stylesShare.section}>
                <h3 style={stylesShare.sectionTitle}>요청 보낼 팀원</h3>
                <div style={stylesShare.memberList}>
                  {loadingShareMembers && <p style={stylesShare.emptyText}>팀원 목록을 불러오는 중...</p>}
                  {!loadingShareMembers && locationShareMembers.length === 0 && (
                    <p style={stylesShare.emptyText}>요청을 보낼 팀원이 없습니다.</p>
                  )}
                  {!loadingShareMembers && locationShareMembers.map((member) => {
                    const waitingRequest = outgoingRequests.find(request => request.recipient_id === member.id);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className="btn btn-secondary"
                        style={stylesShare.targetBtn(!!waitingRequest)}
                        onClick={() => requestLocationShare(member.id)}
                        disabled={!locationShareReady || !!waitingRequest}
                      >
                        <span style={stylesShare.avatar}>{(member.name || '팀').charAt(0)}</span>
                        <span style={stylesShare.memberName}>{member.name || '이름 없음'}</span>
                        <span style={stylesShare.memberRole}>{waitingRequest ? '요청 대기 중' : member.role || 'member'}</span>
                        {waitingRequest ? <CheckCircle2 size={16} color="var(--success)" /> : <Plus size={16} color="var(--primary)" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isSharingLocation && !acceptedRequest && (
              <button
                type="button"
                className="btn btn-danger"
                style={stylesShare.stopBtn}
                onClick={stopLocationSharing}
              >
                위치공유 중지
              </button>
            )}
          </div>
        );
      }
      case 'notifications':
        return (
          <div style={stylesNoti.container}>
            {/* 공지사항 섹션 */}
            <div style={stylesNoti.sectionHeader}>
              <Megaphone size={15} color="var(--text-secondary)" />
              <span>공지사항</span>
              {currentUser?.role === 'admin' && (
                <button
                  style={stylesNoti.addAnnBtn}
                  onClick={() => setAnnouncementForm((f) => ({ ...f, open: !f.open }))}
                >
                  {announcementForm.open ? '취소' : '+ 작성'}
                </button>
              )}
            </div>

            {announcementForm.open && currentUser?.role === 'admin' && (
              <div style={stylesNoti.annForm}>
                <input
                  style={stylesNoti.annInput}
                  placeholder="공지 제목 (필수)"
                  maxLength={100}
                  value={announcementForm.title}
                  onChange={(e) => setAnnouncementForm((f) => ({ ...f, title: e.target.value }))}
                />
                <textarea
                  style={stylesNoti.annTextarea}
                  placeholder="내용 (선택, 500자 이내)"
                  maxLength={500}
                  rows={3}
                  value={announcementForm.content}
                  onChange={(e) => setAnnouncementForm((f) => ({ ...f, content: e.target.value }))}
                />
                <button
                  style={stylesNoti.annSubmitBtn(announcementSaving || !announcementForm.title.trim())}
                  disabled={announcementSaving || !announcementForm.title.trim()}
                  onClick={handleSaveAnnouncement}
                >
                  {announcementSaving ? '등록 중...' : '공지 등록'}
                </button>
              </div>
            )}

            {announcements.length === 0 && (
              <p style={stylesNoti.empty}>등록된 공지가 없습니다</p>
            )}
            {announcements.map((ann) => (
              <div key={ann.id} style={stylesNoti.annItem}>
                <div style={stylesNoti.annItemHeader}>
                  <span style={stylesNoti.annTitle}>{ann.title}</span>
                  {currentUser?.role === 'admin' && (
                    <button style={stylesNoti.annDeleteBtn} onClick={() => handleDeleteAnnouncement(ann.id)}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                {ann.content && <p style={stylesNoti.annContent}>{ann.content}</p>}
                <div style={stylesNoti.annMeta}>
                  <span style={stylesNoti.time}>
                    {ann.creator?.name || '관리자'} ·{' '}
                    {(() => {
                      const diff = Math.floor((Date.now() - new Date(ann.created_at)) / 60000);
                      if (diff < 1) return '방금 전';
                      if (diff < 60) return `${diff}분 전`;
                      if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
                      return `${Math.floor(diff / 1440)}일 전`;
                    })()}
                  </span>
                  <button style={stylesNoti.annCommentToggle} onClick={() => handleExpandAnn(ann.id)}>
                    💬 {annComments[ann.id]?.length ?? ''}댓글
                  </button>
                </div>

                {expandedAnnId === ann.id && (
                  <div style={stylesNoti.annCommentSection}>
                    {(annComments[ann.id] || []).map((c) => (
                      <div key={c.id} style={stylesNoti.annCommentItem}>
                        <span style={stylesNoti.annCommentAuthor}>{c.author?.name || '?'}</span>
                        <span style={stylesNoti.annCommentText}>{c.content}</span>
                      </div>
                    ))}
                    {(annComments[ann.id] || []).length === 0 && (
                      <p style={{ ...stylesNoti.time, padding: '4px 0' }}>첫 댓글을 남겨보세요</p>
                    )}
                    <div style={stylesNoti.annCommentForm}>
                      <input
                        style={stylesNoti.annCommentInput}
                        placeholder="댓글 입력..."
                        maxLength={300}
                        value={annCommentInput}
                        onChange={(e) => setAnnCommentInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddAnnComment(ann.id)}
                      />
                      <button
                        style={stylesNoti.annCommentSendBtn(annCommentSaving || !annCommentInput.trim())}
                        disabled={annCommentSaving || !annCommentInput.trim()}
                        onClick={() => handleAddAnnComment(ann.id)}
                      >
                        등록
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* 개인 알림 섹션 */}
            <div style={{ ...stylesNoti.sectionHeader, marginTop: '8px' }}>
              <Bell size={15} color="var(--text-secondary)" />
              <span>내 알림</span>
            </div>
            {!getPushSupportState().supported && (
              <div style={stylesNoti.pushNotice}>이 브라우저에서는 푸시 알림을 지원하지 않습니다.</div>
            )}
            {getPushSupportState().supported && pushPermission !== 'granted' && (
              <button
                type="button"
                onClick={handleEnablePushNotifications}
                disabled={pushSaving || pushPermission === 'denied'}
                style={stylesNoti.pushButton(pushSaving || pushPermission === 'denied')}
              >
                {pushPermission === 'denied'
                  ? '브라우저 설정에서 알림 권한을 허용해주세요'
                  : pushSaving ? '푸시 알림 설정 중...' : '푸시 알림 켜기'}
              </button>
            )}
            {pushPermission === 'granted' && (
              <div style={stylesNoti.pushEnabled}>푸시 알림 켜짐</div>
            )}
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
    pushNotice: {
      margin: '0 0 10px',
      padding: '12px 14px',
      borderRadius: '14px',
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      border: '1px solid rgba(245, 158, 11, 0.22)',
      color: 'var(--text-secondary)',
      fontSize: '13px',
      fontWeight: 700,
    },
    pushEnabled: {
      margin: '0 0 10px',
      padding: '12px 14px',
      borderRadius: '14px',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      border: '1px solid rgba(16, 185, 129, 0.22)',
      color: '#047857',
      fontSize: '13px',
      fontWeight: 800,
      textAlign: 'center',
    },
    pushButton: (disabled) => ({
      width: '100%',
      minHeight: '46px',
      margin: '0 0 10px',
      borderRadius: '14px',
      border: '1px solid rgba(79, 70, 229, 0.22)',
      backgroundColor: disabled ? 'rgba(148, 163, 184, 0.14)' : 'var(--primary)',
      color: disabled ? 'var(--text-secondary)' : '#FFFFFF',
      fontSize: '14px',
      fontWeight: 800,
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: disabled ? 'none' : '0 8px 20px rgba(79, 70, 229, 0.22)',
    }),
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
    sectionHeader: {
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '6px 4px 4px', fontSize: '12px', fontWeight: 700,
      color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
      marginBottom: '4px',
    },
    addAnnBtn: {
      marginLeft: 'auto', fontSize: '12px', fontWeight: 700,
      background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '0 2px',
    },
    annForm: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 0' },
    annInput: {
      width: '100%', padding: '9px 12px', borderRadius: '10px',
      border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)',
      color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
    },
    annTextarea: {
      width: '100%', padding: '9px 12px', borderRadius: '10px',
      border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)',
      color: 'var(--text-primary)', fontSize: '13px', resize: 'none', boxSizing: 'border-box',
    },
    annSubmitBtn: (disabled) => ({
      width: '100%', minHeight: '40px', borderRadius: '10px', border: 'none',
      backgroundColor: disabled ? 'rgba(148,163,184,0.2)' : 'var(--primary)',
      color: disabled ? 'var(--text-muted)' : '#fff', fontSize: '13px', fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
    }),
    annItem: {
      padding: '12px 4px', borderBottom: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: '4px',
    },
    annItemHeader: { display: 'flex', alignItems: 'center', gap: '6px' },
    annTitle: { flex: 1, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' },
    annDeleteBtn: {
      background: 'none', border: 'none', cursor: 'pointer',
      color: 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center',
    },
    annContent: { fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.5 },
    annMeta: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' },
    annCommentToggle: {
      background: 'none', border: 'none', cursor: 'pointer',
      fontSize: '12px', color: 'var(--primary)', fontWeight: 600, padding: 0,
    },
    annCommentSection: {
      marginTop: '8px', padding: '8px 10px', borderRadius: '10px',
      backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '6px',
    },
    annCommentItem: { display: 'flex', gap: '6px', alignItems: 'flex-start' },
    annCommentAuthor: { fontSize: '12px', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 },
    annCommentText: { fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 },
    annCommentForm: { display: 'flex', gap: '6px', marginTop: '4px' },
    annCommentInput: {
      flex: 1, padding: '7px 10px', borderRadius: '8px',
      border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)', fontSize: '12px',
    },
    annCommentSendBtn: (disabled) => ({
      padding: '7px 12px', borderRadius: '8px', border: 'none', flexShrink: 0,
      backgroundColor: disabled ? 'rgba(148,163,184,0.2)' : 'var(--primary)',
      color: disabled ? 'var(--text-muted)' : '#fff', fontSize: '12px', fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
    }),
  };

  const stylesAnn = {
    overlay: {
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '16px',
    },
    modal: {
      width: '100%', maxWidth: '360px', borderRadius: '20px',
      backgroundColor: '#FFFFFF', padding: '24px 20px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      display: 'flex', flexDirection: 'column', gap: '12px',
    },
    modalHeader: { display: 'flex', alignItems: 'center', gap: '8px' },
    modalHeaderText: { fontSize: '13px', fontWeight: 700, color: '#F59E0B' },
    modalTitle: { fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 },
    modalContent: { fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' },
    modalFooter: { display: 'flex', gap: '8px', marginTop: '4px' },
    dismissBtn: {
      flex: 1, minHeight: '42px', borderRadius: '12px', border: '1px solid var(--border)',
      backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '13px',
      fontWeight: 600, cursor: 'pointer',
    },
    closeBtn: {
      flex: 1, minHeight: '42px', borderRadius: '12px', border: 'none',
      backgroundColor: 'var(--primary)', color: '#fff', fontSize: '13px',
      fontWeight: 700, cursor: 'pointer',
    },
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
    notice: {
      padding: '12px 14px',
      borderRadius: '14px',
      backgroundColor: 'rgba(245, 158, 11, 0.10)',
      border: '1px solid rgba(245, 158, 11, 0.25)',
      color: 'var(--text-secondary)',
      fontSize: '13px',
      lineHeight: '1.45',
    },
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
    sectionTitle: {
      margin: '2px 2px 0',
      color: 'var(--text-muted)',
      fontSize: '12px',
      fontWeight: 800,
      letterSpacing: 0,
    },
    requestCard: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '12px 14px',
      borderRadius: '14px',
      backgroundColor: 'var(--bg-input)',
      border: '1px solid var(--bg-card-border)',
      color: 'var(--text-primary)',
    },
    requestActions: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      flexShrink: 0,
    },
    requestText: {
      margin: '3px 0 0',
      color: 'var(--text-secondary)',
      fontSize: '12px',
      lineHeight: '1.35',
    },
    compactBtn: {
      minHeight: '34px',
      padding: '8px 12px',
      borderRadius: '11px',
      fontSize: '13px',
      whiteSpace: 'nowrap',
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
      {/* 공지사항 시작 모달 */}
      {announcementModal && (
        <div style={stylesAnn.overlay}>
          <div style={stylesAnn.modal}>
            <div style={stylesAnn.modalHeader}>
              <Megaphone size={18} color="#F59E0B" />
              <span style={stylesAnn.modalHeaderText}>공지사항</span>
            </div>
            <h3 style={stylesAnn.modalTitle}>{announcementModal.title}</h3>
            {announcementModal.content && (
              <p style={stylesAnn.modalContent}>{announcementModal.content}</p>
            )}
            <div style={stylesAnn.modalFooter}>
              <button style={stylesAnn.dismissBtn} onClick={() => handleDismissAnnouncement(announcementModal.id, true)}>
                다시 보지 않기
              </button>
              <button style={stylesAnn.closeBtn} onClick={() => handleDismissAnnouncement(announcementModal.id, false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

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
          <LogOut size={19} color="var(--text-primary)" strokeWidth={2.2} />
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
          <Bell size={19} color="var(--text-primary)" strokeWidth={2.2} />
          {unreadCount > 0 && (
            <span style={styles.bellBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>
      )}


      {!isDrawingZone && !isDrawingPath && currentUser?.role !== 'viewer' && !isDemoUser(currentUser) && (
        <button
          className="btn btn-icon map-action-btn"
          onClick={handleOpenLocationSharing}
          aria-label={isSharingLocation ? '위치공유 설정' : '위치공유 요청'}
          title={isSharingLocation ? '위치공유 설정' : '위치공유 요청'}
          style={styles.locationShareBtn(isSharingLocation, currentUser?.role === 'admin')}
        >
          <Users size={18} color={isSharingLocation ? '#FFFFFF' : 'var(--text-primary)'} strokeWidth={2.2} />
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
          <Locate size={19} color="var(--text-primary)" strokeWidth={2.2} />
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

      <MarketMapModal
        isOpen={marketModalOpen}
        onClose={() => setMarketModalOpen(false)}
        initialBuilding={marketBuilding}
        currentUser={currentUser}
      />
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
    backgroundColor: '#F9FAFB',
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
    boxShadow: 'var(--shadow-md)',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
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
    border: '2px solid #FFFFFF',
    boxShadow: '0 6px 14px rgba(239, 68, 68, 0.32)',
  },
  marketBtn: {
    position: 'absolute',
    top: '16px',
    right: '136px',
    width: '46px',
    height: '46px',
    borderRadius: '14px',
    boxShadow: 'var(--shadow-md)',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    cursor: 'pointer',
  },
  headerLogoutBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    width: '46px',
    height: '46px',
    borderRadius: '14px',
    boxShadow: 'var(--shadow-md)',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
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
      : 'var(--shadow-md)',
    zIndex: 850,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: isSharing
      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.96), rgba(5, 150, 105, 0.86))'
      : 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: isSharing
      ? '1px solid rgba(167, 243, 208, 0.46)'
      : '1px solid rgba(148, 163, 184, 0.22)',
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
    boxShadow: 'var(--shadow-md)',
    zIndex: 850,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
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
