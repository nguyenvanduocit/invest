// Generate AI suggestion (Z.AI model) from latest market artifacts.

const latestFile = Bun.file('data/latest.json')
const historyFile = Bun.file('data/history.json')
const longHistoryFile = Bun.file('data/history-5y.json')
const drawdownsFile = Bun.file('data/drawdowns.json')
const outputFile = 'data/ai-suggestion.json'

type RecommendationStatus = 'MUA' | 'CHỜ' | 'BÁN/CHỜ' | 'GIỮ'
type Confidence = 'Thấp' | 'Trung bình' | 'Cao' | 'Rất cao'

interface NormalizedPrice {
  source: string
  country: string
  vndPerTael: number
}

interface LatestData {
  timestamp: string
  normalized: NormalizedPrice[]
  vietnamPremium?: {
    premiumPercent: number
  }
}

interface HistoryPoint {
  date: string
  usdPerOunce: number
  vndPerTael: number
}

interface HistoryData {
  fetchedAt: string
  data: HistoryPoint[]
}

interface LongHistoryData {
  years: number
  data: {
    date: string
    vndPerTael: number
  }[]
}

interface DrawdownData {
  summary: {
    totalDrawdowns: number
    recovered: number
    notRecovered: number
    worstDrawdownPct: number
    avgRecoveryDays: number
  }
}

interface MarketSnapshot {
  latestTimestamp: string
  sjcVndPerTael: number | null
  intlVndPerTael: number | null
  premiumPct: number
  change7dPct: number | null
  change30dPct: number | null
  volatilityDailyPct: number | null
  ma7VndPerTael: number | null
  ma30VndPerTael: number | null
  percentile5y: number | null
  drawdowns: {
    total: number
    recovered: number
    notRecovered: number
    worstPct: number
    avgRecoveryDays: number
  } | null
}

interface SuggestionPayload {
  status: RecommendationStatus
  confidence: Confidence
  horizon: string
  thesis: string
  reasons: string[]
  risks: string[]
}

interface AiSuggestionOutput {
  generatedAt: string
  provider: string
  model: string
  source: 'ai' | 'heuristic'
  suggestion: SuggestionPayload
  marketSnapshot: MarketSnapshot
  error?: string
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits))
}

function pickApiKey(): string | null {
  const keys = [
    process.env.ZAI_API_KEY_1,
    process.env.ZAI_API_KEY_2,
    process.env.ZAI_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN
  ].filter((v): v is string => Boolean(v))

  if (keys.length === 0) return null
  return keys[Math.floor(Math.random() * keys.length)]
}

function pctChange(current: number, previous: number): number {
  if (!previous) return 0
  return ((current - previous) / previous) * 100
}

function movingAverage(values: number[], period: number): number | null {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((sum, v) => sum + v, 0) / period
}

function calcVolatility(values: number[]): number | null {
  if (values.length < 2) return null
  const returns = values.slice(1).map((v, i) => pctChange(v, values[i]))
  const avg = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / returns.length
  return Math.sqrt(variance)
}

function calcPercentile5y(longHistory: LongHistoryData | null): number | null {
  if (!longHistory || longHistory.data.length < 2) return null
  const sorted = longHistory.data.map(d => d.vndPerTael).sort((a, b) => a - b)
  const current = longHistory.data.at(-1)!.vndPerTael
  const index = sorted.findIndex(p => p >= current)
  if (index < 0) return 100
  return Math.round((index / sorted.length) * 100)
}

function buildSnapshot(
  latest: LatestData,
  history: HistoryData,
  longHistory: LongHistoryData | null,
  drawdowns: DrawdownData | null
): MarketSnapshot {
  const sjc = latest.normalized.find(p => p.country === 'Vietnam' && p.source.includes('Miếng'))
    || latest.normalized.find(p => p.country === 'Vietnam')
  const intl = latest.normalized.find(p => p.country === 'International')
  const prices = history.data.map(p => p.vndPerTael)
  const current = prices.at(-1) ?? 0
  const prev7 = prices.length >= 8 ? prices.at(-8)! : null
  const prev30 = prices.length >= 31 ? prices.at(-31)! : null

  return {
    latestTimestamp: latest.timestamp,
    sjcVndPerTael: sjc?.vndPerTael ?? null,
    intlVndPerTael: intl?.vndPerTael ?? null,
    premiumPct: round(latest.vietnamPremium?.premiumPercent ?? 0, 2),
    change7dPct: prev7 ? round(pctChange(current, prev7), 2) : null,
    change30dPct: prev30 ? round(pctChange(current, prev30), 2) : null,
    volatilityDailyPct: (() => {
      const v = calcVolatility(prices)
      return v === null ? null : round(v, 2)
    })(),
    ma7VndPerTael: (() => {
      const v = movingAverage(prices, 7)
      return v === null ? null : round(v, 0)
    })(),
    ma30VndPerTael: (() => {
      const v = movingAverage(prices, 30)
      return v === null ? null : round(v, 0)
    })(),
    percentile5y: calcPercentile5y(longHistory),
    drawdowns: drawdowns
      ? {
          total: drawdowns.summary.totalDrawdowns,
          recovered: drawdowns.summary.recovered,
          notRecovered: drawdowns.summary.notRecovered,
          worstPct: round(drawdowns.summary.worstDrawdownPct, 2),
          avgRecoveryDays: round(drawdowns.summary.avgRecoveryDays, 1)
        }
      : null
  }
}

function toConfidence(value: unknown): Confidence {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw.includes('rất')) return 'Rất cao'
  if (raw.includes('cao')) return 'Cao'
  if (raw.includes('trung')) return 'Trung bình'
  return 'Thấp'
}

function toStatus(value: unknown): RecommendationStatus {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw.includes('bán')) return 'BÁN/CHỜ'
  if (raw.includes('mua')) return 'MUA'
  if (raw.includes('giữ')) return 'GIỮ'
  return 'CHỜ'
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed)
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1))
  }

  throw new Error('AI response did not contain JSON object')
}

function normalizeSuggestion(raw: Record<string, unknown>): SuggestionPayload {
  const thesis = String(raw.thesis ?? 'Thiếu dữ liệu để đưa nhận định rõ ràng.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)

  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.map(v => String(v).trim()).filter(Boolean).slice(0, 4)
    : []

  const risks = Array.isArray(raw.risks)
    ? raw.risks.map(v => String(v).trim()).filter(Boolean).slice(0, 4)
    : []

  return {
    status: toStatus(raw.status),
    confidence: toConfidence(raw.confidence),
    horizon: String(raw.horizon ?? 'Trung hạn').trim() || 'Trung hạn',
    thesis: thesis || 'Thiếu dữ liệu để đưa nhận định rõ ràng.',
    reasons: reasons.length > 0 ? reasons : ['Thiếu luận điểm chi tiết từ AI.'],
    risks: risks.length > 0 ? risks : ['Biến động thị trường và tỷ giá.']
  }
}

function buildHeuristicSuggestion(snapshot: MarketSnapshot): SuggestionPayload {
  const premium = snapshot.premiumPct
  const change30d = snapshot.change30dPct ?? 0
  const percentile = snapshot.percentile5y ?? 50

  if (percentile >= 90 && premium > 8) {
    return {
      status: 'CHỜ',
      confidence: 'Cao',
      horizon: 'Ngắn hạn',
      thesis: 'Giá đang ở vùng cao lịch sử và premium nội địa cao, ưu tiên chờ nhịp điều chỉnh.',
      reasons: [
        `Phân vị 5 năm: ${percentile}%`,
        `Premium hiện tại: ${premium.toFixed(1)}%`
      ],
      risks: ['Nếu xu hướng tăng kéo dài, có thể bỏ lỡ cơ hội mua ở giá thấp hơn.']
    }
  }

  if (premium <= 5 && change30d <= 0) {
    return {
      status: 'MUA',
      confidence: 'Cao',
      horizon: 'Trung hạn',
      thesis: 'Premium thấp và giá đang điều chỉnh, phù hợp chiến lược tích lũy từng phần.',
      reasons: [
        `Premium hiện tại: ${premium.toFixed(1)}%`,
        `Biến động 30 ngày: ${change30d.toFixed(1)}%`
      ],
      risks: ['Giá có thể còn giảm thêm trong ngắn hạn.']
    }
  }

  return {
    status: 'GIỮ',
    confidence: 'Trung bình',
    horizon: 'Trung hạn',
    thesis: 'Tín hiệu chưa đủ mạnh cho quyết định mới, nên giữ vị thế và theo dõi thêm.',
    reasons: [
      `Premium hiện tại: ${premium.toFixed(1)}%`,
      `Biến động 30 ngày: ${change30d.toFixed(1)}%`
    ],
    risks: ['Rủi ro dữ liệu nhiễu ở các nhịp biến động mạnh.']
  }
}

async function requestAiSuggestion(
  snapshot: MarketSnapshot,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<SuggestionPayload> {
  const systemPrompt = [
    'Bạn là AI phân tích vàng cho thị trường Việt Nam.',
    'Nhiệm vụ: đưa ra trạng thái hành động ngắn gọn cho nhà đầu tư cá nhân.',
    'Chỉ trả về JSON hợp lệ, không markdown, không giải thích ngoài JSON.',
    'status phải thuộc: MUA, CHỜ, BÁN/CHỜ, GIỮ.',
    'confidence phải thuộc: Thấp, Trung bình, Cao, Rất cao.',
    'reasons và risks là mảng chuỗi ngắn.'
  ].join(' ')

  const userPrompt = JSON.stringify({
    task: 'Đưa nhận định đầu tư vàng ngắn gọn dựa trên dữ liệu.',
    output_schema: {
      status: 'MUA|CHỜ|BÁN/CHỜ|GIỮ',
      confidence: 'Thấp|Trung bình|Cao|Rất cao',
      horizon: 'chuỗi ngắn',
      thesis: '1 câu <= 220 ký tự',
      reasons: ['2-4 ý ngắn'],
      risks: ['1-3 rủi ro chính']
    },
    market_snapshot: snapshot
  })

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    }),
    signal: AbortSignal.timeout(90_000)
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`AI API ${res.status}: ${body.slice(0, 500)}`)
  }

  const json = await res.json() as {
    content?: Array<{ type?: string; text?: string }>
  }
  const text = json.content?.find(c => c.type === 'text')?.text
  if (!text) {
    throw new Error('AI response missing text content')
  }

  const parsed = parseJsonObject(text)
  return normalizeSuggestion(parsed)
}

async function main() {
  if (!await latestFile.exists() || !await historyFile.exists()) {
    console.error('Missing required files for AI suggest: data/latest.json, data/history.json')
    process.exit(1)
  }

  const latest: LatestData = await latestFile.json()
  const history: HistoryData = await historyFile.json()
  const longHistory: LongHistoryData | null = await longHistoryFile.exists() ? await longHistoryFile.json() : null
  const drawdowns: DrawdownData | null = await drawdownsFile.exists() ? await drawdownsFile.json() : null

  const snapshot = buildSnapshot(latest, history, longHistory, drawdowns)
  const model = process.env.ZAI_MODEL || process.env.ANTHROPIC_DEFAULT_OPUS_MODEL
  const baseUrl = process.env.ZAI_BASE_URL || process.env.ANTHROPIC_BASE_URL
  const apiKey = pickApiKey()

  let output: AiSuggestionOutput

  try {
    if (!apiKey) {
      throw new Error('Missing ZAI_API_KEY_1/ZAI_API_KEY_2/ZAI_API_KEY/ANTHROPIC_AUTH_TOKEN')
    }
    if (!baseUrl) {
      throw new Error('Missing ZAI_BASE_URL or ANTHROPIC_BASE_URL')
    }
    if (!model) {
      throw new Error('Missing ZAI_MODEL or ANTHROPIC_DEFAULT_OPUS_MODEL')
    }

    const suggestion = await requestAiSuggestion(snapshot, apiKey, baseUrl, model)
    output = {
      generatedAt: new Date().toISOString(),
      provider: 'z.ai',
      model: model ?? 'unknown',
      source: 'ai',
      suggestion,
      marketSnapshot: snapshot
    }
  } catch (error) {
    output = {
      generatedAt: new Date().toISOString(),
      provider: 'z.ai',
      model: model ?? 'unknown',
      source: 'heuristic',
      suggestion: buildHeuristicSuggestion(snapshot),
      marketSnapshot: snapshot,
      error: error instanceof Error ? error.message : String(error)
    }
  }

  await Bun.write(outputFile, JSON.stringify(output, null, 2))
  console.log(`AI suggestion saved to ${outputFile}`)
  console.log(`  Status: ${output.suggestion.status} (${output.source})`)
  if (output.error) {
    console.log(`  Fallback reason: ${output.error}`)
  }
}

main().catch(error => {
  console.error('Failed to generate AI suggestion:', error)
  process.exit(1)
})

export {}
