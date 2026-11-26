import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatSize } from '../utils.js';
import Icon from '../components/Icon.jsx';

export default function Upload() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [meta, setMeta] = useState({ subjects: [], categories: ['Notes'], maxFileMb: 20 });
  const [form, setForm] = useState({ title: '', subject: '', semester: '1', category: 'Notes', description: '' });
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { api.get('/api/notes/meta').then(setMeta).catch(() => {}); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Used by both the file picker and drag-and-drop.
  function acceptFile(f) {
    setError('');
    if (!f) return setFile(null);
    // Quick checks in the browser. The server checks everything again (never trust the client).
    if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== 'application/pdf')) {
      setFile(null);
      return setError('Only PDF files are allowed. Choose a file that ends in .pdf.');
    }
    if (f.size > meta.maxFileMb * 1024 * 1024) {
      setFile(null);
      return setError(`This file is ${formatSize(f.size)}. The maximum size is ${meta.maxFileMb} MB.`);
    }
    setFile(f);
    if (!form.title) setForm({ ...form, title: f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ') });
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files[0]);
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return setError('Choose a PDF file first.');
    setBusy(true); setError(''); setSuccess(''); setProgress(0);
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    body.append('file', file); // the file must be appended LAST
    try {
      const { note } = await api.upload('/api/notes', body, setProgress);
      setSuccess(`"${note.title}" is saved in S3 and listed in the database.`);
      setFile(null);
      setForm({ ...form, title: '', description: '' });
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Upload notes</h1>
        <p>PDF files up to {meta.maxFileMb} MB. Each upload goes to private S3 storage and gets a record in MongoDB.</p>
      </div>
      {error && <div className="banner banner-error" role="alert" style={{ marginBottom: 18 }}><Icon name="alert" size={16} />{error}</div>}
      {success && (
        <div className="banner banner-ok" role="status" style={{ marginBottom: 18 }}>
          <Icon name="check" size={16} />
          <span>{success} <button type="button" className="link" onClick={() => navigate('/')}>Go to Browse</button></span>
        </div>
      )}
      <form className="upload-grid" onSubmit={submit}>
        <label
          className={`drop ${dragging ? 'is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={(e) => { acceptFile(e.target.files[0]); e.target.value = ''; }} />
          <span className="drop-icon"><Icon name="upload" size={26} /></span>
          {file ? (
            <>
              <span className="file-chip"><Icon name="file" size={16} />{file.name} ({formatSize(file.size)})</span>
              <span className="muted small">Click or drop another file to replace it.</span>
            </>
          ) : (
            <>
              <strong>Drop a PDF here</strong>
              <span className="muted">or click to choose a file</span>
            </>
          )}
        </label>

        <div className="panel form">
          <label>Title
            <input value={form.title} onChange={set('title')} required minLength={3} maxLength={120} placeholder="Unit 1: Cloud Computing Foundations" />
          </label>
          <div className="row">
            <label>Subject
              <input list="subjects" value={form.subject} onChange={set('subject')} required minLength={2} maxLength={60} placeholder="Cloud Computing" />
              <datalist id="subjects">{meta.subjects.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <label>Semester
              <select value={form.semester} onChange={set('semester')}>{[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>Semester {s}</option>)}</select>
            </label>
          </div>
          <label>Category
            <select value={form.category} onChange={set('category')}>{meta.categories.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label>Description <span className="field-note">(optional)</span>
            <textarea rows={3} maxLength={500} value={form.description} onChange={set('description')} placeholder="What does this PDF cover?" />
          </label>
          {busy && (
            <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${progress}%` }} />
              <span>{progress < 100 ? `Uploading ${progress}%` : 'Saving to S3 and the database…'}</span>
            </div>
          )}
          <button className="btn btn-primary" disabled={busy}><Icon name="upload" size={17} />{busy ? 'Uploading…' : 'Upload note'}</button>
        </div>
      </form>
    </>
  );
}
