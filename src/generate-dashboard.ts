// Generate comprehensive investment dashboard

const latestFile = Bun.file('data/latest.json')
const historyFile = Bun.file('data/history.json')
const longHistoryFile = Bun.file('data/history-5y.json')
const vietnamHistoryFile = Bun.file('data/vietnam-history.json')
const drawdownsFile = Bun.file('data/drawdowns.json')
const aiSuggestionFile = Bun.file('data/ai-suggestion.json')
const firstPrinciplesFile = Bun.file('data/first-principles.json')

if (!await latestFile.exists() || !await historyFile.exists()) {
  console.error('Missing data files. Run:')
  console.error('  bun run fetch:all')
  console.error('  bun run fetch:history')
  process.exit(1)
}

const hasLongHistory = await longHistoryFile.exists()
const hasVietnamHistory = await vietnamHistoryFile.exists()
const hasDrawdowns = await drawdownsFile.exists()
const hasAiSuggestion = await aiSuggestionFile.exists()
const hasFirstPrinciples = await firstPrinciplesFile.exists()

interface NormalizedPrice {
  source: string
  country: string
  originalCurrency: string
  originalPricePerGram: number
  vndPerGram: number
  vndPerTael: number
}

interface LatestData {
  timestamp: string
  normalized: NormalizedPrice[]
  exchangeRates: Record<string, number>
  vietnamPremium?: {
    premiumPercent: number
    benchmarkVND: number
    localPriceVND: number
  }
}

interface HistoricalPoint {
  date: string
  usdPerOunce: number
  vndPerGram: number
  vndPerTael: number
}

interface HistoryData {
  fetchedAt: string
  days: number
  exchangeRate: { usdVnd: number }
  data: HistoricalPoint[]
}

interface LongHistoryData {
  fetchedAt: string
  years: number
  stats: {
    min: number
    max: number
    avg: number
    current: number
    first: number
    minDate: string
    maxDate: string
    totalChange: number
    annualizedVolatility: number
    dataPoints: number
  }
  data: {
    date: string
    usdPerOunce: number
    vndPerTael: number
  }[]
}

interface VietnamHistoryData {
  lastUpdated: string
  snapshots: {
    date: string
    sjcMieng?: {
      buy: number
      sell: number
    }
    international: {
      usdPerOunce: number
      vndPerTael: number
    }
    exchangeRate: number
    premium: number
  }[]
}

interface DrawdownData {
  analyzedAt: string
  minDrawdownPct: number
  summary: {
    totalDrawdowns: number
    recovered: number
    notRecovered: number
    worstDrawdownPct: number
    longestRecoveryDays: number | null
    avgRecoveryDays: number
  }
  drawdowns: {
    peakDate: string
    peakPrice: number
    troughDate: string
    troughPrice: number
    drawdownPct: number
    recoveryDate: string | null
    daysToTrough: number
    daysToRecovery: number | null
    recovered: boolean
  }[]
}

interface AiSuggestionData {
  generatedAt: string
  provider: string
  model: string
  source: 'ai' | 'heuristic'
  suggestion: {
    status: string
    confidence: string
    horizon: string
    thesis: string
    reasons: string[]
    risks: string[]
    evidence?: Array<{
      key: string
      value: number
      unit: string
      source: string
    }>
  }
}

interface FirstPrinciplesData {
  fetchedAt: string
  factors: Array<{
    id: string
    name: string
    unit: string
    latest: {
      date: string
      value: number
    } | null
    change1dPct: number | null
    change5dPct: number | null
    change20dPct: number | null
  }>
  policyStatements: Array<{
    title: string
    source: string
    url: string
    publishedAt: string
  }>
  geopoliticalEvents: Array<{
    title: string
    source: string
    url: string
    publishedAt: string
  }>
  countryActions: Array<{
    title: string
    source: string
    url: string
    publishedAt: string
  }>
  dollarAndYieldDrivers: Array<{
    title: string
    source: string
    url: string
    publishedAt: string
  }>
  coverage: {
    healthy: boolean
    availableFactors: number
    requiredFactors: number
    sourceFailures: Array<{ id: string; error: string }>
  }
}

const latest: LatestData = await latestFile.json()
const historyData: HistoryData = await historyFile.json()
const longHistory: LongHistoryData | null = hasLongHistory ? await longHistoryFile.json() : null
const vietnamHistory: VietnamHistoryData | null = hasVietnamHistory ? await vietnamHistoryFile.json() : null
const drawdownsData: DrawdownData | null = hasDrawdowns ? await drawdownsFile.json() : null
const aiSuggestion: AiSuggestionData | null = hasAiSuggestion ? await aiSuggestionFile.json() : null
const firstPrinciples: FirstPrinciplesData | null = hasFirstPrinciples ? await firstPrinciplesFile.json() : null

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function recommendationClass(action: string): 'buy' | 'sell' | 'wait' {
  const normalized = action.toLowerCase()
  if (normalized.includes('mua')) return 'buy'
  if (normalized.includes('bán')) return 'sell'
  return 'wait'
}

// Calculate long-term context (in VND)
function calculateLongTermContext() {
  if (!longHistory) return null

  const vndPrices = longHistory.data.map(d => d.vndPerTael).sort((a, b) => a - b)
  const latestHistoryPoint = historyData.data.at(-1)
  const currentVnd = latestHistoryPoint?.vndPerTael ?? longHistory.data.at(-1)!.vndPerTael
  const firstVnd = longHistory.data[0]!.vndPerTael
  const minVnd = Math.min(...vndPrices)
  const maxVnd = Math.max(...vndPrices)
  const avgVnd = vndPrices.reduce((a, b) => a + b, 0) / vndPrices.length

  const percentileIndex = vndPrices.findIndex(p => p >= currentVnd)
  const percentile = percentileIndex < 0
    ? 100
    : Math.round((percentileIndex / vndPrices.length) * 100)

  const fromMin = ((currentVnd - minVnd) / minVnd) * 100
  const fromMax = ((maxVnd - currentVnd) / currentVnd) * 100

  // Find dates for min/max
  const minData = longHistory.data.find(d => d.vndPerTael === minVnd)!
  const maxData = longHistory.data.find(d => d.vndPerTael === maxVnd)!

  return {
    percentile,
    fromMin,
    fromMax,
    isAllTimeHigh: currentVnd >= maxVnd * 0.98,
    isNearLow: currentVnd <= minVnd * 1.1,
    avgVnd,
    minVnd,
    maxVnd,
    currentVnd,
    firstVnd,
    minDate: minData.date,
    maxDate: maxData.date,
    vsAvg: ((currentVnd - avgVnd) / avgVnd) * 100
  }
}

const longTermContext = calculateLongTermContext()

// Calculate insights
function calculateInsights() {
  const prices = historyData.data
  if (prices.length === 0) {
    throw new Error('No historical data available in history.json')
  }
  const current = prices.at(-1)!
  const first = prices[0]!

  // Trend
  const totalChange = ((current.vndPerTael - first.vndPerTael) / first.vndPerTael) * 100
  const dailyChanges = prices.slice(1).map((p, i) =>
    ((p.vndPerTael - prices[i].vndPerTael) / prices[i].vndPerTael) * 100
  )

  // Volatility (standard deviation of daily changes)
  const avgChange = dailyChanges.reduce((a, b) => a + b, 0) / dailyChanges.length
  const volatility = Math.sqrt(
    dailyChanges.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) / dailyChanges.length
  )

  // Moving averages
  const ma7 = prices.slice(-7).reduce((sum, p) => sum + p.vndPerTael, 0) / 7
  const ma30 = prices.length >= 30
    ? prices.slice(-30).reduce((sum, p) => sum + p.vndPerTael, 0) / 30
    : prices.reduce((sum, p) => sum + p.vndPerTael, 0) / prices.length

  // Min/Max
  const sorted = [...prices].sort((a, b) => a.vndPerTael - b.vndPerTael)
  const min = sorted[0]!
  const max = sorted.at(-1)!

  // Premium analysis
  const premium = latest.vietnamPremium?.premiumPercent || 0
  const avgPremium = 8 // Historical average Vietnam premium ~8%
  const premiumStatus = premium > avgPremium + 2 ? 'high' : premium < avgPremium - 2 ? 'low' : 'normal'

  // Recommendation - now considering 5-year historical context
  let recommendation: { action: string; reason: string; confidence: string }
  const isAtHistoricalHigh = longTermContext?.isAllTimeHigh
  const isNearHistoricalLow = longTermContext?.isNearLow
  const percentile = longTermContext?.percentile || 50

  if (isAtHistoricalHigh && premiumStatus !== 'low') {
    recommendation = {
      action: 'CHỜ',
      reason: `Giá gần đỉnh lịch sử ${longHistory?.years || 5} năm. Rủi ro cao.`,
      confidence: 'Cao'
    }
  } else if (premiumStatus === 'high' && totalChange > 10) {
    recommendation = {
      action: 'CHỜ',
      reason: 'Premium cao + giá tăng mạnh. Chờ điều chỉnh.',
      confidence: 'Cao'
    }
  } else if (isNearHistoricalLow && premiumStatus === 'low') {
    recommendation = {
      action: 'MUA',
      reason: `Giá gần đáy lịch sử + Premium thấp. Cơ hội vàng!`,
      confidence: 'Rất cao'
    }
  } else if (premiumStatus === 'low' && totalChange < 0) {
    recommendation = {
      action: 'MUA',
      reason: 'Premium thấp + giá giảm. Cơ hội tốt.',
      confidence: 'Cao'
    }
  } else if (premiumStatus === 'low') {
    recommendation = {
      action: 'MUA',
      reason: 'Premium thấp hơn bình thường.',
      confidence: 'Trung bình'
    }
  } else if (premiumStatus === 'high') {
    recommendation = {
      action: 'BÁN/CHỜ',
      reason: 'Premium cao hơn bình thường.',
      confidence: 'Trung bình'
    }
  } else if (percentile > 90) {
    recommendation = {
      action: 'GIỮ/CHỜ',
      reason: `Giá ở phân vị ${percentile}% (cao). Cẩn thận tích lũy thêm.`,
      confidence: 'Trung bình'
    }
  } else if (percentile < 30) {
    recommendation = {
      action: 'MUA',
      reason: `Giá ở phân vị ${percentile}% (thấp). Có thể tích lũy.`,
      confidence: 'Trung bình'
    }
  } else {
    recommendation = {
      action: 'GIỮ',
      reason: 'Thị trường ổn định.',
      confidence: 'Thấp'
    }
  }

  return {
    current,
    first,
    totalChange,
    volatility,
    ma7,
    ma30,
    min,
    max,
    premium,
    premiumStatus,
    recommendation,
    trendDirection: totalChange > 0 ? 'up' : 'down',
    isAboveMa7: current.vndPerTael > ma7,
    isAboveMa30: current.vndPerTael > ma30
  }
}

const insights = calculateInsights()
const displayedRecommendation = aiSuggestion?.suggestion
  ? {
      action: aiSuggestion.suggestion.status,
      reason: aiSuggestion.suggestion.thesis,
      confidence: aiSuggestion.suggestion.confidence
    }
  : insights.recommendation
const recommendationColorClass = recommendationClass(displayedRecommendation.action)

// Sort markets by VND price
const sortedMarkets = [...latest.normalized].sort((a, b) => a.vndPerGram - b.vndPerGram)
const international = sortedMarkets.find(p => p.country === 'International')
if (!international) {
  throw new Error('Missing International price in latest.normalized; cannot render comparisons')
}
const vietnam = sortedMarkets.filter(p => p.country === 'Vietnam')
const sjcMieng = vietnam.find(p => p.source.includes('Miếng'))

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: decimals })
}

function formatDuration(days: number): string {
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  const d = days % 30
  if (y > 0) return `${y}y ${m}m`
  if (m > 0) return `${m}m ${d}d`
  return `${d}d`
}

function generateDrawdownsSection(): string {
  if (!drawdownsData) return ''

  const sortedDrawdowns = [...drawdownsData.drawdowns].sort((a, b) =>
    new Date(b.peakDate).getTime() - new Date(a.peakDate).getTime()
  )
  const rows = sortedDrawdowns.slice(0, 5).map(dd => `
    <tr>
      <td data-label="Đỉnh">${dd.peakDate}</td>
      <td data-label="Đáy">${dd.troughDate}</td>
      <td data-label="Mức giảm"><span class="premium-badge positive">-${dd.drawdownPct.toFixed(1)}%</span></td>
      <td data-label="Thời gian xuống">${formatDuration(dd.daysToTrough)}</td>
      <td data-label="Phục hồi">${dd.recoveryDate || '<span style="color: var(--red);">Chưa</span>'}</td>
      <td data-label="Thời gian hồi">${dd.daysToRecovery ? formatDuration(dd.daysToRecovery) : '<span style="color: var(--red);">Đang chờ</span>'}</td>
    </tr>
  `).join('')

  const longestRecovery = drawdownsData.summary.longestRecoveryDays
    ? `${Math.round(drawdownsData.summary.longestRecoveryDays / 365)} năm ${Math.round((drawdownsData.summary.longestRecoveryDays % 365) / 30)} tháng`
    : 'N/A'

  const avgRecovery = `${Math.round(drawdownsData.summary.avgRecoveryDays / 365)}y ${Math.round((drawdownsData.summary.avgRecoveryDays % 365) / 30)}m`

  return `
    <!-- Drawdowns Summary Section -->
    <section class="comparison-section" style="margin-bottom: 24px;">
      <div class="comparison-header"><i data-lucide="trending-down"></i> LỊCH SỬ DRAWDOWNS (Giảm giá mạnh)</div>
      <table class="comparison-table">
        <thead>
          <tr>
            <th>Đỉnh</th>
            <th>Đáy</th>
            <th>Mức giảm</th>
            <th>Thời gian xuống</th>
            <th>Phục hồi</th>
            <th>Thời gian hồi</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="padding: 16px 20px; background: #f9f9f9; font-size: 12px; font-family: 'Space Mono', monospace;">
        <strong>Tóm tắt:</strong>
        Drawdown tệ nhất: <span style="color: var(--red);">-${drawdownsData.summary.worstDrawdownPct.toFixed(1)}%</span> |
        Phục hồi lâu nhất: <strong>${longestRecovery}</strong> |
        TB phục hồi: ${avgRecovery}
      </div>
    </section>
  `
}

function generateAiSuggestionSection(): string {
  if (!aiSuggestion?.suggestion) return ''

  const reasons = (aiSuggestion.suggestion.reasons || [])
    .map(reason => `<li>${escapeHtml(reason)}</li>`)
    .join('')
  const risks = (aiSuggestion.suggestion.risks || [])
    .map(risk => `<li>${escapeHtml(risk)}</li>`)
    .join('')
  const generatedAt = new Date(aiSuggestion.generatedAt).toLocaleString('vi-VN')

  return `
    <section class="comparison-section ai-suggestion-section" style="margin-bottom: 24px;">
      <div class="comparison-header"><i data-lucide="bot"></i> AI SUGGEST (${escapeHtml(aiSuggestion.model)})</div>
      <div class="ai-suggestion-shell">
        <div class="ai-suggestion-top">
          <div class="ai-suggestion-main">
            <div class="ai-suggestion-meta">
              <span>Nguồn: ${aiSuggestion.source === 'ai' ? 'Z.AI model' : 'Heuristic fallback'}</span>
              <span>Cập nhật: ${generatedAt}</span>
            </div>
            <div class="ai-suggestion-thesis">${escapeHtml(aiSuggestion.suggestion.thesis)}</div>
          </div>
        </div>

        <div class="ai-suggestion-bottom">
          <div class="ai-suggestion-panel">
            <div class="ai-suggestion-list-title">Luận điểm chính</div>
            <ul class="ai-suggestion-list">${reasons || '<li>Không có luận điểm chi tiết.</li>'}</ul>
          </div>
          <div class="ai-suggestion-panel">
            <div class="ai-suggestion-list-title">Rủi ro</div>
            <ul class="ai-suggestion-list">${risks || '<li>Biến động thị trường và tỷ giá.</li>'}</ul>
          </div>
        </div>
      </div>
    </section>
  `
}

function formatPct(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'n/a'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function renderHeadlineList(
  title: string,
  items: Array<{ title: string; source: string; url: string; publishedAt: string }>
): string {
  const rows = items.slice(0, 4).map(item => {
    const date = item.publishedAt.slice(0, 10)
    return `
      <li style=\"margin-bottom: 8px;\">
        <a href=\"${escapeHtml(item.url)}\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"color: var(--black); text-decoration: underline; font-weight: 600;\">
          ${escapeHtml(item.title)}
        </a>
        <div style=\"font-size: 12px; color: var(--gray); margin-top: 2px;\">${date} • ${escapeHtml(item.source)}</div>
      </li>
    `
  }).join('')

  return `
    <div class=\"ai-suggestion-panel\" style=\"padding: 14px;\">
      <div class=\"ai-suggestion-list-title\" style=\"margin-bottom: 10px;\">${title}</div>
      <ul class=\"ai-suggestion-list\" style=\"margin-left: 18px;\">
        ${rows || '<li>Không có dữ liệu.</li>'}
      </ul>
    </div>
  `
}

function generateFirstPrinciplesSection(): string {
  if (!firstPrinciples) return ''

  const factorRows = firstPrinciples.factors.slice(0, 8).map(factor => `
    <tr>
      <td data-label=\"Factor\">${escapeHtml(factor.name)}</td>
      <td data-label=\"Latest\">
        ${factor.latest
          ? `${fmt(factor.latest.value, 3)} ${escapeHtml(factor.unit)}<br><span style=\"font-size: 11px; color: var(--gray);\">${factor.latest.date}</span>`
          : '<span style=\"color: var(--red);\">N/A</span>'}
      </td>
      <td data-label=\"1D\">${formatPct(factor.change1dPct)}</td>
      <td data-label=\"5D\">${formatPct(factor.change5dPct)}</td>
      <td data-label=\"20D\">${formatPct(factor.change20dPct)}</td>
    </tr>
  `).join('')

  return `
    <section class=\"comparison-section\" style=\"margin-bottom: 24px;\">
      <details class=\"first-principles-details\">
        <summary class=\"comparison-header\">
          <span><i data-lucide=\"globe\"></i> FIRST PRINCIPLES (Macro + Policy + Geopolitics)</span>
        </summary>
        <div style=\"padding: 14px 20px; border-bottom: 1px solid rgba(0,0,0,0.08); font-size: 13px; font-family: 'Space Mono', monospace; background: #fffaf0;\">
          Coverage: ${firstPrinciples.coverage.availableFactors}/${firstPrinciples.coverage.requiredFactors} factors |
          Health: <strong>${firstPrinciples.coverage.healthy ? 'OK' : 'CHECK'}</strong> |
          Updated: ${new Date(firstPrinciples.fetchedAt).toLocaleString('vi-VN')}
        </div>
        <table class=\"comparison-table\">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Latest</th>
              <th>1D</th>
              <th>5D</th>
              <th>20D</th>
            </tr>
          </thead>
          <tbody>
            ${factorRows}
          </tbody>
        </table>
        <div class=\"ai-suggestion-bottom\" style=\"padding: 16px;\">
          ${renderHeadlineList('Policy Statements', firstPrinciples.policyStatements)}
          ${renderHeadlineList('Geopolitical Events', firstPrinciples.geopoliticalEvents)}
          ${renderHeadlineList('Country Actions', firstPrinciples.countryActions)}
          ${renderHeadlineList('Dollar & Yield Drivers', firstPrinciples.dollarAndYieldDrivers)}
        </div>
      </details>
    </section>
  `
}

const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gold Investment Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Work+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation"></script>
  <style>
    :root {
      --gold: #FFD700;
      --gold-dark: #B8860B;
      --black: #0a0a0a;
      --white: #FAFAFA;
      --red: #FF3B30;
      --green: #34C759;
      --gray: #8E8E93;
      --border: 3px solid var(--black);
      --shadow: 4px 4px 0 var(--black);
      --shadow-lg: 6px 6px 0 var(--black);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    [data-lucide] {
      width: 18px;
      height: 18px;
      vertical-align: middle;
      margin-right: 6px;
    }

    body {
      font-family: 'Work Sans', sans-serif;
      background: #F5F5DC;
      background-image:
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 50px,
          rgba(0,0,0,0.03) 50px,
          rgba(0,0,0,0.03) 51px
        ),
        repeating-linear-gradient(
          90deg,
          transparent,
          transparent 50px,
          rgba(0,0,0,0.03) 50px,
          rgba(0,0,0,0.03) 51px
        );
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .logo {
      font-family: 'Space Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      color: var(--black);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      width: 48px;
      height: 48px;
      background: var(--gold);
      border: var(--border);
      box-shadow: var(--shadow);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }

    .timestamp {
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      color: var(--gray);
      background: var(--white);
      padding: 8px 12px;
      border: 2px solid var(--black);
    }

    /* Hero Section */
    .hero {
      background: var(--gold);
      border: var(--border);
      box-shadow: var(--shadow-lg);
      padding: 32px;
      margin-bottom: 24px;
      position: relative;
      overflow: hidden;
    }


    .hero-grid {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 32px;
      align-items: center;
    }

    .hero-main h1 {
      font-size: 48px;
      font-weight: 900;
      line-height: 1;
      margin-bottom: 12px;
      text-transform: uppercase;
    }

    .hero-main p {
      font-size: 18px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    .hero-action {
      text-align: center;
      padding: 24px;
      background: var(--white);
      border: var(--border);
      min-width: 200px;
    }

    .hero-action-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 8px;
      color: var(--gray);
    }

    .hero-action-value {
      font-family: 'Space Mono', monospace;
      font-size: 48px;
      font-weight: 700;
      color: ${recommendationColorClass === 'buy' ? 'var(--green)' : recommendationColorClass === 'sell' ? 'var(--red)' : 'var(--black)'};
    }

    .hero-action-confidence {
      font-size: 11px;
      margin-top: 8px;
      color: var(--gray);
    }

    .ai-suggestion-shell {
      padding: 20px;
      background: var(--white);
      display: grid;
      gap: 16px;
    }

    .ai-suggestion-top {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .ai-suggestion-main {
      border: var(--border);
      background: #fffbe6;
      padding: 16px;
      box-shadow: var(--shadow);
    }

    .ai-suggestion-meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 11px;
      color: var(--gray);
      font-family: 'Space Mono', monospace;
      margin-bottom: 8px;
    }

    .ai-suggestion-thesis {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.3;
    }

    .ai-suggestion-bottom {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .ai-suggestion-panel {
      border: var(--border);
      background: var(--white);
      padding: 14px 16px;
      box-shadow: var(--shadow);
    }

    .ai-suggestion-list-title {
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      margin: 8px 0 6px;
    }

    .ai-suggestion-list {
      margin-left: 18px;
      display: grid;
      gap: 6px;
      font-size: 14px;
      line-height: 1.4;
    }

    @media (max-width: 960px) {
      .ai-suggestion-top,
      .ai-suggestion-bottom {
        grid-template-columns: 1fr;
      }
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--white);
      border: var(--border);
      box-shadow: var(--shadow);
      padding: 20px;
      position: relative;
    }

    .stat-card.highlight {
      background: var(--gold);
    }

    .stat-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--gray);
      margin-bottom: 8px;
    }

    .stat-value {
      font-family: 'Space Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      line-height: 1.2;
    }

    .stat-value.up { color: var(--green); }
    .stat-value.down { color: var(--red); }

    .stat-sub {
      font-size: 13px;
      color: var(--gray);
      margin-top: 4px;
      font-family: 'Space Mono', monospace;
    }

    .stat-change {
      position: absolute;
      top: 12px;
      right: 12px;
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 8px;
      border: 2px solid currentColor;
    }

    .stat-change.up { color: var(--green); }
    .stat-change.down { color: var(--red); }

    /* Historical Context Section */
    .historical-context {
      background: var(--white);
      border: var(--border);
      box-shadow: var(--shadow-lg);
      margin-bottom: 24px;
      overflow: hidden;
    }

    .context-header {
      background: var(--black);
      color: var(--white);
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .context-title {
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .context-period {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      opacity: 0.7;
    }

    .context-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0;
    }

    @media (max-width: 1024px) {
      .context-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 600px) {
      .context-grid {
        grid-template-columns: 1fr;
      }
    }

    .context-card {
      padding: 24px;
      border-right: 2px solid #eee;
      border-bottom: 2px solid #eee;
    }

    .context-card:last-child {
      border-right: none;
    }

    .context-card.percentile {
      background: linear-gradient(135deg, var(--gold) 0%, #fff8dc 100%);
    }

    .percentile-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--gray);
      margin-bottom: 12px;
    }

    .percentile-visual {
      margin-bottom: 12px;
    }

    .percentile-bar {
      height: 16px;
      background: linear-gradient(90deg, var(--green) 0%, var(--gold) 50%, var(--red) 100%);
      border: 2px solid var(--black);
      position: relative;
    }

    .percentile-fill {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: rgba(0,0,0,0.1);
    }

    .percentile-marker {
      position: absolute;
      top: -6px;
      width: 4px;
      height: 28px;
      background: var(--black);
      transform: translateX(-50%);
    }

    .percentile-scale {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-family: 'Space Mono', monospace;
      color: var(--gray);
      margin-top: 4px;
    }

    .percentile-value {
      font-family: 'Space Mono', monospace;
      font-size: 36px;
      font-weight: 700;
      line-height: 1;
    }

    .percentile-desc {
      font-size: 12px;
      font-weight: 600;
      margin-top: 8px;
    }

    .context-stat {
      margin-bottom: 16px;
    }

    .context-stat:last-child {
      margin-bottom: 0;
    }

    .context-stat.full {
      text-align: center;
    }

    .context-stat-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--gray);
      margin-bottom: 4px;
    }

    .context-stat-value {
      font-family: 'Space Mono', monospace;
      font-size: 24px;
      font-weight: 700;
    }

    .context-stat-value.red { color: var(--red); }
    .context-stat-value.green { color: var(--green); }

    .context-stat-date {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      color: var(--gray);
    }

    .context-stat-sub {
      font-size: 11px;
      color: var(--gray);
      margin-top: 2px;
    }

    .context-stat-sub.red { color: var(--red); }
    .context-stat-sub.green { color: var(--green); }

    /* Chart Section */
    .chart-section {
      margin-bottom: 24px;
    }

    .chart-container {
      background: var(--white);
      border: var(--border);
      box-shadow: var(--shadow);
      padding: 24px;
    }

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .chart-title {
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .chart-legend {
      display: flex;
      gap: 12px;
      font-size: 11px;
      font-family: 'Space Mono', monospace;
      padding-left: 12px;
      border-left: 2px solid #ddd;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend-dot {
      width: 12px;
      height: 12px;
      border: 2px solid var(--black);
    }

    .chart-canvas {
      height: 350px;
    }

    /* Comparison Table */
    .comparison-section {
      background: var(--white);
      border: var(--border);
      box-shadow: var(--shadow);
      margin-bottom: 24px;
    }

    .comparison-header {
      background: var(--black);
      color: var(--white);
      padding: 16px 24px;
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .first-principles-details > summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .first-principles-details > summary::-webkit-details-marker {
      display: none;
    }

    .first-principles-details > summary::after {
      content: '+';
      font-family: 'Space Mono', monospace;
      font-size: 18px;
      line-height: 1;
    }

    .first-principles-details[open] > summary::after {
      content: '-';
    }

    .comparison-table {
      width: 100%;
      border-collapse: collapse;
    }

    .comparison-table th,
    .comparison-table td {
      padding: 16px 20px;
      text-align: left;
      border-bottom: 2px solid #eee;
    }

    .comparison-table th {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--gray);
      background: #f9f9f9;
    }

    .comparison-table td {
      font-family: 'Space Mono', monospace;
      font-size: 14px;
    }

    .comparison-table tr:last-child td {
      border-bottom: none;
    }

    .comparison-table tr.highlight {
      background: rgba(255, 215, 0, 0.15);
    }

    .comparison-table tr.vietnam {
      background: rgba(255, 215, 0, 0.08);
    }

    .country-cell {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .country-flag {
      font-size: 20px;
    }

    .country-name {
      font-family: 'Work Sans', sans-serif;
      font-weight: 600;
    }

    .price-bar {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .price-bar-bg {
      flex: 1;
      height: 20px;
      background: #eee;
      position: relative;
      max-width: 200px;
    }

    .price-bar-fill {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: var(--gold);
      border-right: 2px solid var(--black);
    }

    .price-bar-fill.intl {
      background: #666;
    }

    .premium-badge {
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border: 2px solid currentColor;
    }

    .premium-badge.positive { color: var(--red); }
    .premium-badge.negative { color: var(--green); }
    .premium-badge.base { color: var(--gray); border-style: dashed; }

    /* Time Range Selector */
    .time-range-selector {
      display: flex;
      gap: 4px;
    }

    .time-range-btn {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 12px;
      border: 2px solid var(--black);
      background: var(--white);
      cursor: pointer;
      transition: all 0.1s;
    }

    .time-range-btn:hover {
      background: #f0f0f0;
    }

    .time-range-btn.active {
      background: var(--black);
      color: var(--white);
    }

    /* Chart Toolbar */
    .chart-toolbar {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .chart-options {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-left: 12px;
      border-left: 2px solid #ddd;
    }

    .chart-select {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      padding: 4px 6px;
      border: 2px solid var(--black);
      background: var(--white);
      cursor: pointer;
    }

    /* Footer */
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 12px;
      color: var(--gray);
      font-family: 'Space Mono', monospace;
    }

    .footer a {
      color: var(--black);
    }

    /* Responsive */
    @media (max-width: 768px) {
      .hero-grid {
        grid-template-columns: 1fr;
      }

      .hero-main h1 {
        font-size: 32px;
      }

      .hero-action {
        width: 100%;
      }

      .stat-value {
        font-size: 22px;
      }

      .comparison-table {
        font-size: 12px;
      }

      .comparison-table th,
      .comparison-table td {
        padding: 12px 10px;
      }

      .ai-suggestion-thesis {
        font-size: 18px;
      }
    }

    @media (max-width: 640px) {
      .comparison-table thead {
        display: none;
      }

      .comparison-table,
      .comparison-table tbody,
      .comparison-table tr,
      .comparison-table td {
        display: block;
        width: 100%;
      }

      .comparison-table tr {
        border-bottom: 2px solid #eee;
        padding: 8px 0;
      }

      .comparison-table tr:last-child {
        border-bottom: none;
      }

      .comparison-table td {
        border-bottom: 1px dashed #e8e8e8;
        padding: 10px 12px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .comparison-table td:last-child {
        border-bottom: none;
      }

      .comparison-table td::before {
        content: attr(data-label);
        flex: 0 0 42%;
        font-family: 'Work Sans', sans-serif;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: var(--gray);
      }

      .comparison-table td > * {
        flex: 1;
        min-width: 0;
      }

      .country-cell {
        justify-content: flex-end;
      }

      .price-bar {
        justify-content: flex-end;
      }
    }

    /* Price Action TA */
    .ta-container {
      background: var(--white);
      border: var(--border);
      box-shadow: var(--shadow);
      margin-bottom: 24px;
      overflow: hidden;
    }

    .ta-header {
      background: var(--black);
      color: var(--white);
      padding: 16px 24px;
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .ta-subtitle {
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0;
      opacity: 0.6;
      font-family: 'Space Mono', monospace;
    }

    .ta-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
    }

    .ta-card {
      padding: 16px 20px;
      border-right: 2px solid #eee;
      border-bottom: 2px solid #eee;
      position: relative;
    }

    .ta-card:last-child {
      border-right: none;
    }

    .ta-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
    }

    .ta-bullish::before { background: var(--green); }
    .ta-bearish::before { background: var(--red); }
    .ta-neutral::before { background: var(--gray); }

    .ta-card-title {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--gray);
      margin-bottom: 8px;
    }

    .ta-card-value {
      font-family: 'Space Mono', monospace;
      font-size: 22px;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 4px;
    }

    .ta-card-signal {
      font-size: 12px;
      font-weight: 600;
    }

    .ta-bullish .ta-card-signal { color: var(--green); }
    .ta-bearish .ta-card-signal { color: var(--red); }
    .ta-neutral .ta-card-signal { color: var(--gray); }

    .ta-card-detail {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      color: var(--gray);
      margin-top: 4px;
    }

    .ta-card-bar {
      margin-top: 8px;
    }

    .ta-rsi-bar {
      height: 8px;
      background: linear-gradient(90deg, var(--green) 0%, var(--green) 30%, #ddd 30%, #ddd 70%, var(--red) 70%, var(--red) 100%);
      border: 1px solid var(--black);
      position: relative;
    }

    .ta-rsi-fill {
      position: absolute;
      top: -4px;
      width: 3px;
      height: 16px;
      background: var(--black);
      transform: translateX(-50%);
    }

    .ta-rsi-zones {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      font-family: 'Space Mono', monospace;
      color: var(--gray);
      padding: 0 28% 0 28%;
      margin-top: 2px;
    }

    .ta-composite {
      background: #f9f9f9;
    }

    .ta-composite-value {
      font-size: 28px;
    }

    .ta-levels {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      padding: 16px 24px;
      background: #f9f9f9;
      border-top: 2px solid #eee;
      font-family: 'Space Mono', monospace;
    }

    .ta-level-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .ta-level-item:last-child {
      text-align: right;
    }

    .ta-level-current {
      text-align: center;
      padding: 0 16px;
      border-left: 2px solid #ddd;
      border-right: 2px solid #ddd;
    }

    .ta-level-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--gray);
    }

    .ta-level-value {
      font-size: 14px;
      font-weight: 700;
    }

    .ta-level-dist {
      font-size: 11px;
      color: var(--gray);
    }

    .ta-insights {
      padding: 20px 24px;
      border-top: 2px solid #eee;
    }

    .ta-narrative {
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 16px;
      padding: 14px 16px;
      background: #fffbe6;
      border: var(--border);
      box-shadow: var(--shadow);
    }

    .ta-narrative strong {
      font-family: 'Space Mono', monospace;
    }

    .ta-insight-items {
      display: grid;
      gap: 8px;
    }

    .ta-insight-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 13px;
      line-height: 1.4;
      padding: 8px 12px;
      border-left: 4px solid var(--gray);
      background: #f9f9f9;
    }

    .ta-insight-bullish { border-left-color: var(--green); }
    .ta-insight-bearish { border-left-color: var(--red); }

    .ta-insight-tag {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border: 2px solid currentColor;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .ta-insight-bullish .ta-insight-tag { color: var(--green); }
    .ta-insight-bearish .ta-insight-tag { color: var(--red); }
    .ta-insight-neutral .ta-insight-tag { color: var(--gray); }

    .ta-fib-atr {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-top: 2px solid #eee;
    }

    .ta-fib-panel {
      padding: 16px 20px;
      border-right: 2px solid #eee;
    }

    .ta-atr-panel {
      padding: 16px 20px;
    }

    .ta-panel-title {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--gray);
      margin-bottom: 12px;
    }

    .ta-fib-levels {
      display: grid;
      gap: 2px;
    }

    .ta-fib-level {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      padding: 4px 8px;
    }

    .ta-fib-level.active {
      background: rgba(255, 215, 0, 0.2);
      border: 1px solid var(--gold-dark);
      font-weight: 700;
    }

    .ta-fib-level.fib-support {
      color: var(--green);
    }

    .ta-fib-level.fib-resist {
      color: var(--red);
    }

    .ta-fib-ratio {
      width: 48px;
      text-align: right;
      color: var(--gray);
      font-size: 11px;
    }

    .ta-fib-price {
      flex: 1;
    }

    .ta-fib-tag {
      font-size: 9px;
      padding: 1px 4px;
      border: 1px solid currentColor;
      white-space: nowrap;
    }

    .ta-atr-value {
      font-family: 'Space Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .ta-atr-pct {
      font-family: 'Space Mono', monospace;
      font-size: 13px;
      color: var(--gray);
      margin-bottom: 16px;
    }

    .ta-stop-levels {
      display: grid;
      gap: 8px;
    }

    .ta-stop-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-left: 4px solid var(--gray);
      background: #f9f9f9;
      font-family: 'Space Mono', monospace;
      font-size: 12px;
    }

    .ta-stop-tight { border-left-color: var(--red); }
    .ta-stop-moderate { border-left-color: var(--gold-dark); }
    .ta-stop-wide { border-left-color: var(--green); }

    .ta-stop-label {
      font-size: 11px;
      color: var(--gray);
    }

    .ta-stop-price {
      font-weight: 700;
    }

    @media (max-width: 640px) {
      .ta-fib-atr {
        grid-template-columns: 1fr;
      }
      .ta-fib-panel {
        border-right: none;
        border-bottom: 2px solid #eee;
      }
    }

    @media (max-width: 960px) {
      .ta-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (max-width: 640px) {
      .ta-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .ta-levels {
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .ta-level-item,
      .ta-level-item:last-child {
        text-align: left;
      }
      .ta-level-current {
        text-align: left;
        padding: 0;
        border: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="logo">
        <div class="logo-icon">Au</div>
        GOLD TRACKER
      </div>
      <div class="timestamp">
        Cập nhật: ${new Date(latest.timestamp).toLocaleString('vi-VN')}
      </div>
    </header>

    <!-- Hero Section -->
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-main">
          <h1>Giá vàng ${insights.trendDirection === 'up' ? 'tăng mạnh' : 'giảm'}</h1>
          <p>Thay đổi ${insights.totalChange > 0 ? '+' : ''}${insights.totalChange.toFixed(1)}% trong ${historyData.data.length} ngày qua</p>
          <p>Premium Việt Nam: ${insights.premium.toFixed(1)}% ${insights.premiumStatus === 'high' ? '(Cao hơn bình thường)' : insights.premiumStatus === 'low' ? '(Thấp hơn bình thường)' : '(Bình thường)'}</p>
        </div>
        <div class="hero-action">
          <div class="hero-action-label">Khuyến nghị</div>
          <div class="hero-action-value">${escapeHtml(displayedRecommendation.action)}</div>
          <div class="hero-action-confidence">Độ tin cậy: ${escapeHtml(displayedRecommendation.confidence)}</div>
        </div>
      </div>
    </section>

    ${generateAiSuggestionSection()}
    ${generateFirstPrinciplesSection()}

    <!-- Stats Grid -->
    <section class="stats-grid">
      <div class="stat-card highlight">
        <div class="stat-label">Giá SJC Miếng</div>
        <div class="stat-value">${fmt(sjcMieng?.vndPerTael || 0)}</div>
        <div class="stat-sub">VND/lượng</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Giá Quốc Tế (quy đổi)</div>
        <div class="stat-value">${fmt(international.vndPerTael)}</div>
        <div class="stat-sub">VND/lượng</div>
        <div class="stat-change">${insights.current.usdPerOunce.toFixed(0)} USD/oz</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Premium Việt Nam</div>
        <div class="stat-value ${insights.premiumStatus === 'high' ? 'down' : insights.premiumStatus === 'low' ? 'up' : ''}">${insights.premium >= 0 ? '+' : ''}${insights.premium.toFixed(1)}%</div>
        <div class="stat-sub">${fmt((sjcMieng?.vndPerTael || 0) - international.vndPerTael)} VND</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Biến động ${historyData.data.length}D</div>
        <div class="stat-value ${insights.totalChange >= 0 ? 'up' : 'down'}">${insights.totalChange >= 0 ? '+' : ''}${insights.totalChange.toFixed(1)}%</div>
        <div class="stat-sub">Độ biến động: ${insights.volatility.toFixed(2)}%/ngày</div>
      </div>
    </section>

    ${longHistory && longTermContext ? `
    <!-- 5-Year Historical Context -->
    <section class="historical-context">
      <div class="context-header">
        <div class="context-title"><i data-lucide="bar-chart-3"></i> BỐI CẢNH LỊCH SỬ ${longHistory.years} NĂM</div>
        <div class="context-period">${longHistory.data[0]?.date} → ${longHistory.data.at(-1)?.date} (${longHistory.stats.dataPoints} điểm dữ liệu)</div>
      </div>
      <div class="context-grid">
        <div class="context-card percentile">
          <div class="percentile-label">Vị trí hiện tại</div>
          <div class="percentile-visual">
            <div class="percentile-bar">
              <div class="percentile-fill" style="width: ${longTermContext.percentile}%;"></div>
              <div class="percentile-marker" style="left: ${longTermContext.percentile}%;"></div>
            </div>
            <div class="percentile-scale">
              <span>Thấp</span>
              <span>Cao</span>
            </div>
          </div>
          <div class="percentile-value">${longTermContext.percentile}%</div>
          <div class="percentile-desc">${longTermContext.isAllTimeHigh ? '<i data-lucide="alert-triangle"></i> GẦN ĐỈNH LỊCH SỬ' : longTermContext.isNearLow ? '<i data-lucide="check-circle"></i> GẦN ĐÁY LỊCH SỬ' : 'Trong phạm vi bình thường'}</div>
        </div>

        <div class="context-card">
          <div class="context-stat">
            <div class="context-stat-label">Đỉnh ${longHistory.years} năm</div>
            <div class="context-stat-value red">${fmt(longTermContext.maxVnd)}</div>
            <div class="context-stat-date">${longTermContext.maxDate}</div>
          </div>
          <div class="context-stat">
            <div class="context-stat-label">Đáy ${longHistory.years} năm</div>
            <div class="context-stat-value green">${fmt(longTermContext.minVnd)}</div>
            <div class="context-stat-date">${longTermContext.minDate}</div>
          </div>
        </div>

        <div class="context-card">
          <div class="context-stat">
            <div class="context-stat-label">Trung bình ${longHistory.years} năm</div>
            <div class="context-stat-value">${fmt(longTermContext.avgVnd)}</div>
            <div class="context-stat-sub ${longTermContext.vsAvg >= 0 ? 'red' : 'green'}">
              Hiện tại ${longTermContext.vsAvg >= 0 ? '+' : ''}${longTermContext.vsAvg.toFixed(0)}% so với TB
            </div>
          </div>
          <div class="context-stat">
            <div class="context-stat-label">Biến động năm</div>
            <div class="context-stat-value">${longHistory.stats.annualizedVolatility.toFixed(1)}%</div>
            <div class="context-stat-sub">Annualized volatility</div>
          </div>
        </div>

        <div class="context-card">
          <div class="context-stat full">
            <div class="context-stat-label">Tăng trưởng ${longHistory.years} năm</div>
            <div class="context-stat-value ${longHistory.stats.totalChange >= 0 ? 'green' : 'red'}">
              ${longHistory.stats.totalChange >= 0 ? '+' : ''}${longHistory.stats.totalChange.toFixed(0)}%
            </div>
            <div class="context-stat-sub">
              ${fmt(longTermContext.firstVnd)} → ${fmt(longTermContext.currentVnd)}
            </div>
          </div>
        </div>
      </div>
    </section>
    ` : ''}

    <!-- Chart Section -->
    <section class="chart-section">
      <div class="chart-container">
        <div class="chart-header">
          <div class="chart-title">Biểu đồ giá vàng</div>
          <div class="chart-toolbar">
            <div class="time-range-selector">
              <button class="time-range-btn" data-range="7">7D</button>
              <button class="time-range-btn" data-range="30">30D</button>
              <button class="time-range-btn active" data-range="90">90D</button>
              <button class="time-range-btn" data-range="180">6M</button>
              <button class="time-range-btn" data-range="365">1Y</button>
              ${longHistory ? '<button class="time-range-btn" data-range="all">ALL</button>' : ''}
            </div>
            ${vietnamHistory ? `
            <div class="chart-options">
              <select id="indicatorBase" class="chart-select" title="MA/BB tính theo">
                <option value="international">MA: Quốc tế</option>
                <option value="vietnam">MA: Việt Nam</option>
              </select>
            </div>
            ` : ''}
            <div class="chart-legend">
              <div class="legend-item">
                <div class="legend-dot" style="background: #FFD700;"></div>
                <span>Quốc tế</span>
              </div>
              ${vietnamHistory ? `
              <div class="legend-item">
                <div class="legend-dot" style="background: #e91e63;"></div>
                <span>SJC</span>
              </div>
              ` : ''}
              <div class="legend-item">
                <div class="legend-dot" style="background: #333;"></div>
                <span>MA7</span>
              </div>
              <div class="legend-item">
                <div class="legend-dot" style="background: #ff6b6b;"></div>
                <span>MA30</span>
              </div>
              <div class="legend-item">
                <div class="legend-dot" style="background: rgba(76, 175, 80, 0.3);"></div>
                <span>BB</span>
              </div>
              ${drawdownsData ? `
              <div class="legend-item">
                <div class="legend-dot" style="background: rgba(255, 59, 48, 0.15); border-color: rgba(255, 59, 48, 0.5);"></div>
                <span>Drawdown</span>
              </div>
              ` : ''}
            </div>
          </div>
        </div>
        <div class="chart-canvas">
          <canvas id="mainChart"></canvas>
        </div>
      </div>
    </section>

    <!-- Price Action TA Section -->
    <section id="ta-section"></section>

    ${generateDrawdownsSection()}

    <!-- Comparison Table -->
    <section class="comparison-section">
      <div class="comparison-header">So sánh các thị trường (Quy đổi VND)</div>
      <table class="comparison-table">
        <thead>
          <tr>
            <th>Thị trường</th>
            <th>Nguồn</th>
            <th>Giá/gram</th>
            <th>So với Quốc tế</th>
            <th>Giá gốc</th>
          </tr>
        </thead>
        <tbody>
          ${sortedMarkets.map(m => {
            const diff = ((m.vndPerGram - international.vndPerGram) / international.vndPerGram) * 100
            const maxPrice = sortedMarkets.at(-1)!.vndPerGram
            const barWidth = (m.vndPerGram / maxPrice) * 100
            const isIntl = m.country === 'International'
            const isVN = m.country === 'Vietnam'
            const flag = m.country === 'International' ? '🌍' : m.country === 'Vietnam' ? '🇻🇳' : m.country === 'China' ? '🇨🇳' : m.country === 'Russia' ? '🇷🇺' : m.country === 'India' ? '🇮🇳' : '🌐'

            return `<tr class="${isIntl ? 'highlight' : isVN ? 'vietnam' : ''}">
              <td data-label="Thị trường">
                <div class="country-cell">
                  <span class="country-flag">${flag}</span>
                  <span class="country-name">${m.country}</span>
                </div>
              </td>
              <td data-label="Nguồn" style="font-family: 'Work Sans'; font-size: 13px;">${m.source}</td>
              <td data-label="Giá/gram">
                <div class="price-bar">
                  <div class="price-bar-bg">
                    <div class="price-bar-fill ${isIntl ? 'intl' : ''}" style="width: ${barWidth}%;"></div>
                  </div>
                  <span>${fmt(m.vndPerGram)}</span>
                </div>
              </td>
              <td data-label="So với Quốc tế">
                <span class="premium-badge ${isIntl ? 'base' : diff > 0 ? 'positive' : 'negative'}">
                  ${isIntl ? 'BASE' : (diff > 0 ? '+' : '') + diff.toFixed(1) + '%'}
                </span>
              </td>
              <td data-label="Giá gốc">${fmt(m.originalPricePerGram)} ${m.originalCurrency}/g</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <p>Tỷ giá: 1 USD = ${fmt(latest.exchangeRates.VND, 2)} VND | 1 lượng = 37.5g | 1 oz = 31.1g</p>
      <p style="margin-top: 8px;">Dữ liệu từ: FreeGoldAPI, GoldPrice.org, GiaVang.org, IBJA</p>
    </footer>
  </div>

  <script>
    // Short-term data (30 days)
    const shortTermData = ${JSON.stringify(historyData.data)};

    // Long-term data (5 years) if available
    const longTermData = ${longHistory ? JSON.stringify(longHistory.data) : 'null'};

    // Vietnam data (backfilled with international dates)
    const vietnamRawData = ${vietnamHistory ? JSON.stringify(vietnamHistory.snapshots) : 'null'};

    // Drawdowns data for annotations
    const drawdownsData = ${drawdownsData ? JSON.stringify(drawdownsData.drawdowns) : '[]'};

    // Convert Vietnam data to map: date -> sell price in VND per tael
    const vietnamDataMap = vietnamRawData
      ? new Map(vietnamRawData.filter(d => d.sjcMieng?.sell).map(d => [d.date, d.sjcMieng.sell]))
      : new Map();

    // Combine all data, preferring long-term if available
    const allData = longTermData || shortTermData;

    // State for controls
    let indicatorBase = 'international'; // 'international' or 'vietnam'

    // Get price from data point based on indicator base
    // Uses exact date matching - gaps show where data doesn't align
    function getPrice(dataPoint, useVietnam = false) {
      if (useVietnam) {
        return vietnamDataMap.get(dataPoint.date) || null;
      }
      return dataPoint.vndPerTael;
    }

    // Calculate MA with configurable price source
    function calculateMA(data, period, useVietnam = false) {
      return data.map((_, i) => {
        if (i < period - 1) return null;
        const slice = data.slice(i - period + 1, i + 1);
        const prices = slice.map(p => getPrice(p, useVietnam)).filter(p => p !== null);
        if (prices.length < period * 0.7) return null; // Need at least 70% data
        return prices.reduce((sum, p) => sum + p, 0) / prices.length;
      });
    }

    // Calculate Bollinger Bands with configurable price source
    function calculateBollingerBands(data, period = 20, multiplier = 2, useVietnam = false) {
      const ma = calculateMA(data, period, useVietnam);
      const upper = [];
      const lower = [];

      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
          upper.push(null);
          lower.push(null);
          continue;
        }
        const slice = data.slice(i - period + 1, i + 1).map(p => getPrice(p, useVietnam)).filter(p => p !== null);
        const mean = ma[i];
        if (mean === null || slice.length < period * 0.7) {
          upper.push(null);
          lower.push(null);
          continue;
        }
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / slice.length;
        const stdDev = Math.sqrt(variance);
        upper.push(mean + multiplier * stdDev);
        lower.push(mean - multiplier * stdDev);
      }
      return { upper, lower, ma };
    }

    // Filter data by days
    function filterByDays(data, days) {
      if (days === 'all') return data;
      return data.slice(-days);
    }

    // Get point radius based on data length
    function getPointRadius(dataLength) {
      if (dataLength > 180) return 0;
      if (dataLength > 90) return 1;
      if (dataLength > 30) return 2;
      return 4;
    }

    // Get Vietnam prices for filtered data (exact date match only)
    function getVietnamPrices(data) {
      return data.map(d => vietnamDataMap.get(d.date) || null);
    }

    // Create drawdown annotations for current data range
    function createDrawdownAnnotations(data, drawdowns) {
      const annotations = {};
      const dates = data.map(d => d.date);

      drawdowns.forEach((dd, i) => {
        const peakIdx = dates.indexOf(dd.peakDate);
        const troughIdx = dates.indexOf(dd.troughDate);
        const recoveryIdx = dd.recoveryDate ? dates.indexOf(dd.recoveryDate) : -1;

        // Skip if drawdown is not visible in current range
        if (peakIdx === -1 && troughIdx === -1) return;

        // Drawdown zone (peak to trough) - red shading
        if (peakIdx !== -1 || troughIdx !== -1) {
          const startIdx = peakIdx !== -1 ? peakIdx : 0;
          const endIdx = troughIdx !== -1 ? troughIdx : dates.length - 1;

          annotations['drawdown_' + i] = {
            type: 'box',
            xMin: dates[startIdx],
            xMax: dates[endIdx],
            backgroundColor: 'rgba(255, 59, 48, 0.08)',
            borderColor: 'rgba(255, 59, 48, 0.3)',
            borderWidth: 1,
            label: {
              display: true,
              content: '-' + dd.drawdownPct.toFixed(1) + '%',
              position: { x: 'center', y: 'start' },
              font: { family: 'Space Mono', size: 11, weight: 'bold' },
              color: '#FF3B30',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              padding: 4
            }
          };
        }

        // Recovery zone (trough to recovery) - green shading
        if (troughIdx !== -1 && recoveryIdx !== -1) {
          annotations['recovery_' + i] = {
            type: 'box',
            xMin: dates[troughIdx],
            xMax: dates[recoveryIdx],
            backgroundColor: 'rgba(52, 199, 89, 0.06)',
            borderColor: 'rgba(52, 199, 89, 0.2)',
            borderWidth: 1
          };
        }

        // Peak marker - find actual price from data
        if (peakIdx !== -1) {
          annotations['peak_' + i] = {
            type: 'point',
            xValue: dd.peakDate,
            yValue: data[peakIdx].vndPerTael,
            backgroundColor: '#FF3B30',
            borderColor: '#000',
            borderWidth: 2,
            radius: 6
          };
        }

        // Trough marker - find actual price from data
        if (troughIdx !== -1) {
          annotations['trough_' + i] = {
            type: 'point',
            xValue: dd.troughDate,
            yValue: data[troughIdx].vndPerTael,
            backgroundColor: '#34C759',
            borderColor: '#000',
            borderWidth: 2,
            radius: 6
          };
        }
      });

      return annotations;
    }

    // === Price Action TA ===
    const taPresets = {
      scalper:  { label: 'Scalper',     rsi: 7,  macdF: 6,  macdS: 13, macdSig: 5, bb: 10, momA: 3,  momB: 5,  maF: 5,  maS: 15, sr: 10, atr: 7,  fib: 15 },
      day:      { label: 'Day Trader',  rsi: 14, macdF: 12, macdS: 26, macdSig: 9, bb: 20, momA: 5,  momB: 10, maF: 7,  maS: 30, sr: 20, atr: 14, fib: 30 },
      swing:    { label: 'Swing',       rsi: 21, macdF: 12, macdS: 26, macdSig: 9, bb: 20, momA: 10, momB: 20, maF: 20, maS: 50, sr: 40, atr: 20, fib: 60 },
    };
    let taPreset = 'day';

    function calcRSI(prices, period = 14) {
      if (prices.length < period + 1) return null;
      const changes = [];
      for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);
      let avgGain = 0, avgLoss = 0;
      for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i];
        else avgLoss += Math.abs(changes[i]);
      }
      avgGain /= period;
      avgLoss /= period;
      for (let i = period; i < changes.length; i++) {
        avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
      }
      if (avgLoss === 0) return 100;
      return 100 - (100 / (1 + avgGain / avgLoss));
    }

    function calcEMA(prices, period) {
      const k = 2 / (period + 1);
      const r = [prices[0]];
      for (let i = 1; i < prices.length; i++) r.push(prices[i] * k + r[i - 1] * (1 - k));
      return r;
    }

    function calcMACD(prices, fast = 12, slow = 26, sig = 9) {
      if (prices.length < slow + sig) return null;
      const emaF = calcEMA(prices, fast);
      const emaS = calcEMA(prices, slow);
      const macdLine = emaF.map((v, i) => v - emaS[i]);
      const sigLine = calcEMA(macdLine, sig);
      const n = prices.length - 1;
      const hist = macdLine[n] - sigLine[n];
      const prevHist = macdLine[n - 1] - sigLine[n - 1];
      let cross = hist > 0 ? 'bullish' : 'bearish';
      if (prevHist <= 0 && hist > 0) cross = 'bullish_cross';
      else if (prevHist >= 0 && hist < 0) cross = 'bearish_cross';
      return { macd: macdLine[n], signal: sigLine[n], histogram: hist, crossover: cross, momentum: hist > prevHist ? 'increasing' : 'decreasing' };
    }

    function calcBBPct(prices, period = 20, mult = 2) {
      if (prices.length < period) return null;
      const slice = prices.slice(-period);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
      if (std === 0) return 50;
      return ((prices[prices.length - 1] - (mean - mult * std)) / (2 * mult * std)) * 100;
    }

    function calcMom(prices, period) {
      if (prices.length <= period) return null;
      return ((prices[prices.length - 1] - prices[prices.length - 1 - period]) / prices[prices.length - 1 - period]) * 100;
    }

    function calcRSISeries(prices, period) {
      if (prices.length < period + 1) return [];
      const changes = [];
      for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);
      const result = [];
      let avgGain = 0, avgLoss = 0;
      for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i]; else avgLoss += Math.abs(changes[i]);
      }
      avgGain /= period; avgLoss /= period;
      result.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
      for (let i = period; i < changes.length; i++) {
        avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
        result.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
      }
      return result;
    }

    function detectDivergence(prices, rsiSeries, lookback) {
      if (rsiSeries.length < lookback || lookback < 6) return null;
      const off = prices.length - rsiSeries.length;
      const n = rsiSeries.length;
      const half = Math.floor(lookback / 2);
      const p1 = prices.slice(off + n - lookback, off + n - half);
      const p2 = prices.slice(off + n - half);
      const r1 = rsiSeries.slice(n - lookback, n - half);
      const r2 = rsiSeries.slice(n - half);
      const pMax1 = Math.max(...p1), pMax2 = Math.max(...p2);
      const pMin1 = Math.min(...p1), pMin2 = Math.min(...p2);
      const rMax1 = Math.max(...r1), rMax2 = Math.max(...r2);
      const rMin1 = Math.min(...r1), rMin2 = Math.min(...r2);
      if (pMax2 > pMax1 && rMax2 < rMax1 - 3) return 'bearish';
      if (pMin2 < pMin1 && rMin2 > rMin1 + 3) return 'bullish';
      return null;
    }

    function detectBBSqueeze(prices, period) {
      if (prices.length < period * 2) return null;
      const widths = [];
      for (let i = period; i <= prices.length; i++) {
        const sl = prices.slice(i - period, i);
        const mean = sl.reduce((a, b) => a + b, 0) / period;
        const std = Math.sqrt(sl.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
        widths.push(mean > 0 ? (4 * std / mean) * 100 : 0);
      }
      const cur = widths[widths.length - 1];
      const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
      return { squeeze: cur < avg * 0.7, width: cur, avgWidth: avg };
    }

    function detectTrend(prices, lookback) {
      if (prices.length < lookback) return 'ranging';
      const sl = prices.slice(-lookback);
      const ws = Math.max(3, Math.floor(lookback / 4));
      const wins = [];
      for (let i = 0; i <= sl.length - ws; i += Math.max(1, Math.floor(ws / 2))) {
        const w = sl.slice(i, i + ws);
        wins.push({ high: Math.max(...w), low: Math.min(...w) });
      }
      let hh = 0, ll = 0;
      for (let i = 1; i < wins.length; i++) {
        if (wins[i].high > wins[i - 1].high) hh++;
        if (wins[i].low < wins[i - 1].low) ll++;
      }
      const c = wins.length - 1;
      if (c <= 0) return 'ranging';
      if (hh >= c * 0.6) return 'uptrend';
      if (ll >= c * 0.6) return 'downtrend';
      return 'ranging';
    }

    function countStreak(prices) {
      let count = 0, dir = null;
      for (let i = prices.length - 1; i > 0; i--) {
        const d = prices[i] > prices[i - 1] ? 'up' : prices[i] < prices[i - 1] ? 'down' : null;
        if (!d) break;
        if (!dir) dir = d;
        if (d !== dir) break;
        count++;
      }
      return { count, direction: dir || 'flat' };
    }

    function calcFibLevels(prices, lookback) {
      if (prices.length < lookback) return null;
      const sl = prices.slice(-lookback);
      const high = Math.max(...sl);
      const low = Math.min(...sl);
      const diff = high - low;
      if (diff < 1) return null;
      const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const levels = ratios.map(function(r) {
        return { ratio: r, label: (r * 100).toFixed(1) + '%', price: high - diff * r };
      });
      const cur = prices[prices.length - 1];
      var nextRes = null, nextSup = null;
      for (let i = 0; i < levels.length; i++) {
        if (levels[i].price > cur && (!nextRes || levels[i].price < nextRes.price)) nextRes = levels[i];
        if (levels[i].price <= cur && (!nextSup || levels[i].price > nextSup.price)) nextSup = levels[i];
      }
      return { high, low, diff, levels, current: cur, nextResistance: nextRes, nextSupport: nextSup };
    }

    function calcATR(prices, period) {
      if (prices.length < period + 1) return null;
      var ranges = [];
      for (let i = 1; i < prices.length; i++) ranges.push(Math.abs(prices[i] - prices[i - 1]));
      var atr = 0;
      for (let i = 0; i < period; i++) atr += ranges[i];
      atr /= period;
      for (let i = period; i < ranges.length; i++) atr = (atr * (period - 1) + ranges[i]) / period;
      return atr;
    }

    function taSignalClass(sig) {
      if (sig === 'bullish') return 'ta-bullish';
      if (sig === 'bearish') return 'ta-bearish';
      return 'ta-neutral';
    }

    function renderTA(data) {
      const section = document.getElementById('ta-section');
      if (!section || data.length < 15) { if (section) section.innerHTML = ''; return; }

      const p = taPresets[taPreset];
      const prices = data.map(d => d.usdPerOunce || d.vndPerTael);
      const vndPrices = data.map(d => d.vndPerTael);
      const fN = (n, d = 1) => n !== null ? n.toFixed(d) : 'N/A';
      const fV = (n) => n ? n.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : 'N/A';

      // Indicators using preset config
      const rsi = calcRSI(prices, p.rsi);
      const macd = calcMACD(prices, p.macdF, p.macdS, p.macdSig);
      const bbPct = calcBBPct(prices, p.bb);
      const momA = calcMom(prices, p.momA);
      const momB = calcMom(prices, p.momB);

      // MA crossover
      const maFv = prices.length >= p.maF ? prices.slice(-p.maF).reduce((a, b) => a + b, 0) / p.maF : null;
      const maSv = prices.length >= p.maS ? prices.slice(-p.maS).reduce((a, b) => a + b, 0) / p.maS : null;
      const maCross = (maFv && maSv) ? (maFv > maSv ? 'bullish' : 'bearish') : null;

      // Support / Resistance
      const srSlice = vndPrices.slice(-p.sr);
      const support = Math.min(...srSlice);
      const resistance = Math.max(...srSlice);
      const currentVnd = vndPrices[vndPrices.length - 1];
      const distSupport = ((currentVnd - support) / currentVnd) * 100;
      const distResist = ((resistance - currentVnd) / currentVnd) * 100;

      // Signal mapping
      const signals = [];

      let rsiSig = 'neutral', rsiLbl = 'Trung tính';
      if (rsi !== null) {
        if (rsi > 70) { rsiSig = 'bearish'; rsiLbl = 'Quá mua'; }
        else if (rsi < 30) { rsiSig = 'bullish'; rsiLbl = 'Quá bán'; }
        else if (rsi > 60) { rsiSig = 'bearish'; rsiLbl = 'Thiên mua'; }
        else if (rsi < 40) { rsiSig = 'bullish'; rsiLbl = 'Thiên bán'; }
        signals.push(rsiSig);
      }

      let macdSig = 'neutral', macdLbl = 'Trung tính';
      if (macd) {
        if (macd.crossover === 'bullish_cross') { macdSig = 'bullish'; macdLbl = 'Cắt lên'; }
        else if (macd.crossover === 'bearish_cross') { macdSig = 'bearish'; macdLbl = 'Cắt xuống'; }
        else if (macd.crossover === 'bullish' && macd.momentum === 'increasing') { macdSig = 'bullish'; macdLbl = 'Tăng tốc'; }
        else if (macd.crossover === 'bearish' && macd.momentum === 'decreasing') { macdSig = 'bearish'; macdLbl = 'Giảm tốc'; }
        else if (macd.crossover === 'bullish') { macdLbl = 'Trên signal'; }
        else { macdLbl = 'Dưới signal'; }
        signals.push(macdSig);
      }

      let maSig = 'neutral', maLbl = 'N/A';
      if (maCross) {
        maSig = maCross;
        maLbl = maCross === 'bullish' ? 'MA' + p.maF + ' > MA' + p.maS : 'MA' + p.maF + ' < MA' + p.maS;
        signals.push(maSig);
      }

      let bbSig = 'neutral', bbLbl = 'Trung tính';
      if (bbPct !== null) {
        if (bbPct > 95) { bbSig = 'bearish'; bbLbl = 'Chạm trên'; }
        else if (bbPct < 5) { bbSig = 'bullish'; bbLbl = 'Chạm dưới'; }
        else if (bbPct > 80) { bbSig = 'bearish'; bbLbl = 'Gần trên'; }
        else if (bbPct < 20) { bbSig = 'bullish'; bbLbl = 'Gần dưới'; }
        signals.push(bbSig);
      }

      let momSig = 'neutral', momLbl = 'Đi ngang';
      if (momA !== null) {
        if (momA > 2) { momSig = 'bullish'; momLbl = 'Tăng mạnh'; }
        else if (momA < -2) { momSig = 'bearish'; momLbl = 'Giảm mạnh'; }
        else if (momA > 0.5) { momSig = 'bullish'; momLbl = 'Tăng nhẹ'; }
        else if (momA < -0.5) { momSig = 'bearish'; momLbl = 'Giảm nhẹ'; }
        signals.push(momSig);
      }

      // Composite
      const bull = signals.filter(s => s === 'bullish').length;
      const bear = signals.filter(s => s === 'bearish').length;
      const total = signals.length;
      let comp, compLbl, compAction;
      if (bull >= 4) { comp = 'bullish'; compLbl = 'Rất tích cực'; compAction = 'MUA'; }
      else if (bull >= 3 && bear <= 1) { comp = 'bullish'; compLbl = 'Tích cực'; compAction = 'MUA'; }
      else if (bear >= 4) { comp = 'bearish'; compLbl = 'Rất tiêu cực'; compAction = 'BÁN'; }
      else if (bear >= 3 && bull <= 1) { comp = 'bearish'; compLbl = 'Tiêu cực'; compAction = 'BÁN'; }
      else { comp = 'neutral'; compLbl = 'Trung tính'; compAction = 'CHỜ'; }

      // Enhanced insights
      const rsiSeries = calcRSISeries(prices, p.rsi);
      const divergence = detectDivergence(prices, rsiSeries, p.sr);
      const bbSqueeze = detectBBSqueeze(prices, p.bb);
      const trend = detectTrend(prices, p.sr);
      const streak = countStreak(prices);
      const rr = distSupport > 0.01 ? distResist / distSupport : 0;

      const taInsights = [];
      if (divergence === 'bullish') taInsights.push({ type: 'bullish', tag: 'DIVERGENCE', text: 'Phân kỳ tăng - giá tạo đáy thấp hơn nhưng RSI tạo đáy cao hơn. Khả năng đảo chiều tăng.' });
      if (divergence === 'bearish') taInsights.push({ type: 'bearish', tag: 'DIVERGENCE', text: 'Phân kỳ giảm - giá tạo đỉnh cao hơn nhưng RSI tạo đỉnh thấp hơn. Cẩn thận đảo chiều giảm.' });
      if (bbSqueeze && bbSqueeze.squeeze) taInsights.push({ type: 'neutral', tag: 'SQUEEZE', text: 'BB siết chặt (width ' + fN(bbSqueeze.width) + '% vs TB ' + fN(bbSqueeze.avgWidth) + '%). Breakout sắp xảy ra - chờ xác nhận hướng.' });
      if (trend === 'uptrend') taInsights.push({ type: 'bullish', tag: 'TREND', text: 'Xu hướng tăng - chuỗi đỉnh cao hơn & đáy cao hơn (HH/HL). Mua theo xu hướng.' });
      if (trend === 'downtrend') taInsights.push({ type: 'bearish', tag: 'TREND', text: 'Xu hướng giảm - chuỗi đỉnh thấp hơn & đáy thấp hơn (LH/LL). Cẩn thận bắt đáy.' });
      if (trend === 'ranging') taInsights.push({ type: 'neutral', tag: 'SIDEWAY', text: 'Thị trường đi ngang, thiếu xu hướng rõ ràng. Chờ breakout hoặc trade range.' });
      if (streak.count >= 3) taInsights.push({ type: streak.direction === 'up' ? 'bullish' : 'bearish', tag: 'STREAK', text: streak.count + ' phiên ' + (streak.direction === 'up' ? 'tăng' : 'giảm') + ' liên tiếp. ' + (streak.count >= 5 ? 'Chuỗi dài, có thể điều chỉnh.' : '') });
      if (rr > 0) taInsights.push({ type: rr >= 2 ? 'bullish' : rr <= 0.5 ? 'bearish' : 'neutral', tag: 'R:R', text: 'Risk:Reward = 1:' + fN(rr) + ' — ' + (rr >= 2 ? 'Thuận lợi cho vị thế mua.' : rr >= 1 ? 'Cân bằng, cần thêm xác nhận.' : 'Bất lợi, gần kháng cự hơn hỗ trợ.') });
      if (rsi !== null && rsi > 80) taInsights.push({ type: 'bearish', tag: 'RSI', text: 'RSI cực cao (' + fN(rsi) + '). Quá mua nghiêm trọng, rủi ro điều chỉnh lớn.' });
      if (rsi !== null && rsi < 20) taInsights.push({ type: 'bullish', tag: 'RSI', text: 'RSI cực thấp (' + fN(rsi) + '). Quá bán nghiêm trọng, cơ hội mua tốt.' });

      // Narrative
      let narrative = '';
      if (comp === 'bullish') narrative += '<strong>' + compAction + '</strong> — Tín hiệu tổng thể tích cực (' + bull + '/' + total + ' chỉ báo tăng). ';
      else if (comp === 'bearish') narrative += '<strong>' + compAction + '</strong> — Tín hiệu tổng thể tiêu cực (' + bear + '/' + total + ' chỉ báo giảm). ';
      else narrative += '<strong>' + compAction + '</strong> — Tín hiệu trung tính, thị trường thiếu định hướng. ';
      if (trend !== 'ranging') narrative += 'Xu hướng ' + (trend === 'uptrend' ? 'tăng' : 'giảm') + ' đang duy trì. ';
      if (divergence) narrative += '<strong>Phân kỳ ' + (divergence === 'bullish' ? 'tăng' : 'giảm') + '</strong> phát hiện — tín hiệu đảo chiều quan trọng. ';
      if (bbSqueeze && bbSqueeze.squeeze) narrative += 'BB squeeze — <strong>breakout</strong> sắp tới. ';
      if (streak.count >= 4) narrative += streak.count + ' phiên ' + (streak.direction === 'up' ? 'tăng' : 'giảm') + ' liên tục, cẩn thận mean reversion. ';
      if (rr >= 2) narrative += 'R:R hấp dẫn (1:' + fN(rr) + '). ';
      else if (rr > 0 && rr < 0.5) narrative += 'R:R bất lợi, nên chờ giá về gần hỗ trợ. ';

      // Fibonacci & ATR
      const fib = calcFibLevels(vndPrices, p.fib);
      const atrUsd = calcATR(prices, p.atr);
      const atrVnd = calcATR(vndPrices, p.atr);

      var fibAtrHtml = '';
      if (fib || atrVnd) {
        fibAtrHtml = '<div class="ta-fib-atr">';
        if (fib) {
          const fibRows = fib.levels.map(function(lvl) {
            const isCurrent = Math.abs(lvl.price - fib.current) < fib.diff * 0.03;
            const isNextSup = fib.nextSupport && lvl.ratio === fib.nextSupport.ratio;
            const isNextRes = fib.nextResistance && lvl.ratio === fib.nextResistance.ratio;
            var cls = 'ta-fib-level';
            if (isCurrent) cls += ' active';
            else if (isNextSup) cls += ' fib-support';
            else if (isNextRes) cls += ' fib-resist';
            var tag = '';
            if (lvl.ratio === 0) tag = '<span class="ta-fib-tag">Đỉnh</span>';
            else if (lvl.ratio === 1) tag = '<span class="ta-fib-tag">Đáy</span>';
            else if (isNextSup) tag = '<span class="ta-fib-tag" style="color:var(--green);">Hỗ trợ</span>';
            else if (isNextRes) tag = '<span class="ta-fib-tag" style="color:var(--red);">Kháng cự</span>';
            return '<div class="' + cls + '">' +
              '<span class="ta-fib-ratio">' + lvl.label + '</span>' +
              '<span class="ta-fib-price">' + fV(lvl.price) + ' ₫</span>' +
              tag +
            '</div>';
          }).join('');

          fibAtrHtml += '<div class="ta-fib-panel">' +
            '<div class="ta-panel-title">Fibonacci Retracement (' + p.fib + 'D)</div>' +
            '<div class="ta-fib-levels">' + fibRows + '</div>' +
            '<div style="margin-top:8px;font-size:11px;color:var(--gray);">' +
              'Swing: ' + fV(fib.low) + ' → ' + fV(fib.high) + ' ₫' +
            '</div>' +
          '</div>';
        }
        if (atrVnd) {
          var atrPct = (atrVnd / currentVnd) * 100;
          var stop1x = currentVnd - atrVnd;
          var stop15x = currentVnd - atrVnd * 1.5;
          var stop2x = currentVnd - atrVnd * 2;
          fibAtrHtml += '<div class="ta-atr-panel">' +
            '<div class="ta-panel-title">ATR (' + p.atr + ') — Stop-Loss</div>' +
            '<div class="ta-atr-value">' + fV(atrVnd) + ' ₫</div>' +
            '<div class="ta-atr-pct">' + fN(atrPct, 2) + '% / phiên' + (atrUsd ? ' | $' + fN(atrUsd, 1) + '/oz' : '') + '</div>' +
            '<div class="ta-stop-levels">' +
              '<div class="ta-stop-item ta-stop-tight">' +
                '<div><div class="ta-stop-label">Tight (1x ATR)</div><div>Cho scalper</div></div>' +
                '<div class="ta-stop-price">' + fV(stop1x) + ' ₫</div>' +
              '</div>' +
              '<div class="ta-stop-item ta-stop-moderate">' +
                '<div><div class="ta-stop-label">Moderate (1.5x ATR)</div><div>Cho day trader</div></div>' +
                '<div class="ta-stop-price">' + fV(stop15x) + ' ₫</div>' +
              '</div>' +
              '<div class="ta-stop-item ta-stop-wide">' +
                '<div><div class="ta-stop-label">Wide (2x ATR)</div><div>Cho swing</div></div>' +
                '<div class="ta-stop-price">' + fV(stop2x) + ' ₫</div>' +
              '</div>' +
            '</div>' +
          '</div>';
        }
        fibAtrHtml += '</div>';
      }

      // Preset selector options
      const presetOpts = Object.keys(taPresets).map(function(k) {
        return '<option value="' + k + '"' + (k === taPreset ? ' selected' : '') + '>' + taPresets[k].label + '</option>';
      }).join('');

      section.innerHTML =
        '<div class="ta-container">' +
          '<div class="ta-header">' +
            '<span><i data-lucide="activity"></i> PRICE ACTION TA</span>' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              '<select id="taPresetSelect" class="chart-select" style="color:var(--white);background:rgba(255,255,255,0.15);border-color:rgba(255,255,255,0.3);">' + presetOpts + '</select>' +
              '<span class="ta-subtitle">' + data.length + ' phiên</span>' +
            '</div>' +
          '</div>' +
          '<div class="ta-grid">' +
            '<div class="ta-card ' + taSignalClass(rsiSig) + '">' +
              '<div class="ta-card-title">RSI (' + p.rsi + ')</div>' +
              '<div class="ta-card-value">' + fN(rsi) + '</div>' +
              '<div class="ta-card-signal">' + rsiLbl + '</div>' +
              '<div class="ta-card-bar"><div class="ta-rsi-bar"><div class="ta-rsi-fill" style="left:' + Math.min(Math.max(rsi || 50, 0), 100) + '%;"></div></div><div class="ta-rsi-zones"><span>30</span><span>70</span></div></div>' +
            '</div>' +
            '<div class="ta-card ' + taSignalClass(macdSig) + '">' +
              '<div class="ta-card-title">MACD (' + p.macdF + ',' + p.macdS + ',' + p.macdSig + ')</div>' +
              '<div class="ta-card-value">' + (macd ? (macd.histogram >= 0 ? '+' : '') + fN(macd.histogram, 2) : 'N/A') + '</div>' +
              '<div class="ta-card-signal">' + macdLbl + '</div>' +
              '<div class="ta-card-detail">' + (macd ? 'Momentum: ' + (macd.momentum === 'increasing' ? 'Tăng' : 'Giảm') : '') + '</div>' +
            '</div>' +
            '<div class="ta-card ' + taSignalClass(maSig) + '">' +
              '<div class="ta-card-title">MA Cross</div>' +
              '<div class="ta-card-value">' + maLbl + '</div>' +
              '<div class="ta-card-signal">' + (maCross === 'bullish' ? 'Golden cross' : maCross === 'bearish' ? 'Death cross' : 'N/A') + '</div>' +
            '</div>' +
            '<div class="ta-card ' + taSignalClass(bbSig) + '">' +
              '<div class="ta-card-title">BB %B (' + p.bb + ')</div>' +
              '<div class="ta-card-value">' + fN(bbPct) + '%</div>' +
              '<div class="ta-card-signal">' + bbLbl + '</div>' +
            '</div>' +
            '<div class="ta-card ' + taSignalClass(momSig) + '">' +
              '<div class="ta-card-title">Momentum ' + p.momA + 'D</div>' +
              '<div class="ta-card-value">' + (momA !== null ? (momA >= 0 ? '+' : '') + fN(momA) + '%' : 'N/A') + '</div>' +
              '<div class="ta-card-signal">' + momLbl + '</div>' +
              '<div class="ta-card-detail">' + (momB !== null ? p.momB + 'D: ' + (momB >= 0 ? '+' : '') + fN(momB) + '%' : '') + '</div>' +
            '</div>' +
            '<div class="ta-card ta-composite ' + taSignalClass(comp) + '">' +
              '<div class="ta-card-title">Tổng hợp</div>' +
              '<div class="ta-card-value ta-composite-value">' + compAction + '</div>' +
              '<div class="ta-card-signal">' + compLbl + '</div>' +
              '<div class="ta-card-detail">' + bull + ' tăng / ' + bear + ' giảm / ' + (total - bull - bear) + ' trung tính</div>' +
            '</div>' +
          '</div>' +
          '<div class="ta-levels">' +
            '<div class="ta-level-item">' +
              '<span class="ta-level-label">Hỗ trợ (' + p.sr + 'D)</span>' +
              '<span class="ta-level-value" style="color:var(--green);">' + fV(support) + ' ₫</span>' +
              '<span class="ta-level-dist">-' + fN(distSupport) + '%</span>' +
            '</div>' +
            '<div class="ta-level-item ta-level-current">' +
              '<span class="ta-level-label">Hiện tại</span>' +
              '<span class="ta-level-value">' + fV(currentVnd) + ' ₫</span>' +
            '</div>' +
            '<div class="ta-level-item">' +
              '<span class="ta-level-label">Kháng cự (' + p.sr + 'D)</span>' +
              '<span class="ta-level-value" style="color:var(--red);">' + fV(resistance) + ' ₫</span>' +
              '<span class="ta-level-dist">+' + fN(distResist) + '%</span>' +
            '</div>' +
          '</div>' +
          (taInsights.length > 0 || narrative ? '<div class="ta-insights">' +
            (narrative ? '<div class="ta-narrative">' + narrative + '</div>' : '') +
            '<div class="ta-insight-items">' +
              taInsights.map(function(ins) {
                return '<div class="ta-insight-item ta-insight-' + ins.type + '">' +
                  '<span class="ta-insight-tag">' + ins.tag + '</span>' +
                  '<span>' + ins.text + '</span>' +
                '</div>';
              }).join('') +
            '</div>' +
          '</div>' : '') +
          fibAtrHtml +
        '</div>';

      lucide.createIcons();

      // Bind preset selector (re-binds each render since innerHTML replaces DOM)
      const sel = document.getElementById('taPresetSelect');
      if (sel) sel.addEventListener('change', function() { taPreset = this.value; renderTA(filteredData); });
    }

    // Initialize chart
    const ctx = document.getElementById('mainChart').getContext('2d');
    let currentRange = 90;
    let filteredData = filterByDays(allData, currentRange);
    let useVietnamIndicator = indicatorBase === 'vietnam';
    let bands = calculateBollingerBands(filteredData, 20, 2, useVietnamIndicator);
    let drawdownAnnotations = createDrawdownAnnotations(filteredData, drawdownsData);

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: filteredData.map(d => d.date),
        datasets: [
          {
            label: 'BB Upper',
            data: bands.upper,
            borderColor: 'rgba(76, 175, 80, 0.5)',
            borderWidth: 1,
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            order: 3
          },
          {
            label: 'BB Lower',
            data: bands.lower,
            borderColor: 'rgba(76, 175, 80, 0.5)',
            backgroundColor: 'rgba(76, 175, 80, 0.08)',
            borderWidth: 1,
            fill: '-1',
            tension: 0.2,
            pointRadius: 0,
            order: 3
          },
          {
            label: 'Giá Quốc Tế',
            data: filteredData.map(d => d.vndPerTael),
            borderColor: '#FFD700',
            backgroundColor: 'rgba(255, 215, 0, 0.1)',
            borderWidth: 3,
            fill: false,
            tension: 0.2,
            pointRadius: getPointRadius(filteredData.length),
            pointBackgroundColor: '#FFD700',
            pointBorderColor: '#000',
            pointBorderWidth: 2,
            order: 1
          },
          {
            label: 'Việt Nam (SJC)',
            data: getVietnamPrices(filteredData),
            borderColor: '#e91e63',
            backgroundColor: 'rgba(233, 30, 99, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            order: 1
          },
          {
            label: 'MA7',
            data: calculateMA(filteredData, 7, useVietnamIndicator),
            borderColor: '#333',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            order: 2
          },
          {
            label: 'MA30',
            data: calculateMA(filteredData, 30, useVietnamIndicator),
            borderColor: '#ff6b6b',
            borderWidth: 2,
            borderDash: [8, 4],
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            order: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          annotation: {
            annotations: drawdownAnnotations
          },
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#0a0a0a',
            titleFont: { family: 'Space Mono', size: 12 },
            bodyFont: { family: 'Space Mono', size: 14 },
            padding: 12,
            cornerRadius: 0,
            borderColor: '#FFD700',
            borderWidth: 2,
            callbacks: {
              label: function(context) {
                const value = context.raw;
                if (value === null) return '';
                return context.dataset.label + ': ' + value.toLocaleString('vi-VN') + ' ₫';
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(0,0,0,0.05)'
            },
            ticks: {
              font: { family: 'Space Mono', size: 10 },
              maxRotation: 45,
              maxTicksLimit: 12
            }
          },
          y: {
            grid: {
              color: 'rgba(0,0,0,0.05)'
            },
            ticks: {
              font: { family: 'Space Mono', size: 11 },
              callback: function(value) {
                return (value / 1000000).toFixed(0) + 'M';
              }
            }
          }
        }
      }
    });

    // Update chart with new range and settings
    function updateChart(days) {
      if (days !== undefined) currentRange = days;
      filteredData = filterByDays(allData, currentRange);
      useVietnamIndicator = indicatorBase === 'vietnam';
      bands = calculateBollingerBands(filteredData, 20, 2, useVietnamIndicator);
      drawdownAnnotations = createDrawdownAnnotations(filteredData, drawdownsData);

      chart.data.labels = filteredData.map(d => d.date);
      chart.data.datasets[0].data = bands.upper;
      chart.data.datasets[1].data = bands.lower;
      chart.data.datasets[2].data = filteredData.map(d => d.vndPerTael);
      chart.data.datasets[2].pointRadius = getPointRadius(filteredData.length);
      chart.data.datasets[3].data = getVietnamPrices(filteredData);
      chart.data.datasets[4].data = calculateMA(filteredData, 7, useVietnamIndicator);
      chart.data.datasets[5].data = calculateMA(filteredData, 30, useVietnamIndicator);
      chart.options.plugins.annotation.annotations = drawdownAnnotations;
      chart.update();
      renderTA(filteredData);
    }

    // Time range button handlers
    document.querySelectorAll('.time-range-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const range = this.dataset.range;
        updateChart(range === 'all' ? 'all' : parseInt(range));
      });
    });

    // Indicator base select handler
    const indicatorBaseSelect = document.getElementById('indicatorBase');
    if (indicatorBaseSelect) {
      indicatorBaseSelect.addEventListener('change', function() {
        indicatorBase = this.value;
        updateChart();
      });
    }

    // Initialize TA section
    renderTA(filteredData);

    // Initialize Lucide icons
    lucide.createIcons();
  </script>
</body>
</html>`

await Bun.write('data/dashboard.html', html)
console.log('Dashboard generated: data/dashboard.html')

export {}
