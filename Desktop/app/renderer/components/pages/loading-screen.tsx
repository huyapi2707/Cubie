/**
 * Full-screen loading overlay shown while the app store is hydrating
 * persisted data from disk. Always renders in light theme since the
 * user's theme preference hasn't loaded yet at this point.
 */
export function LoadingScreen() {

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        background: '#f8f9fb',
        transition: 'opacity 0.35s ease',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        {/* Microphone with pulsing rings */}
        <div className="loading-mic-wrapper">
          {/* Pulse rings */}
          <div className="loading-pulse-ring" />
          <div className="loading-pulse-ring loading-pulse-ring-2" />

          {/* Mic icon (SVG) */}
          <svg
            className="loading-mic-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" fill="rgba(37, 99, 235, 0.85)" />
            <path
              d="M5 11a7 7 0 0 0 14 0"
              stroke="rgba(37, 99, 235, 0.6)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <line
              x1="12" y1="18" x2="12" y2="22"
              stroke="rgba(37, 99, 235, 0.5)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <line
              x1="9" y1="22" x2="15" y2="22"
              stroke="rgba(37, 99, 235, 0.4)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>

          {/* Sound bars flanking the mic */}
          <div className="loading-bars loading-bars-left">
            <span /><span /><span />
          </div>
          <div className="loading-bars loading-bars-right">
            <span /><span /><span />
          </div>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: '0.78rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#7b8794',
            fontWeight: 500,
          }}
        >
          Starting up…
        </p>
      </div>

      {/* Thin progress bar at bottom */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: '#e2e6ea',
          overflow: 'hidden',
        }}
      >
        <div className="loading-bar" />
      </div>

      <style>{`
        /* ── Mic wrapper ─────────────────────────────────────────────────── */
        .loading-mic-wrapper {
          position: relative;
          width: 72px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .loading-mic-icon {
          width: 30px;
          height: 30px;
          position: relative;
          z-index: 2;
          filter: drop-shadow(0 2px 6px rgba(37, 99, 235, 0.18));
        }

        /* ── Pulse rings ─────────────────────────────────────────────────── */
        .loading-pulse-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid rgba(37, 99, 235, 0.25);
          animation: loading-pulse 2s ease-out infinite;
        }

        .loading-pulse-ring-2 {
          animation-delay: 0.8s;
        }

        @keyframes loading-pulse {
          0%   { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(1.6); opacity: 0; }
        }

        /* ── Soundwave bars ──────────────────────────────────────────────── */
        .loading-bars {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 3px;
          z-index: 2;
        }

        .loading-bars-left  { right: calc(50% + 22px); flex-direction: row-reverse; }
        .loading-bars-right { left:  calc(50% + 22px); }

        .loading-bars span {
          display: block;
          width: 3px;
          border-radius: 2px;
          background: rgba(37, 99, 235, 0.55);
          animation: loading-wave 1.2s ease-in-out infinite;
        }

        .loading-bars span:nth-child(1) { height: 10px; animation-delay: 0s; }
        .loading-bars span:nth-child(2) { height: 18px; animation-delay: 0.15s; }
        .loading-bars span:nth-child(3) { height: 8px;  animation-delay: 0.3s; }

        @keyframes loading-wave {
          0%, 100% { transform: scaleY(0.5); opacity: 0.4; }
          50%      { transform: scaleY(1);   opacity: 1; }
        }

        /* ── Progress bar ────────────────────────────────────────────────── */
        .loading-bar {
          position: absolute;
          top: 0;
          left: -40%;
          width: 40%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(37, 99, 235, 0.8),
            transparent
          );
          animation: loading-sweep 1.4s ease-in-out infinite;
          border-radius: 2px;
        }

        @keyframes loading-sweep {
          0%   { left: -40%; }
          100% { left: 140%; }
        }
      `}</style>
    </div>
  );
}
