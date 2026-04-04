import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import { ReportData } from '@/app/lib/types'
import { PhotoAnalysisResult } from '@/app/api/analyze-photos/route'

Font.register({
  family: 'Syne',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/syne/v24/8vIS7w4qzmVxsWxjBZRjr0FKM_04uT6k.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/syne/v24/8vIS7w4qzmVxsWxjBZRjr0FKM_3fvj6k.ttf', fontWeight: 700 },
  ],
})

const C = {
  brand: '#1a1a1a',
  muted: '#78716c',
  border: '#e7e5e4',
  bgLight: '#fafaf9',
  amberBg: '#fffbeb',
  amberBorder: '#fcd34d',
  amberText: '#78350f',
  amberAccent: '#b45309',
  green: '#4a7c2f',
  red: '#b91c1c',
  blueBg: '#eff6ff',
  blueText: '#1e40af',
  white: '#ffffff',
}

function scoreColor(s: number) {
  return s >= 80 ? C.green : s >= 60 ? C.amberAccent : C.red
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.brand,
    paddingTop: 64,
    paddingBottom: 64,
    backgroundColor: '#F7F6F3',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: C.brand,
    paddingHorizontal: 40,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLogo: { fontFamily: 'Syne', fontSize: 16, fontWeight: 700, color: C.white, letterSpacing: 0.5 },
  headerDate: { fontSize: 8, color: '#a8a29e' },
  content: { paddingHorizontal: 40 },
  heroCard: {
    backgroundColor: C.white, borderRadius: 10, padding: 20, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 20, border: `1pt solid ${C.border}`,
  },
  scoreCircle: {
    width: 72, height: 72, borderRadius: 36, border: `5pt solid ${C.border}`,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  scoreNumber: { fontFamily: 'Syne', fontSize: 22, fontWeight: 700, textAlign: 'center' },
  scoreLabel: { fontSize: 8, color: C.muted, textAlign: 'center', marginTop: 1 },
  heroTitle: { fontFamily: 'Syne', fontSize: 14, fontWeight: 700, color: C.brand, marginBottom: 4 },
  heroSummary: { fontSize: 9, color: C.muted, lineHeight: 1.5, marginBottom: 8 },
  improvementPill: { backgroundColor: '#dcfce7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  improvementText: { fontSize: 8, color: '#166534', fontWeight: 500 },
  subScoresRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  subScoreCard: { flex: 1, backgroundColor: C.white, border: `1pt solid ${C.border}`, borderRadius: 8, padding: 8, alignItems: 'center' },
  subScoreLabel: { fontSize: 7, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3, textAlign: 'center' },
  subScoreValue: { fontFamily: 'Syne', fontSize: 14, fontWeight: 700, textAlign: 'center' },
  subScoreBar: { height: 3, backgroundColor: '#f5f5f4', borderRadius: 2, width: '100%', marginTop: 4 },
  subScoreBarFill: { height: 3, borderRadius: 2 },
  priorityBox: { backgroundColor: C.amberBg, border: `1pt solid ${C.amberBorder}`, borderRadius: 10, padding: 14, marginBottom: 10, minPresenceAhead: 40 },
  priorityTitle: { fontFamily: 'Syne', fontSize: 8, fontWeight: 700, color: C.amberText, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  priorityRow: { flexDirection: 'row', gap: 8, paddingVertical: 5, borderBottom: `1pt solid ${C.amberBorder}` },
  priorityRowLast: { flexDirection: 'row', gap: 8, paddingVertical: 5 },
  priorityNum: { fontFamily: 'Syne', fontSize: 9, fontWeight: 700, color: C.amberAccent, width: 20, flexShrink: 0 },
  priorityText: { fontSize: 9, color: C.amberText, flex: 1, lineHeight: 1.4 },
  sectionCard: { backgroundColor: C.white, border: `1pt solid ${C.border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden', minPresenceAhead: 60 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottom: '1pt solid #f5f5f4', minPresenceAhead: 80 },
  sectionTitle: { fontFamily: 'Syne', fontSize: 10, fontWeight: 700, color: C.brand },
  scorePill: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  scorePillText: { fontSize: 7, fontWeight: 500 },
  sectionBody: { padding: 14 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  problemTag: { backgroundColor: '#fef2f2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  problemTagText: { fontSize: 7, color: '#991b1b' },
  chipTag: { backgroundColor: '#f5f5f4', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, border: `1pt solid ${C.border}` },
  chipTagText: { fontSize: 7, color: '#57534e' },
  suggestionBox: { backgroundColor: C.bgLight, borderLeft: '2pt solid #60a5fa', borderRadius: 3, paddingHorizontal: 10, paddingVertical: 7, marginVertical: 6 },
  suggestionText: { fontSize: 8, color: C.brand, fontStyle: 'italic', lineHeight: 1.5 },
  rewriteBox: { backgroundColor: C.bgLight, border: `1pt solid ${C.border}`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 },
  rewriteText: { fontSize: 8, color: C.brand, lineHeight: 1.6 },
  rowItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 4, borderBottom: '1pt solid #f5f5f4' },
  rowItemLast: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, flexShrink: 0 },
  rowItemText: { fontSize: 8, color: C.brand, flex: 1, lineHeight: 1.4 },
  subLabel: { fontSize: 7, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, marginTop: 8 },
  boldText: { fontWeight: 700 },
  competitorBox: { backgroundColor: C.blueBg, border: '1pt solid #bfdbfe', borderRadius: 10, padding: 14, marginBottom: 8, minPresenceAhead: 40 },
  competitorTitle: { fontFamily: 'Syne', fontSize: 8, fontWeight: 700, color: C.blueText, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  competitorText: { fontSize: 9, color: C.blueText, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 12, left: 40, right: 40 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 7, color: C.muted },
})

function SectionCard({ title, score, children }: { title: string; score: number; children: React.ReactNode }) {
  const pillBg = score >= 80 ? '#dcfce7' : score >= 60 ? '#fef3c7' : '#fee2e2'
  const pillColor = score >= 80 ? '#166534' : score >= 60 ? '#92400e' : '#991b1b'
  return (
    <View style={s.sectionCard} wrap={false}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        <View style={[s.scorePill, { backgroundColor: pillBg }]}>
          <Text style={[s.scorePillText, { color: pillColor }]}>{score}/100</Text>
        </View>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  )
}

function ProblemTags({ items }: { items: string[] }) {
  return (
    <View style={s.tagRow}>
      {items.map((t, i) => <View key={i} style={s.problemTag}><Text style={s.problemTagText}>{t}</Text></View>)}
    </View>
  )
}

function ChipTags({ items }: { items: string[] }) {
  return (
    <View style={s.tagRow}>
      {items.map((t, i) => <View key={i} style={s.chipTag}><Text style={s.chipTagText}>{t}</Text></View>)}
    </View>
  )
}

function RowItems({ items, dotColor }: { items: string[]; dotColor: string }) {
  return (
    <>
      {items.map((t, i) => (
        <View key={i} style={i === items.length - 1 ? s.rowItemLast : s.rowItem}>
          <View style={[s.dot, { backgroundColor: dotColor }]} />
          <Text style={s.rowItemText}>{t}</Text>
        </View>
      ))}
    </>
  )
}

export function ReportDocument({ data: d, photoResults, photoPreviews, listingUrl }: { data: ReportData; photoResults?: PhotoAnalysisResult | null; photoPreviews?: string[]; listingUrl?: string }) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const subScores = photoResults
    ? [
        { label: 'Title', v: d.titleScore },
        { label: 'Description', v: d.descriptionScore },
        { label: 'Photos', v: photoResults.overallPhotoScore },
        { label: 'Amenities', v: d.amenityScore },
        { label: 'Persona', v: d.personaScore },
        { label: 'Reviews', v: d.reviewScore },
      ]
    : [
        { label: 'Title', v: d.titleScore },
        { label: 'Description', v: d.descriptionScore },
        { label: 'Amenities', v: d.amenityScore },
        { label: 'Persona', v: d.personaScore },
        { label: 'Reviews', v: d.reviewScore },
      ]

  return (
    <Document title="ListingIQ Report" author="ListingIQ">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text style={s.headerLogo}>ListingIQ</Text>
          <Text style={s.headerDate}>Generated {date}</Text>
        </View>

        <View style={s.content}>
          {/* Listing URL */}
          {listingUrl && (
            <Text style={{ fontSize: 7, color: C.muted, textAlign: 'center', marginBottom: 8 }}>{listingUrl}</Text>
          )}

          {/* Score hero */}
          <View style={s.heroCard}>
            <View style={s.scoreCircle}>
              <Text style={[s.scoreNumber, { color: scoreColor(d.overallScore) }]}>{d.overallScore}</Text>
              <Text style={s.scoreLabel}>/ 100</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>Airbnb listing score</Text>
              <Text style={s.heroSummary}>{d.summary}</Text>
              <View style={s.improvementPill}>
                <Text style={s.improvementText}>Est. improvement potential: {d.estimatedImprovement}</Text>
              </View>
            </View>
          </View>

          {/* Sub scores */}
          <View style={s.subScoresRow}>
            {subScores.map(({ label, v }) => (
              <View key={label} style={s.subScoreCard}>
                <Text style={s.subScoreLabel}>{label}</Text>
                <Text style={[s.subScoreValue, { color: scoreColor(v) }]}>{v}</Text>
                <View style={s.subScoreBar}>
                  <View style={[s.subScoreBarFill, { width: `${v}%`, backgroundColor: scoreColor(v) }]} />
                </View>
              </View>
            ))}
          </View>

          {/* Priority actions */}
          {d.priorityActions?.length > 0 && (
            <View style={s.priorityBox} minPresenceAhead={60}>
              <Text style={s.priorityTitle}>Priority action plan</Text>
              {d.priorityActions.map((a, i) => (
                <View key={i} style={i === d.priorityActions.length - 1 ? s.priorityRowLast : s.priorityRow}>
                  <Text style={s.priorityNum}>#{i + 1}</Text>
                  <Text style={s.priorityText}>{a}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Title */}
          <SectionCard title="Title optimization" score={d.titleScore}>
            <ProblemTags items={d.titleProblems} />
            <Text style={s.subLabel}>Suggested titles</Text>
            {d.titleSuggestions.map((t, i) => (
              <View key={i} style={s.suggestionBox}><Text style={s.suggestionText}>{t}</Text></View>
            ))}
          </SectionCard>

          {/* Description */}
          <SectionCard title="Description quality" score={d.descriptionScore}>
            <ProblemTags items={d.descriptionProblems} />
            <Text style={s.subLabel}>Full rewrite — copy & paste into your listing</Text>
            <View style={s.rewriteBox}><Text style={s.rewriteText}>{d.descriptionRewrite}</Text></View>
          </SectionCard>

          {/* Photo tips — only when no AI photo analysis */}
          {!photoResults && (
            <View style={s.sectionCard} wrap={false}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Photo tips</Text>
              </View>
              <View style={s.sectionBody}>
                <Text style={s.subLabel}>Photos top-performing listings in your market include</Text>
                <RowItems items={d.missingPhotos} dotColor={C.amberAccent} />
              </View>
            </View>
          )}

          {/* Photo analysis results */}
          {photoResults && (
            <View style={s.sectionCard}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>AI Photo Analysis</Text>
                <View style={[s.scorePill, { backgroundColor: photoResults.overallPhotoScore >= 70 ? '#dcfce7' : photoResults.overallPhotoScore >= 50 ? '#fef3c7' : '#fee2e2' }]}>
                  <Text style={[s.scorePillText, { color: photoResults.overallPhotoScore >= 70 ? '#166534' : photoResults.overallPhotoScore >= 50 ? '#92400e' : '#991b1b' }]}>{photoResults.overallPhotoScore}/100</Text>
                </View>
              </View>
              <View style={s.sectionBody}>
                <Text style={[s.rowItemText, { marginBottom: 6 }]}>{photoResults.heroSuggestion}</Text>
                {photoResults.photos.map((photo, i) => (
                  <View key={i} wrap={false} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: i < photoResults.photos.length - 1 ? `1pt solid ${C.border}` : 'none' }}>
                    {photoPreviews?.[i] && (
                      <Image src={photoPreviews[i]} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }} />
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <Text style={[s.rowItemText, { fontWeight: 700 }]}>Photo {i + 1}</Text>
                      <View style={[s.scorePill, { backgroundColor: photo.verdict === 'keep' ? '#dcfce7' : photo.verdict === 'retake' ? '#fee2e2' : '#fef3c7', flexShrink: 0, marginLeft: 6 }]}>
                        <Text style={[s.scorePillText, { color: photo.verdict === 'keep' ? '#166534' : photo.verdict === 'retake' ? '#991b1b' : '#92400e' }]}>{photo.verdict} · {photo.score}</Text>
                      </View>
                    </View>
                    {photo.strengths.length > 0 && (
                      <View style={{ marginTop: 4 }}>
                        {photo.strengths.map((str, j) => (
                          <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 3 }}>
                            <Text style={{ fontSize: 7, color: C.green }}>+</Text>
                            <Text style={{ fontSize: 7, color: C.green, flex: 1, lineHeight: 1.4 }}>{str}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {photo.problems.length > 0 && (
                      <View style={{ marginTop: 4 }}>
                        {photo.problems.map((prob, j) => (
                          <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 3 }}>
                            <Text style={{ fontSize: 7, color: C.red }}>-</Text>
                            <Text style={{ fontSize: 7, color: C.red, flex: 1, lineHeight: 1.4 }}>{prob}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {photo.retakeInstructions && (
                      <View style={s.suggestionBox}><Text style={s.suggestionText}>{photo.retakeInstructions}</Text></View>
                    )}
                  </View>
                ))}
                {photoResults.suggestedOrder && photoResults.suggestedOrder.length > 0 && (
                  <>
                    <Text style={s.subLabel}>Recommended gallery order</Text>
                    <Text style={[s.rowItemText, { marginBottom: 6 }]}>
                      Reorder your photos: {photoResults.suggestedOrder.map((idx, pos) => `${pos + 1}. Photo ${idx + 1}`).join('  ·  ')}
                    </Text>
                  </>
                )}
                {photoResults.missingShots.length > 0 && (
                  <>
                    <Text style={s.subLabel}>Missing high-conversion shots</Text>
                    <RowItems items={photoResults.missingShots} dotColor={C.amberAccent} />
                  </>
                )}
              </View>
            </View>
          )}

          {/* Amenities */}
          <SectionCard title="Amenity strength" score={d.amenityScore}>
            <Text style={s.subLabel}>Your strongest amenities</Text>
            <ChipTags items={d.topAmenities} />
            {d.amenityGaps.length > 0 && (
              <>
                <Text style={s.subLabel}>Consider adding</Text>
                <RowItems items={d.amenityGaps} dotColor={C.amberAccent} />
              </>
            )}
          </SectionCard>

          {/* Guest persona */}
          <SectionCard title="Guest persona match" score={d.personaScore}>
            <View style={{ marginBottom: 10 }}>
              <Text style={[s.rowItemText, { lineHeight: 1.6 }]}>
                Primary guest type: <Text style={s.boldText}>{d.primaryPersona}</Text>
              </Text>
            </View>
            <ProblemTags items={d.personaProblems} />
            <View style={s.suggestionBox}><Text style={s.suggestionText}>{d.personaSuggestion}</Text></View>
          </SectionCard>

          {/* Competitor insight */}
          {d.competitorInsight && (
            <View style={s.competitorBox} wrap={false}>
              <Text style={s.competitorTitle}>Best practices from top-performing listings</Text>
              <Text style={s.competitorText}>{d.competitorInsight}</Text>
            </View>
          )}

          {/* Reviews */}
          <SectionCard title="Review sentiment" score={d.reviewScore}>
            <Text style={s.subLabel}>Guests mention positively</Text>
            <ChipTags items={d.guestLoves} />
            {d.reviewRisks.length > 0 && (
              <>
                <Text style={s.subLabel}>Watch out for</Text>
                <RowItems items={d.reviewRisks} dotColor={C.amberAccent} />
              </>
            )}
          </SectionCard>

          {/* SEO */}
          <View style={s.sectionCard} minPresenceAhead={60}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Keywords & conversion tips</Text>
            </View>
            <View style={s.sectionBody}>
            <Text style={s.subLabel}>Phrases your target guests search for</Text>
            <ChipTags items={d.seoKeywords} />
            <Text style={s.subLabel}>Booking conversion tips</Text>
            <RowItems items={d.conversionTips} dotColor={C.green} />
            </View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <View style={s.footerRow}>
            <Text style={s.footerText}>Generated by ListingIQ · AI-generated guidance, not affiliated with Airbnb.</Text>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  )
}
