// Eleven XI Logo — matches official brand mark
const Logo = ({ size = 40, showWordmark = false, className = '' }) => {
  const h = size
  const w = showWordmark ? size * 3.8 : size * 0.9

  return (
    <div
      className={`eleven-logo ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      <svg
        width={w}
        height={h}
        viewBox="0 0 152 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* X — bold, wide, sharp diagonal strokes */}
        <line x1="1" y1="1" x2="28" y2="39" stroke="#4ade80" strokeWidth="7" strokeLinecap="square"/>
        <line x1="29" y1="1" x2="2" y2="39" stroke="#4ade80" strokeWidth="7" strokeLinecap="square"/>

        {/* I — thin, tall, no serifs, tight to X */}
        <rect x="35" y="1" width="5" height="38" fill="#4ade80" />

        {/* eleven wordmark — off-white, lowercase */}
        {showWordmark && (
          <text
            x="50"
            y="30"
            fontFamily="'Barlow', sans-serif"
            fontWeight="300"
            fontSize="26"
            letterSpacing="1"
            fill="#e2f5e2"
          >
            eleven
          </text>
        )}
      </svg>
    </div>
  )
}

export default Logo
