import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Check, Calendar, User, Clock, Trash2, Edit3, ArrowRight, ShieldAlert, Send, MessageCircle } from 'lucide-react';
import { getDbUserId, isDemoUser } from '../utils/userUtils';

const MARKER_TYPES = {
  vehicle_entrance: { emoji: '🚗', label: '차량 진입구' },
  parking: { emoji: '🅿️', label: '정차/주차' },
  entrance: { emoji: '🚪', label: '출입구/공동현관' },
  elevator: { emoji: '🛗', label: '엘리베이터' },
  delivery_spot: { emoji: '📦', label: '배송 위치' },
  warning: { emoji: '⚠️', label: '주의' },
  access_code: { emoji: '🔑', label: '비번/호출' },
  important: { emoji: '⭐', label: '중요' },
};

function formatDate(dateStr) {
  if (!dateStr) return '확인 이력 없음';
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return formatDate(dateStr).slice(0, 10);
}

export default function TipDetail({ tip, currentUser, onEdit, onDelete, onVerified, onOpenRoadview }) {
  const [photos, setPhotos] = useState([]);
  const [creatorName, setCreatorName] = useState('알 수 없음');
  const [updaterName, setUpdaterName] = useState('알 수 없음');
  const [verifierName, setVerifierName] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // 댓글 상태
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const commentsBottomRef = useRef(null);
  const commentChannelRef = useRef(null);

  useEffect(() => {
    if (!tip) return;

    fetchPhotos();
    fetchUserNames();
    fetchComments();
    setShowHistory(false);

    // 실시간 댓글 구독
    if (commentChannelRef.current) {
      supabase.removeChannel(commentChannelRef.current);
    }

    commentChannelRef.current = supabase
      .channel(`tip_comments_${tip.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rn_tip_comments', filter: `tip_id=eq.${tip.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // 새 댓글: 작성자 이름 별도 조회 후 추가
            fetchSingleCommentProfile(payload.new).then((enriched) => {
              setComments((prev) => {
                // 중복 방지
                if (prev.find((c) => c.id === enriched.id)) return prev;
                return [...prev, enriched];
              });
            });
          } else if (payload.eventType === 'UPDATE') {
            setComments((prev) =>
              prev.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } : c))
            );
          }
        }
      )
      .subscribe();

    return () => {
      if (commentChannelRef.current) {
        supabase.removeChannel(commentChannelRef.current);
        commentChannelRef.current = null;
      }
    };
  }, [tip?.id]);

  const fetchPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from('rn_route_tip_photos')
        .select('*')
        .eq('tip_id', tip.id)
        .eq('is_deleted', false);
      if (error) throw error;
      setPhotos(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUserNames = async () => {
    try {
      const userIds = [tip.created_by, tip.updated_by, tip.last_verified_by].filter(Boolean);
      if (userIds.length === 0) return;

      const { data, error } = await supabase
        .from('rn_profiles')
        .select('id, name')
        .in('id', userIds);

      if (error) throw error;

      const nameMap = {};
      data.forEach((p) => { nameMap[p.id] = p.name; });

      if (tip.created_by) setCreatorName(nameMap[tip.created_by] || '탈퇴 사용자');
      if (tip.updated_by) setUpdaterName(nameMap[tip.updated_by] || '탈퇴 사용자');
      if (tip.last_verified_by) setVerifierName(nameMap[tip.last_verified_by] || '탈퇴 사용자');
    } catch (err) {
      console.error(err);
    }
  };

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const { data, error } = await supabase
        .from('rn_tip_comments')
        .select(`
          id, tip_id, content, created_at, is_deleted, created_by,
          rn_profiles ( id, name )
        `)
        .eq('tip_id', tip.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments(
        (data || []).map((c) => ({
          ...c,
          author_name: c.rn_profiles?.name || '탈퇴 사용자',
        }))
      );
    } catch (err) {
      console.error('댓글 불러오기 실패:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const fetchSingleCommentProfile = async (comment) => {
    if (!comment.created_by) return { ...comment, author_name: '알 수 없음' };
    try {
      const { data } = await supabase
        .from('rn_profiles')
        .select('id, name')
        .eq('id', comment.created_by)
        .single();
      return { ...comment, author_name: data?.name || '탈퇴 사용자' };
    } catch {
      return { ...comment, author_name: '알 수 없음' };
    }
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    const trimmed = commentInput.trim();
    if (!trimmed || trimmed.length > 500) return;
    if (isDemoUser(currentUser)) {
      alert('둘러보기 모드에서는 댓글을 작성할 수 없습니다.');
      return;
    }

    setSubmittingComment(true);
    try {
      const { error } = await supabase.from('rn_tip_comments').insert({
        tip_id: tip.id,
        content: trimmed,
        created_by: getDbUserId(currentUser),
      });
      if (error) throw error;
      setCommentInput('');
      // Realtime이 자동으로 추가하지만, demo 모드 대비 수동 갱신도 보험으로
    } catch (err) {
      alert('댓글 등록 실패: ' + err.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    setDeletingCommentId(commentId);
    try {
      const { error } = await supabase
        .from('rn_tip_comments')
        .update({ is_deleted: true })
        .eq('id', commentId);
      if (error) throw error;
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      alert('댓글 삭제 실패: ' + err.message);
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const now = new Date().toISOString();
      const dbUserId = getDbUserId(currentUser);
      const { error } = await supabase
        .from('rn_route_tips')
        .update({ last_verified_at: now, last_verified_by: dbUserId, updated_by: dbUserId })
        .eq('id', tip.id);
      if (error) throw error;
      setVerifierName(currentUser.name);
      onVerified(now, dbUserId);
    } catch (err) {
      alert('확인 상태 갱신 실패: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleFetchHistory = async () => {
    setShowHistory(true);
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('rn_route_tip_history')
        .select(`id, action, old_data, new_data, changed_at, rn_profiles ( name )`)
        .eq('tip_id', tip.id)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      setHistory((data || []).map((hist) => ({ ...hist, profiles: hist.rn_profiles })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatDiff = (hist) => {
    const oldD = hist.old_data || {};
    const newD = hist.new_data || {};
    const diffs = [];
    const keysToCompare = [
      { key: 'title', label: '제목' },
      { key: 'marker_type', label: '종류' },
      { key: 'memo', label: '메모' },
      { key: 'tags', label: '태그' },
    ];
    keysToCompare.forEach(({ key, label }) => {
      const oldVal = oldD[key];
      const newVal = newD[key];
      if (key === 'tags') {
        const oldStr = Array.isArray(oldVal) ? oldVal.join(', ') : '';
        const newStr = Array.isArray(newVal) ? newVal.join(', ') : '';
        if (oldStr !== newStr) diffs.push({ label, old: oldStr || '(없음)', new: newStr || '(없음)' });
      } else if (oldVal !== newVal) {
        let oldDisplay = oldVal;
        let newDisplay = newVal;
        if (key === 'marker_type') {
          oldDisplay = MARKER_TYPES[oldVal]?.label || oldVal;
          newDisplay = MARKER_TYPES[newVal]?.label || newVal;
        }
        diffs.push({
          label,
          old: oldDisplay == null || oldDisplay === '' ? '(없음)' : String(oldDisplay),
          new: newDisplay == null || newDisplay === '' ? '(없음)' : String(newDisplay),
        });
      }
    });
    if (diffs.length === 0) {
      if (hist.action === 'INSERT') return '새 팁이 생성되었습니다.';
      return '단순 설정이 변경되었습니다.';
    }
    return (
      <div style={styles.diffContainer}>
        {diffs.map((d, idx) => (
          <div key={idx} style={styles.diffRow}>
            <strong>{d.label}</strong>
            <span style={styles.diffOld}>{d.old}</span>
            <ArrowRight size={12} color="var(--text-secondary)" />
            <span style={styles.diffNew}>{d.new}</span>
          </div>
        ))}
      </div>
    );
  };

  const typeInfo = MARKER_TYPES[tip.marker_type] || { emoji: '📦', label: '배송팁' };

  let ageStatus = '최근 확인됨 (90일 이내)';
  let ageColor = 'var(--success)';

  if (tip.last_verified_at) {
    const days = Math.ceil(Math.abs(new Date() - new Date(tip.last_verified_at)) / (1000 * 60 * 60 * 24));
    if (days >= 180) { ageStatus = '오래된 팁 (180일 경과)'; ageColor = 'var(--danger)'; }
    else if (days >= 90) { ageStatus = '확인한 지 90일 경과'; ageColor = 'var(--warning)'; }
  } else {
    ageStatus = '미확인된 오래된 팁';
    ageColor = 'var(--danger)';
  }

  const canComment = currentUser && currentUser.role !== 'viewer';
  const activeComments = comments.filter((c) => !c.is_deleted);

  // 댓글왕 계산: 가장 많은 댓글을 단 사람(들) - 최소 2개 이상이어야 자격 부여
  const commentKingIds = (() => {
    if (activeComments.length < 2) return new Set();
    const countMap = {};
    activeComments.forEach((c) => {
      if (c.created_by) countMap[c.created_by] = (countMap[c.created_by] || 0) + 1;
    });
    const maxCount = Math.max(...Object.values(countMap));
    if (maxCount < 2) return new Set();
    return new Set(Object.entries(countMap).filter(([, cnt]) => cnt === maxCount).map(([id]) => id));
  })();

  return (
    <div style={styles.container}>
      {/* 제목 */}
      <div style={styles.titleSection}>
        <div style={styles.badge}>
          <span style={styles.badgeEmoji}>{typeInfo.emoji}</span>
          <span style={styles.badgeLabel}>{typeInfo.label}</span>
        </div>
        <h2 style={styles.mainTitle}>{tip.title}</h2>
      </div>

      {/* 유효기간 배지 */}
      <div style={{ ...styles.ageBadge, borderColor: ageColor, color: ageColor }}>
        <ShieldAlert size={14} />
        <span>{ageStatus}</span>
      </div>

      {/* 사진 */}
      {photos.length > 0 && (
        <div style={styles.photoContainer}>
          {photos.map((p) => (
            <a key={p.id} href={p.storage_path} target="_blank" rel="noopener noreferrer" style={styles.photoLink}>
              <img src={p.storage_path} alt="Tip" style={styles.img} />
            </a>
          ))}
        </div>
      )}

      {/* 메모 */}
      {tip.memo && (
        <div style={styles.memoBox}>
          <p style={styles.memoText}>{tip.memo}</p>
        </div>
      )}

      {/* 태그 */}
      {tip.tags && tip.tags.length > 0 && (
        <div style={styles.tagGroup}>
          {tip.tags.map((tag, idx) => (
            <span key={idx} style={styles.tag}>#{tag}</span>
          ))}
        </div>
      )}

      {/* 메타 정보 */}
      <div className="glass" style={styles.metaPanel}>
        <div style={styles.metaRow}>
          <User size={14} color="var(--text-secondary)" />
          <span>등록: <strong>{creatorName}</strong> ({formatDate(tip.created_at)})</span>
        </div>
        <div style={styles.metaRow}>
          <Clock size={14} color="var(--text-secondary)" />
          <span>수정: <strong>{updaterName}</strong> ({formatDate(tip.updated_at)})</span>
        </div>
        <div style={styles.metaRow}>
          <Calendar size={14} color="var(--text-secondary)" />
          <span>최종 확인: <strong>{verifierName || '없음'}</strong> ({formatDate(tip.last_verified_at)})</span>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div style={styles.actionsContainer}>
        <div style={styles.subActions}>
          {currentUser && currentUser.role !== 'viewer' ? (
            <>
              <button className="btn btn-secondary" style={styles.subBtn} onClick={handleVerify} disabled={verifying}>
                <Check size={16} color="var(--success)" />
                <span>{verifying ? '확인 중...' : '이 팁 아직 맞음'}</span>
              </button>
              <button className="btn btn-secondary" style={styles.subBtn} onClick={handleFetchHistory}>
                <span>이력 보기</span>
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" style={{ ...styles.subBtn, flex: 1 }} onClick={handleFetchHistory}>
              <span>변경 이력 보기</span>
            </button>
          )}
        </div>

        {currentUser && currentUser.role !== 'viewer' && (
          <div style={styles.subActions}>
            <button className="btn btn-secondary" style={styles.subBtn} onClick={() => onEdit(tip)}>
              <Edit3 size={16} color="var(--primary)" />
              <span>수정</span>
            </button>
            {currentUser.role === 'admin' && (
              <button
                className="btn btn-danger"
                style={styles.deleteBtn}
                onClick={() => { if (confirm('이 배송팁을 정말 삭제하시겠습니까? (숨김 처리됨)')) onDelete(tip.id); }}
              >
                <Trash2 size={16} />
                <span>삭제</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── 댓글 섹션 ─── */}
      <div style={styles.commentSection}>
        {/* 헤더 */}
        <div style={styles.commentHeader}>
          <MessageCircle size={16} color="var(--primary)" />
          <span style={styles.commentHeaderText}>
            댓글
            {activeComments.length > 0 && (
              <span style={styles.commentCount}>{activeComments.length}</span>
            )}
          </span>
        </div>

        {/* 댓글 목록 */}
        <div style={styles.commentList}>
          {loadingComments && (
            <p style={styles.commentEmpty}>댓글을 불러오는 중...</p>
          )}
          {!loadingComments && activeComments.length === 0 && (
            <p style={styles.commentEmpty}>
              {canComment ? '첫 댓글을 남겨보세요 👇' : '아직 댓글이 없습니다.'}
            </p>
          )}
          {!loadingComments && activeComments.map((comment) => {
            const isOwn = comment.created_by === currentUser?.id;
            const isAdmin = currentUser?.role === 'admin';
            const canDelete = (isOwn || isAdmin) && !isDemoUser(currentUser);
            const isDeleting = deletingCommentId === comment.id;
            const isKing = comment.created_by && commentKingIds.has(comment.created_by);
            const displayName = isOwn ? '나' : comment.author_name;

            return (
              <div key={comment.id} style={{ ...styles.commentItem, ...(isOwn ? styles.commentItemOwn : {}) }}>
                <div style={{
                  ...styles.commentBubble,
                  ...(isKing ? styles.commentBubbleKing : {}),
                }}>
                  <div style={styles.commentMeta}>
                    <span style={{ ...styles.commentAuthor, ...(isOwn ? { color: 'var(--primary)' } : {}) }}>
                      {displayName}
                    </span>
                    {isKing && (
                      <span style={styles.kingBadge} title="댓글왕">
                        👑 댓글왕
                      </span>
                    )}
                    <span style={styles.commentTime}>{formatRelativeTime(comment.created_at)}</span>
                    {canDelete && (
                      <button
                        style={styles.commentDeleteBtn}
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={isDeleting}
                        title="댓글 삭제"
                      >
                        <Trash2 size={11} color={isDeleting ? 'var(--text-muted)' : 'var(--danger)'} />
                      </button>
                    )}
                  </div>
                  <p style={styles.commentContent}>{comment.content}</p>
                </div>
              </div>
            );
          })}
          <div ref={commentsBottomRef} />
        </div>

        {/* 댓글 입력창 */}
        {canComment ? (
          <form onSubmit={handleSubmitComment} style={styles.commentForm}>
            <input
              type="text"
              className="input-field"
              style={styles.commentInput}
              placeholder="댓글을 입력하세요... (최대 500자)"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              maxLength={500}
              disabled={submittingComment}
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={styles.commentSendBtn}
              disabled={submittingComment || !commentInput.trim()}
            >
              <Send size={16} />
            </button>
          </form>
        ) : (
          <p style={styles.commentViewerNote}>둘러보기 모드에서는 댓글을 작성할 수 없습니다.</p>
        )}
      </div>

      {/* 이력 모달 */}
      {showHistory && (
        <div style={styles.historyOverlay}>
          <div className="glass" style={styles.historyCard}>
            <div style={styles.historyHeader}>
              <h3 style={styles.historyTitle}>팁 수정 이력</h3>
              <button style={styles.historyClose} onClick={() => setShowHistory(false)}>✕</button>
            </div>
            <div style={styles.historyContent}>
              {loadingHistory && <p style={styles.centerText}>이력을 불러오는 중...</p>}
              {!loadingHistory && history.length === 0 && (
                <p style={styles.centerText}>수정 이력이 존재하지 않습니다.</p>
              )}
              {!loadingHistory && history.map((hist) => (
                <div key={hist.id} style={styles.historyItem}>
                  <div style={styles.historyMeta}>
                    <span style={styles.historyUser}>{hist.profiles?.name || '탈퇴 사용자'}</span>
                    <span style={styles.historyTime}>{formatDate(hist.changed_at)}</span>
                    <span style={{
                      ...styles.historyAction,
                      backgroundColor: hist.action === 'INSERT' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color: hist.action === 'INSERT' ? 'var(--success)' : 'var(--primary)',
                    }}>{hist.action}</span>
                  </div>
                  <div style={styles.historyDiff}>{formatDiff(hist)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', width: '100%' },
  titleSection: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', marginBottom: '12px' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', backgroundColor: 'var(--bg-input)', borderRadius: '10px', border: '1px solid var(--bg-card-border)' },
  badgeEmoji: { fontSize: '14px' },
  badgeLabel: { fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' },
  mainTitle: { fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: '1.2' },
  ageBadge: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid', fontSize: '12px', fontWeight: '600', marginBottom: '16px', backgroundColor: 'var(--bg-input)' },
  photoContainer: { display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' },
  photoLink: { width: '100px', height: '100px', borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--bg-card-border)' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  memoBox: { padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--bg-card-border)', marginBottom: '16px' },
  memoText: { fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.5', whiteSpace: 'pre-wrap' },
  tagGroup: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' },
  tag: { fontSize: '12px', color: 'var(--primary)', fontWeight: '500' },
  metaPanel: { padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--bg-card-border)', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' },
  metaRow: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' },
  actionsContainer: { display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', marginTop: '8px' },
  subActions: { display: 'flex', gap: '8px', width: '100%' },
  subBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '12px 8px', fontSize: '13px', whiteSpace: 'nowrap' },
  deleteBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '12px 8px', fontSize: '13px', backgroundColor: 'var(--danger)', color: '#FFFFFF', border: 'none', whiteSpace: 'nowrap' },

  // ─── 댓글 섹션 ───
  commentSection: {
    marginTop: '28px',
    borderTop: '1px solid var(--bg-card-border)',
    paddingTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  commentHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  commentHeaderText: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  commentCount: {
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
    fontWeight: '700',
  },
  commentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: '40px',
  },
  commentEmpty: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: '12px 0',
  },
  commentItem: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  commentItemOwn: {
    justifyContent: 'flex-end',
  },
  commentBubble: {
    maxWidth: '85%',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--bg-card-border)',
    borderRadius: '12px',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  commentMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  commentAuthor: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
  },
  commentTime: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    flex: 1,
  },
  commentDeleteBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
    opacity: 0.7,
  },
  commentContent: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    lineHeight: '1.45',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  commentBubbleKing: {
    borderColor: 'rgba(251, 191, 36, 0.5)',
    backgroundColor: 'rgba(251, 191, 36, 0.06)',
  },
  kingBadge: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#D97706',
    backgroundColor: 'rgba(251, 191, 36, 0.18)',
    border: '1px solid rgba(251, 191, 36, 0.4)',
    borderRadius: '8px',
    padding: '1px 6px',
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  },
  commentForm: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  commentInput: {
    flex: 1,
    fontSize: '13px',
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    minHeight: '42px',
  },
  commentSendBtn: {
    width: '42px',
    height: '42px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-sm)',
    padding: 0,
  },
  commentViewerNote: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // 이력 모달
  historyOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  historyCard: { width: '100%', maxWidth: '440px', maxHeight: '75vh', borderRadius: 'var(--radius-lg)', border: '1px solid var(--bg-card-border)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' },
  historyHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--bg-card-border)' },
  historyTitle: { fontSize: '16px', fontWeight: '700' },
  historyClose: { border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: '18px', cursor: 'pointer' },
  historyContent: { flex: 1, overflowY: 'auto', padding: '20px' },
  centerText: { textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)', padding: '24px 0' },
  historyItem: { paddingBottom: '16px', marginBottom: '16px', borderBottom: '1px solid var(--bg-card-border)' },
  historyMeta: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
  historyUser: { fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' },
  historyTime: { fontSize: '11px', color: 'var(--text-muted)' },
  historyAction: { fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' },
  historyDiff: { padding: '8px 12px', backgroundColor: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '13px' },
  diffContainer: { display: 'flex', flexDirection: 'column', gap: '6px' },
  diffRow: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  diffOld: { color: 'var(--text-muted)', textDecoration: 'line-through' },
  diffNew: { color: 'var(--success)', fontWeight: '500' },
};
