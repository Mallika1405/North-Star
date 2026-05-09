type Variant = "paper" | "calm" | "burst";

/**
 * Soft watercolor / Matisse-inspired backdrop on a cream paper base.
 * Kept extremely subtle so it never clashes with content.
 */
export function AbstractBackdrop({ variant = "paper" }: { variant?: Variant }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Paper base */}
      <div className="absolute inset-0" style={{ background: "var(--color-background)" }} />

      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1600 1000">
        <defs>
          <radialGradient id="wash1" cx="20%" cy="15%" r="55%">
            <stop offset="0%" stopColor="#e9d3d3" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#e9d3d3" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wash2" cx="85%" cy="10%" r="50%">
            <stop offset="0%" stopColor="#d6cbe6" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#d6cbe6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wash3" cx="70%" cy="95%" r="65%">
            <stop offset="0%" stopColor="#e6d2bd" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#e6d2bd" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wash4" cx="10%" cy="80%" r="50%">
            <stop offset="0%" stopColor="#cfd9c8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#cfd9c8" stopOpacity="0" />
          </radialGradient>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
            <feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.15  0 0 0 0 0.25  0 0 0 0.05 0"/>
          </filter>
        </defs>

        {/* Soft Turner-like color washes */}
        <rect width="1600" height="1000" fill="url(#wash1)" />
        <rect width="1600" height="1000" fill="url(#wash2)" />
        <rect width="1600" height="1000" fill="url(#wash3)" />
        <rect width="1600" height="1000" fill="url(#wash4)" />

        {/* Matisse-cut organic shapes — very low opacity */}
        <path d="M 120 720 Q 240 600 380 660 Q 520 720 460 820 Q 360 900 220 860 Q 80 820 120 720 Z" fill="#b96a78" opacity="0.08" />
        <path d="M 1180 160 Q 1300 80 1420 160 Q 1500 260 1380 320 Q 1240 360 1180 280 Q 1120 220 1180 160 Z" fill="#7a6db0" opacity="0.07" />
        <circle cx="1320" cy="780" r="120" fill="#c98a5a" opacity="0.07" />
        <circle cx="280" cy="220" r="60" fill="#a64248" opacity="0.06" />

        {/* Subtle paper grain */}
        <rect width="1600" height="1000" filter="url(#grain)" opacity="0.5" />
      </svg>
    </div>
  );
}
