import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { store } from '../utils.js';
import NoteCard from '../components/NoteCard.jsx';
import Icon from '../components/Icon.jsx';

const EMPTY = { search: '', semester: '', subject: '', category: '', sort: 'recent' };

export default function Browse() {
  const [filters, setFilters] = useState(EMPTY);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [layout, setLayout] = useState(store.get('notes_layout', 'grid'));
  const [meta, setMeta] = useState({ subjects: [], semesters: [], categories: [] });
  const [data, setData] = useState({ notes: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // wait 350 ms after typing stops before searching
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(filters.search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [filters.search]);

  const loadMeta = useCallback(() => api.get('/api/notes/meta').then(setMeta).catch(() => {}), []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ page, limit: 9, sort: filters.sort });
    if (debouncedSearch) q.set('search', debouncedSearch);
    if (filters.semester) q.set('semester', filters.semester);
    if (filters.subject) q.set('subject', filters.subject);
    if (filters.category) q.set('category', filters.category);
    try {
      setData(await api.get(`/api/notes?${q}`));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filters.semester, filters.subject, filters.category, filters.sort]);
  useEffect(() => { load(); }, [load]);

  const setFilter = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); };
  const pickSemester = (s) => { setFilters({ ...filters, semester: s }); setPage(1); };
  const chooseLayout = (l) => { setLayout(l); store.set('notes_layout', l); };
  const reset = () => { setFilters(EMPTY); setPage(1); };
  const hasFilters = Boolean(filters.search || filters.semester || filters.subject || filters.category);

  async function remove(note) {
    if (!window.confirm(`Delete "${note.title}" permanently? The PDF will also be removed from S3.`)) return;
    try {
      await api.del(`/api/notes/${note.id}`);
      await Promise.all([load(), loadMeta()]);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <section className="hero">
        <h1>Find the notes you need</h1>
        <p>Search every uploaded PDF, or pick your semester below.</p>
        <div className="search">
          <Icon name="search" size={20} />
          <label className="sr-only" htmlFor="search">Search notes</label>
          <input id="search" type="search" placeholder="Search by title, subject or keyword" value={filters.search} onChange={setFilter('search')} />
        </div>
      </section>

      <div className="tabs" role="group" aria-label="Semester">
        <button className="tab" aria-pressed={filters.semester === ''} onClick={() => pickSemester('')}>All semesters</button>
        {meta.semesters.map((s) => (
          <button key={s} className="tab" aria-pressed={filters.semester === String(s)} onClick={() => pickSemester(String(s))}>Semester {s}</button>
        ))}
      </div>

      <div className="toolbar">
        <p className="count" aria-live="polite">{loading && !data.notes.length ? 'Loading notes…' : `${data.total} ${data.total === 1 ? 'note' : 'notes'}`}</p>
        <label className="sr-only" htmlFor="f-subject">Subject</label>
        <select id="f-subject" value={filters.subject} onChange={setFilter('subject')}>
          <option value="">All subjects</option>
          {meta.subjects.map((s) => <option key={s}>{s}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-cat">Category</label>
        <select id="f-cat" value={filters.category} onChange={setFilter('category')}>
          <option value="">All categories</option>
          {meta.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-sort">Sort by</label>
        <select id="f-sort" value={filters.sort} onChange={setFilter('sort')}>
          <option value="recent">Recently uploaded</option>
          <option value="popular">Most downloaded</option>
          <option value="title">Title A to Z</option>
        </select>
        {hasFilters && <button className="btn btn-quiet btn-sm" onClick={reset}>Clear filters</button>}
        <div className="seg" role="group" aria-label="Layout">
          <button aria-pressed={layout === 'grid'} onClick={() => chooseLayout('grid')} aria-label="Grid view" title="Grid view"><Icon name="grid" size={17} /></button>
          <button aria-pressed={layout === 'list'} onClick={() => chooseLayout('list')} aria-label="List view" title="List view"><Icon name="list" size={17} /></button>
        </div>
      </div>

      {error && <div className="banner banner-error" role="alert"><Icon name="alert" size={16} />{error}</div>}

      {!loading && data.notes.length === 0 ? (
        <div className="panel empty">
          {hasFilters ? (
            <>
              <h3>No notes match these filters</h3>
              <p className="muted">Try a different keyword or clear the filters to see everything.</p>
              <button className="btn btn-quiet" onClick={reset}>Clear filters</button>
            </>
          ) : (
            <>
              <h3>The shelf is empty</h3>
              <p className="muted">No notes have been added yet. Upload the first PDF, or ask an admin to import files that are already in S3.</p>
              <Link className="btn btn-primary" to="/upload"><Icon name="upload" size={16} />Upload a note</Link>
            </>
          )}
        </div>
      ) : (
        <div className={`notes ${layout === 'list' ? 'is-list' : ''}`}>
          {data.notes.map((n) => <NoteCard key={n.id} note={n} onDelete={remove} onError={setError} />)}
        </div>
      )}

      {data.pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button className="btn btn-quiet btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="chevronLeft" size={16} />Previous</button>
          <span>Page {page} of {data.pages}</span>
          <button className="btn btn-quiet btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next<Icon name="chevronRight" size={16} /></button>
        </nav>
      )}
    </>
  );
}
