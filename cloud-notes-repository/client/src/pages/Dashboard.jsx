import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatDate } from '../utils.js';
import NoteCard from '../components/NoteCard.jsx';
import Icon from '../components/Icon.jsx';

function MiniList({ title, notes, empty, extra, ranked = false }) {
  const Tag = ranked ? 'ol' : 'ul';
  return (
    <div className="panel">
      <h3>{title}</h3>
      {notes.length === 0 ? <p className="muted small" style={{ marginTop: 8 }}>{empty}</p> : (
        <Tag className="mini-list">
          {notes.map((n) => (
            <li key={n.id}><span>{n.title}<small>{n.subject}, Semester {n.semester}</small></span><em>{extra(n)}</em></li>
          ))}
        </Tag>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [mine, setMine] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([api.get('/api/notes/stats'), api.get('/api/notes?mine=1&limit=50')]);
      setStats(s); setMine(m.notes); setError('');
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(note) {
    if (!window.confirm(`Delete "${note.title}" permanently?`)) return;
    try { await api.del(`/api/notes/${note.id}`); await load(); } catch (err) { setError(err.message); }
  }

  if (!stats) return error ? <div className="banner banner-error" role="alert"><Icon name="alert" size={16} />{error}</div> : <p className="center muted">Loading dashboard…</p>;

  const tallest = Math.max(1, ...stats.bySemester.map((x) => x.count));

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Dashboard</h1>
        <p>A summary of the shelf and your own uploads.</p>
      </div>
      {error && <div className="banner banner-error" role="alert"><Icon name="alert" size={16} />{error}</div>}

      <dl className="stat-strip">
        <div><dt>Notes available</dt><dd>{stats.totalNotes}</dd></div>
        <div><dt>Uploaded by you</dt><dd>{stats.myNotes}</dd></div>
        <div><dt>Total downloads</dt><dd>{stats.totalDownloads}</dd></div>
        <div><dt>Semesters covered</dt><dd>{stats.bySemester.length}</dd></div>
      </dl>

      <div className="two-col">
        <MiniList title="Recently uploaded" notes={stats.recent} empty="Nothing has been uploaded yet." extra={(n) => formatDate(n.createdAt)} />
        <MiniList title="Most downloaded" ranked notes={stats.popular} empty="No downloads yet." extra={(n) => `${n.downloadCount} ${n.downloadCount === 1 ? 'download' : 'downloads'}`} />
      </div>

      <div className="panel">
        <h3>Notes per semester</h3>
        {stats.bySemester.length === 0 ? <p className="muted small">No notes yet.</p> : (
          <div className="shelf" role="img" aria-label={stats.bySemester.map((s) => `Semester ${s.semester}: ${s.count}`).join(', ')}>
            {stats.bySemester.map((s) => (
              <div key={s.semester} className={`shelf-col ${s.count === tallest ? 'is-top' : ''}`} style={{ height: `${28 + (s.count / tallest) * 72}%` }}>
                <b>{s.count}</b>
                <div className="shelf-spine" style={{ flex: 1 }}><span>Semester {s.semester}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ marginBottom: 14 }}>Your uploads</h2>
        {mine.length === 0 ? (
          <div className="panel empty">
            <p className="muted">You have not uploaded anything yet.</p>
            <Link className="btn btn-primary" to="/upload"><Icon name="upload" size={16} />Upload your first note</Link>
          </div>
        ) : (
          <div className="notes">{mine.map((n) => <NoteCard key={n.id} note={n} onDelete={remove} onError={setError} />)}</div>
        )}
      </div>
    </div>
  );
}
