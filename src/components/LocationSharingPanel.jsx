import React, { useEffect, useState, useRef } from 'react';
import { MapPin, Navigation, UserPlus, X } from 'lucide-react';
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

  const getPartner = (share) =>
    share.requester_id === currentUser.id ? share.recipient : share.requester;

  const getInitial = (name) => (name || '?').charAt(0).toUpperCase();

  const hasActiveShare = (memberId) =>
    shares.some(s =>
      (s.requester_id === memberId || s.recipient_id === memberId) &&
      (s.status === 'pending' || s.status === 'accepted')
    );

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
      <div style={styles.emptyWrap}>
        <p style={styles.emptyText}>불러오는 중...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* GPS 상태 바 */}
      {activeSharesList.length > 0 && (
        <div className="glass" style={styles.gpsCard}>
          <div style={styles.gpsRow}>
            <Navigation size={15} color={isSharingLocation ? 'var(--success)' : 'var(--text-muted)'} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: isSharingLocation ? 'var(--success)' : 'var(--text-secondary)' }}>
              {isSharingLocation ? 'GPS 공유 중' : 'GPS 꺼짐 — 상대에게 내 위치가 보이지 않습니다'}
            </span>
          </div>
          <button
            className={isSharingLocation ? 'btn btn-danger' : 'btn btn-primary'}
            style={styles.gpsBtn}
            onClick={isSharingLocation ? onStopGps : onStartGps}
          >
            {isSharingLocation ? 'GPS 중지' : 'GPS 시작'}
          </button>
        </div>
      )}

      {/* 받은 요청 */}
      {incomingRequests.length > 0 && (
        <Section title="받은 요청" count={incomingRequests.length}>
          {incomingRequests.map(share => {
            const partner = getPartner(share);
            return (
              <div key={share.id} style={styles.row}>
                <div style={styles.initial}>{getInitial(partner?.name)}</div>
                <div style={styles.info}>
                  <span style={styles.name}>{partner?.name || partner?.email}</span>
                  <span style={styles.sub}>위치 공유를 요청했습니다</span>
                </div>
                <div style={styles.rowActions}>
                  <button className="btn btn-primary" style={styles.rowBtn} onClick={() => handleAccept(share.id)}>수락</button>
                  <button className="btn btn-secondary" style={styles.rowBtnSmall} onClick={() => handleReject(share.id)}>거절</button>
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* 공유 중 */}
      {activeSharesList.length > 0 && (
        <Section title="공유 중">
          {activeSharesList.map(share => {
            const partner = getPartner(share);
            return (
              <div key={share.id} style={styles.row}>
                <div style={{ ...styles.initial, backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>
                  {getInitial(partner?.name)}
                </div>
                <div style={styles.info}>
                  <span style={styles.name}>{partner?.name || partner?.email}</span>
                  <span style={{ ...styles.statusTag, backgroundColor: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}>서로 공유 중</span>
                </div>
                <button className="btn btn-secondary" style={styles.rowBtnSmall} onClick={() => handleEnd(share.id)}>
                  <X size={14} />
                  <span>종료</span>
                </button>
              </div>
            );
          })}
        </Section>
      )}

      {/* 보낸 요청 */}
      {outgoingPending.length > 0 && (
        <Section title="보낸 요청">
          {outgoingPending.map(share => {
            const partner = getPartner(share);
            return (
              <div key={share.id} style={styles.row}>
                <div style={{ ...styles.initial, backgroundColor: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>
                  {getInitial(partner?.name)}
                </div>
                <div style={styles.info}>
                  <span style={styles.name}>{partner?.name || partner?.email}</span>
                  <span style={{ ...styles.statusTag, backgroundColor: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>대기 중</span>
                </div>
                <button className="btn btn-secondary" style={styles.rowBtnSmall} onClick={() => handleEnd(share.id)}>취소</button>
              </div>
            );
          })}
        </Section>
      )}

      {/* 팀원 목록 */}
      {availableMembers.length > 0 && (
        <Section title="팀원">
          {availableMembers.map(member => (
            <div key={member.id} style={styles.row}>
              <div style={styles.initial}>{getInitial(member.name)}</div>
              <div style={styles.info}>
                <span style={styles.name}>{member.name || member.email}</span>
              </div>
              <button
                className="btn btn-secondary"
                style={styles.rowBtn}
                disabled={sendingTo === member.id}
                onClick={() => handleSendRequest(member.id)}
              >
                <UserPlus size={14} />
                <span>{sendingTo === member.id ? '...' : '요청'}</span>
              </button>
            </div>
          ))}
        </Section>
      )}

      {members.length === 0 && shares.length === 0 && (
        <div style={styles.emptyWrap}>
          <MapPin size={28} color="var(--text-muted)" />
          <p style={styles.emptyText}>공유할 팀원이 없습니다</p>
        </div>
      )}

      <div style={{ height: '12px', flexShrink: 0 }} />
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>{title}</span>
        {count > 0 && <span style={styles.sectionCount}>{count}</span>}
      </div>
      {children}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  emptyWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '36px 0',
  },
  emptyText: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center',
  },

  // GPS 카드
  gpsCard: {
    padding: '14px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--bg-card-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '4px',
  },
  gpsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  gpsBtn: {
    width: '100%',
    padding: '10px',
    fontSize: '13px',
    minHeight: '40px',
  },

  // 섹션
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '4px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 4px 6px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  sectionCount: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    borderRadius: '10px',
    backgroundColor: 'var(--primary)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 700,
  },

  // 행
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--bg-card-border)',
  },
  initial: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    backgroundColor: 'rgba(99,102,241,0.15)',
    color: 'var(--primary)',
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
    gap: '3px',
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
    lineHeight: 1.3,
  },
  statusTag: {
    display: 'inline-block',
    alignSelf: 'flex-start',
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '6px',
  },
  rowActions: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  rowBtn: {
    padding: '7px 14px',
    fontSize: '12px',
    fontWeight: 600,
    minHeight: '34px',
    borderRadius: 'var(--radius-sm)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
  },
  rowBtnSmall: {
    padding: '7px 10px',
    fontSize: '12px',
    fontWeight: 600,
    minHeight: '34px',
    borderRadius: 'var(--radius-sm)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
};
