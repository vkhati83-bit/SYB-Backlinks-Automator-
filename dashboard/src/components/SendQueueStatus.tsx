'use client';

import { useState, useEffect, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface QueueStatus {
  pending_review: number;
  approved: number;
  sent: number;
  sent_today: number;
}

export default function SendQueueStatus() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [prevApproved, setPrevApproved] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/emails/queue-status`);
      if (res.ok) {
        const data: QueueStatus = await res.json();
        setStatus(prev => {
          if (prev) setPrevApproved(prev.approved);
          return data;
        });
      }
    } catch {
      // Ignore errors silently
    }
  };

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Don't render if nothing is happening
  if (!status || (status.approved === 0 && status.pending_review === 0)) {
    return null;
  }

  const total = status.approved + status.sent_today;
  const progress = total > 0 ? Math.round((status.sent_today / total) * 100) : 0;
  const isActive = status.approved > 0;

  return (
    <div className={`mx-3 mb-3 p-3 rounded-lg border ${
      isActive ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        {isActive ? (
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        ) : (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        <span className={`text-xs font-medium ${isActive ? 'text-blue-700' : 'text-green-700'}`}>
          {isActive ? 'Sending Emails' : 'Queue Complete'}
        </span>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="w-full bg-blue-200 rounded-full h-1.5 mb-2">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all duration-1000"
            style={{ width: `${Math.max(progress, 3)}%` }}
          />
        </div>
      )}

      <div className="flex justify-between text-xs">
        <span className={isActive ? 'text-blue-600' : 'text-green-600'}>
          {status.approved > 0 ? `${status.approved} in queue` : 'All sent'}
        </span>
        <span className={isActive ? 'text-blue-600' : 'text-green-600'}>
          {status.sent_today} sent today
        </span>
      </div>

      {status.pending_review > 0 && (
        <div className="text-xs text-amber-600 mt-1">
          {status.pending_review} pending review
        </div>
      )}
    </div>
  );
}
