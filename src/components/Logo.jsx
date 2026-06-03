const Logo = ({ size = 40, showWordmark = false, className = '' }) => {
  const vw = showWordmark ? 520 : 220
  const vh = 60
  const displayW = showWordmark ? size * (520/60) : size * (220/60)
  const displayH = size

  return (
    <div
      className={`eleven-logo ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      <svg
        width={displayW}
        height={displayH}
        viewBox={`0 0 ${vw} ${vh}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* X — two thick diagonal bars with cutout at crossing */}
        <polygon points="0,0 22,0 110,60 88,60" fill="#4ade80" />
        <polygon points="110,0 132,0 44,60 22,60" fill="#4ade80" />
        <polygon points="56,30 66,24 76,30 66,36" fill="#0a1520" />

        {/* I — thin tall bar */}
        <rect x="148" y="0" width="16" height="60" rx="0" fill="#4ade80" />

        {showWordmark && (
          <text
            x="200"
            y="46"
            fontFamily="'Barlow', -apple-system, BlinkMacSystemFont, sans-serif"
            fontWeight="600"
            fontSize="52"
            letterSpacing="-0.5"
            fill="#e8e0d0"
          >
            eleven
          </text>
        )}
      </svg>
    </div>
  )
}

export default Logo
