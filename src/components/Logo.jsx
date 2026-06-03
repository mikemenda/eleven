// Eleven XI Logo — geometric mark
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
        {/* Dark background */}
        <rect width="40" height="40" rx="6" fill="#0a1520" />

        {/* X — two clean crossing lines */}
        <line x1="5" y1="8" x2="16" y2="32" stroke="#4ade80" strokeWidth="4.5" strokeLinecap="round"/>
        <line x1="16" y1="8" x2="5" y2="32" stroke="#4ade80" strokeWidth="4.5" strokeLinecap="round"/>

        {/* I — vertical bar with top and bottom serifs */}
        <rect x="24" y="8" width="4" height="24" rx="1" fill="#4ade80" />
        <rect x="21" y="8" width="10" height="3.5" rx="1" fill="#4ade80" />
        <rect x="21" y="28.5" width="10" height="3.5" rx="1" fill="#4ade80" />
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
