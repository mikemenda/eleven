// Eleven XI Logo — geometric mark on pitch texture
const Logo = ({ size = 40, showWordmark = false, className = '' }) => {
  return (
    <div
      className={`eleven-logo ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
    >
      {/* XI Mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Pitch texture background */}
        <rect width="40" height="40" rx="6" fill="#0a1520" />
        <rect width="40" height="40" rx="6" fill="url(#pitchLines)" />

        {/* XI letterform — geometric, bold */}
        {/* X left diagonal */}
        <rect
          x="6" y="8"
          width="5" height="24"
          rx="1.5"
          fill="#4ade80"
          transform="rotate(-20 13.5 20)"
        />
        {/* X right diagonal */}
        <rect
          x="15" y="8"
          width="5" height="24"
          rx="1.5"
          fill="#4ade80"
          transform="rotate(20 17.5 20)"
        />

        {/* I — vertical bar */}
        <rect x="28" y="8" width="5" height="24" rx="1.5" fill="#4ade80" />
        {/* I — top serif */}
        <rect x="25.5" y="8" width="10" height="3.5" rx="1" fill="#4ade80" />
        {/* I — bottom serif */}
        <rect x="25.5" y="28.5" width="10" height="3.5" rx="1" fill="#4ade80" />

        <defs>
          <pattern id="pitchLines" x="0" y="0" width="40" height="8" patternUnits="userSpaceOnUse">
            <rect width="40" height="8" fill="transparent" />
            <rect y="7" width="40" height="0.5" fill="rgba(74,222,128,0.06)" />
          </pattern>
        </defs>
      </svg>

      {/* Wordmark */}
      {showWordmark && (
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: size * 0.65,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#e2f5e2',
            lineHeight: 1
          }}
        >
          eleven
        </span>
      )}
    </div>
  )
}

export default Logo
