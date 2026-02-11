// Generate comprehensive investment dashboard

const latestFile = Bun.file('data/latest.json')
const historyFile = Bun.file('data/history.json')
const longHistoryFile = Bun.file('data/history-5y.json')
const vietnamHistoryFile = Bun.file('data/vietnam-history.json')
const drawdownsFile = Bun.file('data/drawdowns.json')
const aiSuggestionFile = Bun.file('data/ai-suggestion.json')

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
  }
}

const latest: LatestData = await latestFile.json()
const historyData: HistoryData = await historyFile.json()
const longHistory: LongHistoryData | null = hasLongHistory ? await longHistoryFile.json() : null
const vietnamHistory: VietnamHistoryData | null = hasVietnamHistory ? await vietnamHistoryFile.json() : null
const drawdownsData: DrawdownData | null = hasDrawdowns ? await drawdownsFile.json() : null
const aiSuggestion: AiSuggestionData | null = hasAiSuggestion ? await aiSuggestionFile.json() : null

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
  const currentVnd = longHistory.data.at(-1)!.vndPerTael
  const firstVnd = longHistory.data[0]!.vndPerTael
  const minVnd = Math.min(...vndPrices)
  const maxVnd = Math.max(...vndPrices)
  const avgVnd = vndPrices.reduce((a, b) => a + b, 0) / vndPrices.length

  const percentileIndex = vndPrices.findIndex(p => p >= currentVnd)
  const percentile = Math.round((percentileIndex / vndPrices.length) * 100)

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
  const ma30 = prices.reduce((sum, p) => sum + p.vndPerTael, 0) / prices.length

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
const international = sortedMarkets.find(p => p.country === 'International')!
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

          <div class="ai-suggestion-context">
            <div class="ai-context-item">
              <div class="ai-context-label">Mô hình</div>
              <div class="ai-context-value">${escapeHtml(aiSuggestion.model)}</div>
            </div>
            <div class="ai-context-item">
              <div class="ai-context-label">Khung đánh giá</div>
              <div class="ai-context-value">${escapeHtml(aiSuggestion.suggestion.horizon)}</div>
            </div>
            <div class="ai-context-item">
              <div class="ai-context-label">Tín hiệu</div>
              <div class="ai-context-value">${escapeHtml(aiSuggestion.source === 'ai' ? 'Mô hình AI' : 'Heuristic fallback')}</div>
            </div>
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
      grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr);
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

    .ai-suggestion-context {
      border: var(--border);
      background: #f2f2f2;
      padding: 16px;
      box-shadow: var(--shadow);
      display: grid;
      gap: 12px;
      align-content: start;
    }

    .ai-context-item {
      border-bottom: 2px dashed #cfcfcf;
      padding-bottom: 10px;
    }

    .ai-context-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .ai-context-label {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--gray);
      margin-bottom: 4px;
    }

    .ai-context-value {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.35;
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

    // Initialize Lucide icons
    lucide.createIcons();
  </script>
</body>
</html>`

await Bun.write('data/dashboard.html', html)
console.log('Dashboard generated: data/dashboard.html')

export {}
