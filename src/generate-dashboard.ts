// Generate comprehensive investment dashboard

const latestFile = Bun.file('data/latest.json')
const historyFile = Bun.file('data/history.json')
const longHistoryFile = Bun.file('data/history-5y.json')

if (!await latestFile.exists() || !await historyFile.exists()) {
  console.error('Missing data files. Run:')
  console.error('  bun run fetch:all')
  console.error('  bun run fetch:history')
  process.exit(1)
}

const hasLongHistory = await longHistoryFile.exists()

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

const latest: LatestData = await latestFile.json()
const historyData: HistoryData = await historyFile.json()
const longHistory: LongHistoryData | null = hasLongHistory ? await longHistoryFile.json() : null

// Calculate long-term context
function calculateLongTermContext() {
  if (!longHistory) return null

  const prices = longHistory.data.map(d => d.usdPerOunce).sort((a, b) => a - b)
  const current = longHistory.stats.current
  const percentileIndex = prices.findIndex(p => p >= current)
  const percentile = Math.round((percentileIndex / prices.length) * 100)

  const fromMin = ((current - longHistory.stats.min) / longHistory.stats.min) * 100
  const fromMax = ((longHistory.stats.max - current) / current) * 100

  return {
    percentile,
    fromMin,
    fromMax,
    isAllTimeHigh: current >= longHistory.stats.max * 0.98,
    isNearLow: current <= longHistory.stats.min * 1.1,
    avgPrice: longHistory.stats.avg,
    vsAvg: ((current - longHistory.stats.avg) / longHistory.stats.avg) * 100
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

// Sort markets by VND price
const sortedMarkets = [...latest.normalized].sort((a, b) => a.vndPerGram - b.vndPerGram)
const international = sortedMarkets.find(p => p.country === 'International')!
const vietnam = sortedMarkets.filter(p => p.country === 'Vietnam')
const sjcMieng = vietnam.find(p => p.source.includes('Miếng'))

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: decimals })
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
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

    .recommendation-badge {
      display: inline-block;
      background: var(--black);
      color: var(--white);
      padding: 8px 20px;
      font-family: 'Space Mono', monospace;
      font-size: 14px;
      font-weight: 700;
      margin-top: 16px;
      border: 2px solid var(--black);
    }

    .recommendation-badge.buy { background: var(--green); color: var(--black); }
    .recommendation-badge.sell { background: var(--red); color: var(--white); }
    .recommendation-badge.wait { background: var(--white); color: var(--black); }

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
      color: ${insights.recommendation.action === 'MUA' ? 'var(--green)' : insights.recommendation.action === 'BÁN/CHỜ' ? 'var(--red)' : 'var(--black)'};
    }

    .hero-action-confidence {
      font-size: 11px;
      margin-top: 8px;
      color: var(--gray);
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
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 24px;
      margin-bottom: 24px;
    }

    @media (max-width: 1024px) {
      .chart-section {
        grid-template-columns: 1fr;
      }
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
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .chart-title {
      font-size: 18px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .chart-legend {
      display: flex;
      gap: 16px;
      font-size: 12px;
      font-family: 'Space Mono', monospace;
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

    /* Side Panel */
    .side-panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .insight-card {
      background: var(--white);
      border: var(--border);
      box-shadow: var(--shadow);
      padding: 20px;
    }

    .insight-card.alert {
      background: var(--gold);
    }

    .insight-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .insight-value {
      font-family: 'Space Mono', monospace;
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .insight-desc {
      font-size: 13px;
      color: var(--gray);
    }

    .ma-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }

    .ma-indicator:last-child {
      border-bottom: none;
    }

    .ma-label {
      font-size: 12px;
      font-weight: 600;
      width: 50px;
    }

    .ma-bar {
      flex: 1;
      height: 8px;
      background: #eee;
      position: relative;
    }

    .ma-bar-fill {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: var(--gold);
    }

    .ma-value {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      width: 80px;
      text-align: right;
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
          <div class="recommendation-badge ${insights.recommendation.action === 'MUA' ? 'buy' : insights.recommendation.action === 'BÁN/CHỜ' ? 'sell' : 'wait'}">
            → ${insights.recommendation.reason}
          </div>
        </div>
        <div class="hero-action">
          <div class="hero-action-label">Khuyến nghị</div>
          <div class="hero-action-value">${insights.recommendation.action}</div>
          <div class="hero-action-confidence">Độ tin cậy: ${insights.recommendation.confidence}</div>
        </div>
      </div>
    </section>

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
        <div class="context-title">📊 BỐI CẢNH LỊCH SỬ ${longHistory.years} NĂM</div>
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
          <div class="percentile-desc">${longTermContext.isAllTimeHigh ? '⚠️ GẦN ĐỈNH LỊCH SỬ' : longTermContext.isNearLow ? '✅ GẦN ĐÁY LỊCH SỬ' : 'Trong phạm vi bình thường'}</div>
        </div>

        <div class="context-card">
          <div class="context-stat">
            <div class="context-stat-label">Đỉnh ${longHistory.years} năm</div>
            <div class="context-stat-value red">$${fmt(longHistory.stats.max, 0)}</div>
            <div class="context-stat-date">${longHistory.stats.maxDate}</div>
          </div>
          <div class="context-stat">
            <div class="context-stat-label">Đáy ${longHistory.years} năm</div>
            <div class="context-stat-value green">$${fmt(longHistory.stats.min, 0)}</div>
            <div class="context-stat-date">${longHistory.stats.minDate}</div>
          </div>
        </div>

        <div class="context-card">
          <div class="context-stat">
            <div class="context-stat-label">Trung bình ${longHistory.years} năm</div>
            <div class="context-stat-value">$${fmt(longHistory.stats.avg, 0)}</div>
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
              $${fmt(longHistory.stats.first, 0)} → $${fmt(longHistory.stats.current, 0)}
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
          <div>
            <div class="chart-title">Biểu đồ giá vàng quốc tế</div>
            <div class="time-range-selector">
              <button class="time-range-btn" data-range="7">7D</button>
              <button class="time-range-btn active" data-range="30">30D</button>
              <button class="time-range-btn" data-range="90">90D</button>
              <button class="time-range-btn" data-range="180">6M</button>
              <button class="time-range-btn" data-range="365">1Y</button>
              ${longHistory ? '<button class="time-range-btn" data-range="all">ALL</button>' : ''}
            </div>
          </div>
          <div class="chart-legend">
            <div class="legend-item">
              <div class="legend-dot" style="background: #FFD700;"></div>
              <span>Giá (VND)</span>
            </div>
            <div class="legend-item">
              <div class="legend-dot" style="background: #333;"></div>
              <span>MA7</span>
            </div>
          </div>
        </div>
        <div class="chart-canvas">
          <canvas id="mainChart"></canvas>
        </div>
      </div>

      <div class="side-panel">
        <div class="insight-card ${insights.premiumStatus === 'high' ? 'alert' : ''}">
          <div class="insight-title">
            ${insights.premiumStatus === 'high' ? '⚠️' : insights.premiumStatus === 'low' ? '✓' : '•'} Premium Status
          </div>
          <div class="insight-value">${insights.premium.toFixed(1)}%</div>
          <div class="insight-desc">
            ${insights.premiumStatus === 'high' ? 'Cao hơn mức trung bình 8%' : insights.premiumStatus === 'low' ? 'Thấp hơn mức trung bình 8%' : 'Trong phạm vi bình thường'}
          </div>
        </div>

        <div class="insight-card">
          <div class="insight-title">📊 Moving Averages</div>
          <div class="ma-indicator">
            <span class="ma-label">MA7</span>
            <div class="ma-bar">
              <div class="ma-bar-fill" style="width: ${Math.min(100, (insights.ma7 / insights.current.vndPerTael) * 100)}%;"></div>
            </div>
            <span class="ma-value">${fmtCompact(insights.ma7)}</span>
          </div>
          <div class="ma-indicator">
            <span class="ma-label">MA30</span>
            <div class="ma-bar">
              <div class="ma-bar-fill" style="width: ${Math.min(100, (insights.ma30 / insights.current.vndPerTael) * 100)}%;"></div>
            </div>
            <span class="ma-value">${fmtCompact(insights.ma30)}</span>
          </div>
          <div class="ma-indicator">
            <span class="ma-label">Hiện tại</span>
            <div class="ma-bar">
              <div class="ma-bar-fill" style="width: 100%; background: var(--green);"></div>
            </div>
            <span class="ma-value">${fmtCompact(insights.current.vndPerTael)}</span>
          </div>
          <div class="insight-desc" style="margin-top: 12px;">
            ${insights.isAboveMa7 && insights.isAboveMa30 ? '↑ Trên cả MA7 & MA30 - Xu hướng tăng' : !insights.isAboveMa7 && !insights.isAboveMa30 ? '↓ Dưới cả MA7 & MA30 - Xu hướng giảm' : '→ Đang trong vùng dao động'}
          </div>
        </div>

        <div class="insight-card">
          <div class="insight-title">📈 Min/Max ${historyData.data.length} ngày</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <div>
              <div style="font-size: 11px; color: var(--gray);">Thấp nhất</div>
              <div style="font-family: 'Space Mono'; font-weight: 700; color: var(--green);">${fmtCompact(insights.min.vndPerTael)}</div>
              <div style="font-size: 10px; color: var(--gray);">${insights.min.date}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; color: var(--gray);">Cao nhất</div>
              <div style="font-family: 'Space Mono'; font-weight: 700; color: var(--red);">${fmtCompact(insights.max.vndPerTael)}</div>
              <div style="font-size: 10px; color: var(--gray);">${insights.max.date}</div>
            </div>
          </div>
          <div class="insight-desc">
            Biên độ: ${((insights.max.vndPerTael - insights.min.vndPerTael) / insights.min.vndPerTael * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </section>

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
          ${sortedMarkets.map((m, i) => {
            const diff = ((m.vndPerGram - international.vndPerGram) / international.vndPerGram) * 100
            const maxPrice = sortedMarkets.at(-1)!.vndPerGram
            const barWidth = (m.vndPerGram / maxPrice) * 100
            const isIntl = m.country === 'International'
            const isVN = m.country === 'Vietnam'
            const flag = m.country === 'International' ? '🌍' : m.country === 'Vietnam' ? '🇻🇳' : m.country === 'China' ? '🇨🇳' : m.country === 'Russia' ? '🇷🇺' : m.country === 'India' ? '🇮🇳' : '🌐'

            return `<tr class="${isIntl ? 'highlight' : isVN ? 'vietnam' : ''}">
              <td>
                <div class="country-cell">
                  <span class="country-flag">${flag}</span>
                  <span class="country-name">${m.country}</span>
                </div>
              </td>
              <td style="font-family: 'Work Sans'; font-size: 13px;">${m.source}</td>
              <td>
                <div class="price-bar">
                  <div class="price-bar-bg">
                    <div class="price-bar-fill ${isIntl ? 'intl' : ''}" style="width: ${barWidth}%;"></div>
                  </div>
                  <span>${fmt(m.vndPerGram)}</span>
                </div>
              </td>
              <td>
                <span class="premium-badge ${isIntl ? 'base' : diff > 0 ? 'positive' : 'negative'}">
                  ${isIntl ? 'BASE' : (diff > 0 ? '+' : '') + diff.toFixed(1) + '%'}
                </span>
              </td>
              <td>${fmt(m.originalPricePerGram)} ${m.originalCurrency}/g</td>
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

    // Combine all data, preferring long-term if available
    const allData = longTermData || shortTermData;

    // Calculate MA
    function calculateMA(data, period) {
      return data.map((_, i) => {
        if (i < period - 1) return null;
        const slice = data.slice(i - period + 1, i + 1);
        return slice.reduce((sum, p) => sum + p.vndPerTael, 0) / period;
      });
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

    // Initialize chart
    const ctx = document.getElementById('mainChart').getContext('2d');
    let currentRange = 30;
    let filteredData = filterByDays(allData, currentRange);

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: filteredData.map(d => d.date),
        datasets: [
          {
            label: 'Giá Quốc Tế (VND/tael)',
            data: filteredData.map(d => d.vndPerTael),
            borderColor: '#FFD700',
            backgroundColor: 'rgba(255, 215, 0, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.2,
            pointRadius: getPointRadius(filteredData.length),
            pointBackgroundColor: '#FFD700',
            pointBorderColor: '#000',
            pointBorderWidth: 2
          },
          {
            label: 'MA7',
            data: calculateMA(filteredData, 7),
            borderColor: '#333',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            tension: 0.2,
            pointRadius: 0
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

    // Update chart with new range
    function updateChart(days) {
      currentRange = days;
      filteredData = filterByDays(allData, days);

      chart.data.labels = filteredData.map(d => d.date);
      chart.data.datasets[0].data = filteredData.map(d => d.vndPerTael);
      chart.data.datasets[0].pointRadius = getPointRadius(filteredData.length);
      chart.data.datasets[1].data = calculateMA(filteredData, 7);
      chart.update();
    }

    // Time range button handlers
    document.querySelectorAll('.time-range-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        // Update active state
        document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        // Update chart
        const range = this.dataset.range;
        updateChart(range === 'all' ? 'all' : parseInt(range));
      });
    });
  </script>
</body>
</html>`

await Bun.write('data/dashboard.html', html)
console.log('Dashboard generated: data/dashboard.html')

export {}
