import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getDbUserId } from '../utils/userUtils';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AnnouncementForm({ currentUser }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('rn_announcements')
      .select('*')
      .order('created_at', { ascending: false });
    setList(data || []);
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('rn_announcements').insert({
        title: title.trim(),
        content: content.trim(),
        created_by: getDbUserId(currentUser),
      });
      if (error) throw error;
      setTitle('');
      setContent('');
      await fetchAnnouncements();
    } catch (err) {
      alert('등록 실패: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id, currentActive) => {
    await supabase
      .from('rn_announcements')
      .update({ is_active: !currentActive })
      .eq('id', id);
    await fetchAnnouncements();
  };

  const handleDelete = async (id) => {
    if (!confirm('공지사항을 삭제하시겠습니까?')) return;
    await supabase.from('rn_announcements').delete().eq('id', id);
    await fetchAnnouncements();
  };

  return (
    <div style={styles.container}>
      {/* 새 공지 등록 */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>새 공지 등록</h4>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div className="input-group">
            <label className="input-label">제목</label>
            <input
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지 제목"
              maxLength={100}
            />
          </div>
          <div className="input-group">
            <label className="input-label">내용</label>
            <textarea
              className="input-field"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="공지 내용을 입력하세요"
              style={styles.textarea}
              maxLength={2000}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={styles.submitBtn}
            disabled={submitting || !title.trim() || !content.trim()}
          >
            {submitting ? '등록 중...' : '공지 등록'}
          </button>
        </form>
      </div>

      {/* 기존 공지 목록 */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>공지 목록</h4>
        {loading && <p style={styles.empty}>불러오는 중...</p>}
        {!loading && list.length === 0 && <p style={styles.empty}>등록된 공지사항이 없습니다</p>}
        {list.map((item) => (
          <div key={item.id} style={styles.listItem}>
            <div style={styles.listTop}>
              <span style={styles.listTitle}>{item.title}</span>
              <span style={{
                ...styles.statusBadge,
                backgroundColor: item.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                color: item.is_active ? 'var(--success)' : 'var(--text-muted)',
              }}>
                {item.is_active ? '활성' : '비활성'}
              </span>
            </div>
            <p style={styles.listContent}>{item.content}</p>
            <div style={styles.listFooter}>
              <span style={styles.listDate}>{formatDate(item.created_at)}</span>
              <div style={styles.listActions}>
                <button
                  className="btn btn-secondary"
                  style={styles.toggleBtn}
                  onClick={() => handleToggle(item.id, item.is_active)}
                >
                  {item.is_active ? '비활성화' : '활성화'}
                </button>
                <button
                  style={styles.deleteBtn}
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 size={14} color="var(--danger)" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: '12px', flexShrink: 0 }} />
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
    padding: '4px 0 4px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  textarea: {
    minHeight: '120px',
    resize: 'vertical',
    lineHeight: 1.5,
  },
  submitBtn: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    minHeight: '44px',
  },
  empty: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: '16px 0',
  },
  listItem: {
    padding: '12px 14px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--bg-card-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  listTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  listTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '6px',
    flexShrink: 0,
  },
  listContent: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  listFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '2px',
  },
  listDate: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  listActions: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  toggleBtn: {
    padding: '5px 10px',
    fontSize: '11px',
    fontWeight: 600,
    minHeight: '28px',
    borderRadius: 'var(--radius-sm)',
  },
  deleteBtn: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--bg-card-border)',
    backgroundColor: 'var(--bg-input)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
};
