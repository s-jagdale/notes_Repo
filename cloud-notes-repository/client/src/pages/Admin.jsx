import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

export default function Admin() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setReport(await api.get('/api/admin/s3-report')); setError(''); } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(path, describe) {
    setBusy(true); setMessage(''); setError('');
    try { setMessage(describe(await api.post(path, {}))); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const inSync = report && report.inS3NotInDb.length === 0 && report.inDbNotInS3.length === 0;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Admin</h1>
        <p>Compares the files in your S3 bucket with the records in MongoDB, and repairs the differences.</p>
      </div>
      {error && <div className="banner banner-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {message && <div className="banner banner-ok" role="status"><Icon name="check" size={16} />{message}</div>}
      {!report ? <p className="center muted">Scanning the bucket…</p> : (
        <>
          <dl className="stat-strip">
            <div><dt>Files in S3</dt><dd>{report.s3ObjectCount}</dd></div>
            <div><dt>Records in MongoDB</dt><dd>{report.dbNoteCount}</dd></div>
            <div className={report.inS3NotInDb.length ? 'is-warn' : ''}><dt>In S3, no database record</dt><dd>{report.inS3NotInDb.length}</dd></div>
            <div className={report.inDbNotInS3.length ? 'is-warn' : ''}><dt>In database, file missing</dt><dd>{report.inDbNotInS3.length}</dd></div>
          </dl>
          {inSync && <div className="banner banner-ok"><Icon name="check" size={16} />S3 and MongoDB are in sync.</div>}

          <div className="panel">
            <h3>Files in S3 without a database record</h3>
            <p className="muted small">Usually files uploaded directly in the AWS console. Import creates a record for each PDF stored as <code>Semester-N/Subject/file.pdf</code>.</p>
            {report.inS3NotInDb.length > 0 && (
              <ul className="mini-list">{report.inS3NotInDb.map((o) => <li key={o.key}><span><code>{o.key}</code></span></li>)}</ul>
            )}
            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy || report.inS3NotInDb.length === 0}
              onClick={() => run('/api/admin/sync-s3', (r) => `Imported ${r.imported.length} file(s). Skipped ${r.skipped.length} (wrong folder layout or not a PDF).`)}>
              <Icon name="download" size={16} />Import from S3
            </button>
          </div>

          <div className="panel">
            <h3>Database records whose file is missing in S3</h3>
            <p className="muted small">These notes cannot be opened. Removing them deletes only the database records, and the S3 files are untouched.</p>
            {report.inDbNotInS3.length > 0 && (
              <ul className="mini-list">{report.inDbNotInS3.map((n) => <li key={n.id}><span>{n.title}<small><code>{n.s3Key}</code></small></span></li>)}</ul>
            )}
            <button className="btn btn-quiet" style={{ marginTop: 12 }} disabled={busy || report.inDbNotInS3.length === 0}
              onClick={() => run('/api/admin/remove-broken', (r) => `Removed ${r.removed.length} broken record(s).`)}>
              <Icon name="trash" size={16} />Remove broken records
            </button>
          </div>
          <div><button className="btn btn-quiet" onClick={load} disabled={busy}>Scan again</button></div>
        </>
      )}
    </div>
  );
}
