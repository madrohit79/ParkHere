import React, { useState, useEffect } from 'react';

export function Countdown({ deadline, serverTime, onExpire }) {
  // Compute difference between client clock and server authoritative time
  const [clockOffset] = useState(() => {
    if (!serverTime) return 0;
    return new Date(serverTime).getTime() - Date.now();
  });

  const targetMs = new Date(deadline).getTime();

  function getRemainingSeconds() {
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
  }, [deadline, serverTime]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isUrgent = secondsLeft <= 180 && secondsLeft > 0; // <= 3 minutes
  const isExpired = secondsLeft <= 0;

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
