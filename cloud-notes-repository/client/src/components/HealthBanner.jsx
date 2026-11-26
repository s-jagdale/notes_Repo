import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

// Calls GET /api/health once. Shows a red banner when the backend, MongoDB or S3 is not working.
export default function HealthBanner() {
  const [problem, setProblem] = useState('');
  useEffect(() => {
    fetch((import.meta.env.VITE_API_URL || '') + '/api/health')
      .then(async (res) => {
        const h = await res.json();
        const issues = [];
        if (!h.mongodb?.ok) issues.push('MongoDB is not connected.');
        if (!h.s3?.ok) issues.push(`S3 problem: ${h.s3?.error || 'bucket not reachable'}`);
        setProblem(issues.join(' '));
      })
      .catch(() => setProblem('Cannot reach the server. Is the backend running? (run "npm run dev" inside the server folder)'));
  }, []);
  if (!problem) return null;
  return <div className="banner banner-error banner-top" role="alert"><Icon name="alert" size={16} />{problem}</div>;
}
