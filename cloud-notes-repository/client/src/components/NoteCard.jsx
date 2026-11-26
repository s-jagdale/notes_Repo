import { useState } from 'react';
import { formatDate, formatSize, openNote, subjectColor } from '../utils.js';
import Icon from './Icon.jsx';

// One note, drawn as a binder: coloured spine (colour comes from the subject) + details + actions.
export default function NoteCard({ note, onDelete, onError }) {
  const [busy, setBusy] = useState('');

  async function open(mode) {
    setBusy(mode);
    try {
      await openNote(note, mode);
      onError('');
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <article className="binder" style={{ '--spine': subjectColor(note.subject) }}>
      <div className="spine"><span>Semester {note.semester}</span></div>
      <div className="binder-body">
        <h3>{note.title}</h3>
        <div className="tags">
          <span className="tag tag-subject">{note.subject}</span>
          <span className="tag">{note.category}</span>
        </div>
        {note.description && <p className="desc">{note.description}</p>}
        <ul className="facts">
          <li><Icon name="user" size={14} />{note.uploader}</li>
          <li><Icon name="calendar" size={14} />{formatDate(note.createdAt)}</li>
          <li><Icon name="file" size={14} />{formatSize(note.sizeBytes)}</li>
          <li><Icon name="download" size={14} />{note.downloadCount} {note.downloadCount === 1 ? 'download' : 'downloads'}</li>
        </ul>
      </div>
      <div className="binder-actions">
        <button className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => open('view')}>
          <Icon name="eye" size={16} />{busy === 'view' ? 'Opening…' : 'View'}
        </button>
        <button className="btn btn-quiet btn-sm" disabled={Boolean(busy)} onClick={() => open('download')}>
          <Icon name="download" size={16} />{busy === 'download' ? 'Preparing…' : 'Download'}
        </button>
        {note.canDelete && (
          <button className="btn btn-danger btn-sm btn-trash push-right" onClick={() => onDelete(note)} aria-label={`Delete ${note.title}`} title="Delete this note">
            <Icon name="trash" size={17} />
          </button>
        )}
      </div>
    </article>
  );
}
