import React, { useEffect, useState, useRef } from 'react';
import { MapPin, UserPlus, UserCheck, UserX, X, Navigation } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function LocationSharingPanel({
  currentUser,
  isSharingLocation,
  activeShares,
  onStartGps,
  onStopGps,
  onSharesChanged,
}) {
  const [members, setMembers] = useState([]);
  const [shares, setShares] = useState(activeShares || []);
  const [loading, setLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState(null);
  const channelRef = useRef(null);

  useEffect(() => {
    fetchData();
    const ch = supabase
      .channel('rn_shares_panel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rn_location_shares' },
        () => fetchShares()
      )
      .subscribe();
    channelRef.current = ch;
    return () => supabase.removeChannel(ch);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchMembers(), fetchShares()]);
    setLoading(false);
  };

  const fetchMembers = async () => {
    const { data } = await supabase
      .from('rn_profiles')
      .select('id, name, email, avatar_url')
      .neq('id', currentUser.id);
    setMembers(data || []);
  };

  const fetchShares = async () => {
    const { data } = await supabase
      .from('rn_location_shares')
      .select('*, requester:rn_profiles!rn_location_shares_requester_id_fkey(id, name, email), recipient:rn_profiles!rn_location_shares_recipient_id_fkey(id, name, email)')
      .or(`requester_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false });
    const newShares = data || [];
    setShares(newShares);
    onSharesChanged(newShares.filter(s => s.status === 'accepted'));
  };

  const getPartner = (share) => {
    return share.requester_id === currentUser.id ? share.recipient : share.requester;
  };

  const getInitial = (name) => (name || '?').charAt(0).toUpperCase();

  const hasActiveShare = (memberId) => {
    return shares.some(s =>
      (s.requester_id === memberId || s.recipient_id === memberId) &&
      (s.status === 'pending' || s.status === 'accepted')
    );
  };

  const handleSendRequest = async (memberId) => {
    setSendingTo(memberId);
    try {
      const { data: share, error } = await supabase
        .from('rn_location_shares')
        .insert({ requester_id: currentUser.id, recipient_id: memberId })
        .select()
        .single();
      if (error) throw error;

      await supabase.from('rn_notifications').insert({
        recipient_id: memberId,
        sender_id: currentUser.id,
        type: 'location_share_request',
        share_id: share.id,
        message: `${currentUser.name || '팀원'}님이 위치 공유를 요청했습니다`,
      });
      await fetchShares();
    } catch (err) {
      if (err.message?.includes('duplicate') || err.code === '23505') {
        alert('이미 요청이 존재합니다.');
      } else {
        alert('요청 실패: ' + err.message);
      }
    } finally {
      setSendingTo(null);
    }
  };

  const handleAccept = async (shareId) => {
    await supabase
      .from('rn_location_shares')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', shareId);
    await fetchShares();
  };

  const handleReject = async (shareId) => {
    await supabase
      .from('rn_location_shares')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', shareId);
    await fetchShares();
  };

  const handleEnd = async (shareId) => {
    await supabase
      .from('rn_location_shares')
      .update({ status: 'ended', updated_at: new Date().toISOString() })
      .eq('id', shareId);
    await fetchShares();
  };

  const incomingRequests = shares.filter(
    s => s.recipient_id === currentUser.id && s.status === 'pending'
  );
  const activeSharesList = shares.filter(s => s.status === 'accepted');
  const outgoingPending = shares.filter(
    s => s.requester_id === currentUser.id && s.status === 'pending'
  );
  const availableMembers = members.filter(m => !hasActiveShare(m.id));

  if (loading) {
    return (
      <div style={styles.center}>
        <span style={styles.loadingText}>불러오는 중...</span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* GPS Status */}
      {activeSharesList.length > 0 && (
        <div style={styles.gpsSection}>
          <div style={styles.gpsBanner}>
            <Navigation size={16} color={isSharingLocation ? '#10B981' : '#9CA3AF'} />
            <span style={{ fontSize: '13px', color: isSharingLocation ? '#10B981' : 'var(--text-secondary)', fontWeight: 600 }}>
              {isSharingLocation ? 'GPS 공유 중' : 'GPS 꺼짐'}
            </span>
            <button
              style={{
                ...styles.smallBtn,
                background: isSharingLocation ? 'var(--danger)' : 'var(--success)',
                color: '#fff',
                marginLeft: 'auto',
              }}
              onClick={isSharingLocation ? onStopGps : onStartGps}
            >
              {isSharingLocation ? '중지' : '시작'}
            </button>
          </div>
        </div>
      )}

      {/* Incoming Requests */}
      {incomingRequests.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>받은 요청</h4>
          {incomingRequests.map(share => {
            const partner = getPartner(share);
            return (
              <div key={share.id} style={styles.row}>
                <div style={styles.avatar}>{getInitial(partner?.name)}</div>
                <div style={styles.info}>
                  <span style={styles.name}>{partner?.name || partner?.email}</span>
                  <span style={styles.sub}>위치 공유 요청</span>
                </div>
                <button style={{ ...styles.actionBtn, background: 'var(--success)', color: '#fff' }} onClick={() => handleAccept(share.id)}>
                  <UserCheck size={15} />
                  <span>수락</span>
                </button>
                <button style={{ ...styles.actionBtn, background: 'var(--bg-card-border)', color: 'var(--text-primary)' }} onClick={() => handleReject(share.id)}>
                  <UserX size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Shares */}
      {activeSharesList.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>공유 중</h4>
          {activeSharesList.map(share => {
            const partner = getPartner(share);
            return (
              <div key={share.id} style={styles.row}>
                <div style={{ ...styles.avatar, background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                  {getInitial(partner?.name)}
                </div>
                <div style={styles.info}>
                  <span style={styles.name}>{partner?.name || partner?.email}</span>
                  <span style={{ ...styles.sub, color: 'var(--success)' }}>서로 위치 공유 중</span>
                </div>
                <button
                  style={{ ...styles.actionBtn, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}
                  onClick={() => handleEnd(share.id)}
                >
                  <X size={15} />
                  <span>종료</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Outgoing Pending */}
      {outgoingPending.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>보낸 요청</h4>
          {outgoingPending.map(share => {
            const partner = getPartner(share);
            return (
              <div key={share.id} style={styles.row}>
                <div style={{ ...styles.avatar, background: 'var(--warning)' }}>
                  {getInitial(partner?.name)}
                </div>
                <div style={styles.info}>
                  <span style={styles.name}>{partner?.name || partner?.email}</span>
                  <span style={{ ...styles.sub, color: 'var(--warning)' }}>대기 중...</span>
                </div>
                <button
                  style={{ ...styles.actionBtn, background: 'var(--bg-card-border)', color: 'var(--text-muted)' }}
                  onClick={() => handleEnd(share.id)}
                >
                  <X size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Available Members */}
      {availableMembers.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>팀원</h4>
          {availableMembers.map(member => (
            <div key={member.id} style={styles.row}>
              <div style={styles.avatar}>{getInitial(member.name)}</div>
              <div style={styles.info}>
                <span style={styles.name}>{member.name || member.email}</span>
              </div>
              <button
                style={{ ...styles.actionBtn, background: 'var(--primary)', color: '#fff' }}
                disabled={sendingTo === member.id}
                onClick={() => handleSendRequest(member.id)}
              >
                <UserPlus size={15} />
                <span>{sendingTo === member.id ? '...' : '요청'}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {members.length === 0 && shares.length === 0 && (
        <div style={styles.center}>
          <MapPin size={32} color="var(--text-muted)" />
          <p style={styles.emptyText}>공유할 팀원이 없습니다</p>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingBottom: '16px',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '40px 0',
  },
  loadingText: {
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
  emptyText: {
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
  gpsSection: {
    padding: '0 0 8px',
  },
  gpsBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderRadius: '12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--bg-card-border)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginTop: '8px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '4px 4px 8px',
    margin: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 8px',
    borderRadius: '12px',
    transition: 'background 0.1s',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'var(--primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 700,
    flexShrink: 0,
  },
  info: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  name: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sub: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  actionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'opacity 0.15s',
  },
  smallBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 12px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
