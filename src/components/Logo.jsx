import xiLogo from '../assets/xi-logo.png'
import xiMark from '../assets/xi-mark.png'

/**
 * Logo component
 * showWordmark={true}  → XI + "eleven" full lockup (xi-logo.png)
 * showWordmark={false} → XI mark only (xi-mark.png)
 *
 * size = height in px. Width scales proportionally.
 * maxWidth = optional cap on rendered width (used in header to prevent overflow).
 */
const Logo = ({ size = 40, showWordmark = false, className = '', maxWidth }) => {
  if (showWordmark) {
    // Full lockup: xi-logo.png is approx 4.5:1 ratio (wide)
    const naturalW = size * 4.5
    const displayW = maxWidth ? Math.min(naturalW, maxWidth) : naturalW
    const displayH = displayW / 4.5

    return (
      <div
        className={`eleven-logo ${className}`}
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        <img
          src={xiLogo}
          alt="Eleven"
          width={displayW}
          height={displayH}
          style={{ display: 'block', objectFit: 'contain' }}
          draggable={false}
        />
      </div>
    )
  }

  // Mark only: xi-mark.png is square-ish (~1:1)
  const displayW = maxWidth ? Math.min(size, maxWidth) : size

  return (
    <div
      className={`eleven-logo ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      <img
        src={xiMark}
        alt="Eleven"
        width={displayW}
        height={displayW}
        style={{ display: 'block', objectFit: 'contain' }}
        draggable={false}
      />
    </div>
  )
}

export default Logo
