/**
 * ListingIQ Logo — SVG logomark + wordmark
 *
 * Concept: "The Signal House" — A geometric house silhouette with an
 * ascending signal wave cutting through the roof, representing AI-driven
 * optimization lifting listing performance. The dots along the wave nod
 * to data points / analytics.
 */

interface LogoProps {
  /** 'full' = icon + wordmark, 'icon' = icon only, 'wordmark' = text only */
  variant?: 'full' | 'icon' | 'wordmark'
  /** Controls overall size — icon height in px (wordmark scales proportionally) */
  size?: number
  /** 'dark' on light backgrounds, 'light' on dark backgrounds */
  theme?: 'dark' | 'light'
  className?: string
}

export default function Logo({
  variant = 'full',
  size = 40,
  theme = 'dark',
  className = '',
}: LogoProps) {
  const textColor = theme === 'dark' ? '#1a1a1a' : '#F7F6F3'
  const accentColor = '#2A7B6F' // deep teal — analytical, premium, pairs with warm off-white
  const accentLight = '#3ECDB5' // bright teal for gradient highlight

  const iconMark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={accentColor} />
          <stop offset="100%" stopColor={accentLight} />
        </linearGradient>
        <clipPath id="house-clip">
          {/* House silhouette used as clip boundary */}
          <path d="M32 6L4 30V58H24V42H40V58H60V30L32 6Z" />
        </clipPath>
      </defs>

      {/* House shape — solid fill */}
      <path
        d="M32 6L4 30V58H24V42H40V58H60V30L32 6Z"
        fill="url(#logo-grad)"
        opacity="0.12"
      />
      {/* House outline */}
      <path
        d="M32 6L4 30V58H24V42H40V58H60V30L32 6Z"
        stroke="url(#logo-grad)"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />

      {/* Rising signal wave — the "IQ" insight cutting through the house */}
      <polyline
        points="8,46 18,42 26,44 34,32 42,28 50,18 58,12"
        stroke={accentLight}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        clipPath="url(#house-clip)"
      />

      {/* Data dots along the signal */}
      {[
        [8, 46],
        [18, 42],
        [26, 44],
        [34, 32],
        [42, 28],
        [50, 18],
        [58, 12],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="2.6"
          fill={accentLight}
          clipPath="url(#house-clip)"
        />
      ))}

      {/* Bright dot at peak — the "breakthrough" moment */}
      <circle cx="58" cy="12" r="3.5" fill={accentLight} opacity="0.5" />
      <circle cx="58" cy="12" r="2" fill="#fff" />
    </svg>
  )

  const wordMark = (
    <svg
      height={size * 0.55}
      viewBox="0 0 200 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ListingIQ"
    >
      <text
        x="0"
        y="25"
        fontFamily="'Syne', sans-serif"
        fontWeight="700"
        fontSize="28"
        fill={textColor}
        letterSpacing="-0.5"
      >
        Listing
        <tspan fill={accentColor} fontWeight="700">IQ</tspan>
      </text>
    </svg>
  )

  return (
    <div className={`inline-flex items-center ${className}`} style={{ gap: size * 0.25 }}>
      {(variant === 'full' || variant === 'icon') && iconMark}
      {(variant === 'full' || variant === 'wordmark') && wordMark}
    </div>
  )
}
