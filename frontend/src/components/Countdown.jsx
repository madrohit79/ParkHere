import React, { useState, useEffect } from 'react';

export function Countdown({ deadline, targetTime, serverTime, label, onExpire }) {
  const effectiveDeadline = deadline || targetTime;

  // Compute difference between client clock and server authoritative time
  const [clockOffset, setClockOffset] = useState(() => {
    if (!serverTime) return 0;
    const s = new Date(serverTime).getTime();
    return isNaN(s) ? 0 : s - Date.now();
  });

  useEffect(() => {
    if (serverTime) {
      const s = new Date(serverTime).getTime();
      if (!isNaN(s)) {
        setClockOffset(s - Date.now());
      }
    }
  }, [serverTime]);

  function getRemainingSeconds() {
    if (!effectiveDeadline) return 0;
    const targetMs = new Date(effectiveDeadline).getTime();
    if (isNaN(targetMs)) return 0;
    const currentAdjustedTime = Date.now() + clockOffset;
    return Math.max(0, Math.floor((targetMs - currentAdjustedTime) / 1000));
  }

  const [secondsLeft, setSecondsLeft] = useState(getRemainingSeconds);

  useEffect(() => {
    setSecondsLeft(getRemainingSeconds());

    const interval = setInterval(() => {
      const remaining = getRemainingSeconds();
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        if (onExpire) {
          onExpire();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [effectiveDeadline, clockOffset]);

  if (!effectiveDeadline) {
    return (
      <div className="inline-flex items-center gap-1.5 font-mono px-3 py-1.5 rounded-md border text-sm font-semibold bg-stone-100 text-charcoalMuted border-warmgrey">
        <span>--:--</span>
      </div>
    );
  }

  const targetMs = new Date(effectiveDeadline).getTime();
  if (isNaN(targetMs)) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Countdown] Invalid deadline timestamp provided:', effectiveDeadline);
    }
    return (
      <div className="inline-flex items-center gap-1.5 font-mono px-3 py-1.5 rounded-md border text-sm font-semibold bg-stone-100 text-charcoalMuted border-warmgrey" title="Invalid timestamp">
        <span>--:--</span>
      </div>
    );
  }

  const safeSeconds = isNaN(secondsLeft) || secondsLeft < 0 ? 0 : secondsLeft;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isUrgent = safeSeconds <= 180 && safeSeconds > 0; // <= 3 minutes
  const isExpired = safeSeconds <= 0;

  return (
    <div className={`inline-flex items-center gap-1.5 font-mono px-3 py-1.5 rounded-md border text-sm font-bold shadow-xs ${
      isExpired
        ? 'bg-rose-50 text-rose-900 border-rose-300'
        : isUrgent
        ? 'bg-amber-100 text-amber-950 border-amber-400 animate-pulse'
        : 'bg-surfaceSoft text-charcoal border-warmgrey'
    }`}>
      <svg className={`w-4 h-4 ${isUrgent ? 'text-amber-700' : 'text-charcoalMuted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{isExpired ? '00:00 (Expired)' : formatted}</span>
    </div>
  );
}

export default Countdown;
