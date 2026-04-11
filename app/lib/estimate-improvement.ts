/** Qualitative improvement potential based on score.
 *  Lower scores = more room for improvement.
 *  Avoids fake percentages — actual impact depends on market, pricing, season, etc.
 *
 *  Shared between server (analyze/route.ts) and client (Report, PDF) so the
 *  improvement text always matches the displayed overall score. */
export function estimateImprovement(score: number): string {
  if (score >= 90) return 'Low — your listing is already well-optimized'
  if (score >= 80) return 'Moderate — a few targeted changes could help'
  if (score >= 70) return 'Good — meaningful gains from the changes below'
  if (score >= 60) return 'High — significant room for improvement'
  if (score >= 50) return 'Very high — these changes could make a real difference'
  return 'Substantial — your listing has major opportunities'
}
