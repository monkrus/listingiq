'use client'

interface Props { score: number; size?: number }

export default function ScoreCircle({ score, size = 110 }: Props) {
  const r = 42
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = score >= 80 ? '#4a7c2f' : score >= 60 ? '#b45309' : '#b91c1c'

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e3dc" strokeWidth="7" />
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke={color} strokeWidth="7"
        strokeDasharray={`${filled.toFixed(1)} ${circ.toFixed(1)}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 1s ease' }}
      />
      <text x="50" y="46" textAnchor="middle" fontFamily="Syne,sans-serif" fontSize="22" fontWeight="700" fill="#1a1a1a">{score}</text>
      <text x="50" y="61" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="10" fill="#888">/ 100</text>
    </svg>
  )
}
