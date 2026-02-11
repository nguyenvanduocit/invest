// Generate AI suggestion (Z.AI model) from latest market artifacts.

const latestFile = Bun.file('data/latest.json')
const historyFile = Bun.file('data/history.json')
const longHistoryFile = Bun.file('data/history-5y.json')
const drawdownsFile = Bun.file('data/drawdowns.json')
const vietnamHistoryFile = Bun.file('data/vietnam-history.json')
const firstPrinciplesFile = Bun.file('data/first-principles.json')
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

interface VietnamHistoryData {
  snapshots: {
    date: string
    sjcMieng?: {
      sell: number
    }
    premium: number
  }[]
}

interface FirstPrinciplesFactor {
  id: string
  name: string
  unit: string
  relationToGold: 'inverse' | 'direct' | 'context'
  latest: {
    date: string
    value: number
  } | null
  change1dPct: number | null
  change5dPct: number | null
  change20dPct: number | null
}

interface FirstPrinciplesNewsItem {
  title: string
  source: string
  publishedAt: string
}

interface FirstPrinciplesData {
  fetchedAt: string
  factors: FirstPrinciplesFactor[]
  policyStatements: FirstPrinciplesNewsItem[]
  geopoliticalEvents: FirstPrinciplesNewsItem[]
  countryActions: FirstPrinciplesNewsItem[]
  dollarAndYieldDrivers: FirstPrinciplesNewsItem[]
  coverage: {
    healthy: boolean
    missingFactors: string[]
    staleFactors: string[]
    sourceFailures: Array<{ id: string; error: string }>
  }
}

interface MacroContext {
  fetchedAt: string | null
  healthy: boolean
  missingFactors: string[]
  factors: Array<{
    id: string
    name: string
    value: number | null
    unit: string
    date: string | null
    change1dPct: number | null
    change5dPct: number | null
    change20dPct: number | null
    relationToGold: 'inverse' | 'direct' | 'context'
  }>
  policyHeadlines: string[]
  geopoliticalHeadlines: string[]
  countryActionHeadlines: string[]
  dollarYieldHeadlines: string[]
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

interface MonthlySeriesPoint {
  date: string
  worldVndPerTael: number
  worldUsdPerOunce: number
  vnSjcVndPerTael: number | null
  premiumPct: number | null
}

interface SuggestionEvidence {
  key: string
  value: number
  unit: string
  source: string
}

interface SuggestionPayload {
  status: RecommendationStatus
  confidence: Confidence
  horizon: string
  thesis: string
  reasons: string[]
  risks: string[]
  evidence: SuggestionEvidence[]
}

interface AiSuggestionOutput {
  generatedAt: string
  provider: string
  model: string
  source: 'ai'
  suggestion: SuggestionPayload
  marketSnapshot: MarketSnapshot
  macroContext: MacroContext
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits))
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized

  const sliced = normalized.slice(0, maxLength)
  const lastSpace = sliced.lastIndexOf(' ')
  if (lastSpace < Math.floor(maxLength * 0.6)) {
    return `${sliced.trimEnd()}...`
  }

  return `${sliced.slice(0, lastSpace).trimEnd()}...`
}

function normalizeListItem(value: unknown, maxLength = 220): string {
  return truncateAtWordBoundary(String(value ?? '').trim(), maxLength)
}

function normalizeHorizon(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw.includes('tuần') || raw.includes('week')) return String(value).trim()
  if (raw.includes('tháng') || raw.includes('month')) return String(value).trim()
  if (raw.includes('ngắn')) return '1-4 tuần'
  if (raw.includes('trung')) return '1-3 tháng'
  if (raw.includes('dài') || raw.includes('long')) return '3-12 tháng'
  return null
}

function sanitizeThesis(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.replaceAll(',', '').trim()
  const match = normalized.match(/-?\d+(\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function toEvidenceItem(value: unknown): SuggestionEvidence | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  const key = String(raw.key ?? '').trim()
  const numericValue = extractNumericValue(raw.value)
  const unit = String(raw.unit ?? '').trim()
  const source = String(raw.source ?? '').trim()

  if (!key || numericValue === null || !unit || !source) {
    return null
  }

  return {
    key,
    value: Number(numericValue.toFixed(4)),
    unit,
    source
  }
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
  if (history.data.length === 0) {
    throw new Error('history.json has no data points')
  }
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

function toConfidence(value: unknown): Confidence | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw.includes('rất')) return 'Rất cao'
  if (raw.includes('cao')) return 'Cao'
  if (raw.includes('trung')) return 'Trung bình'
  if (raw.includes('thấp')) return 'Thấp'
  return null
}

function toStatus(value: unknown): RecommendationStatus | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw.includes('bán')) return 'BÁN/CHỜ'
  if (raw.includes('mua')) return 'MUA'
  if (raw.includes('giữ')) return 'GIỮ'
  if (raw.includes('chờ') || raw.includes('cho')) return 'CHỜ'
  return null
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

function validateAndNormalizeSuggestion(raw: Record<string, unknown>): {
  ok: true
  data: SuggestionPayload
} | {
  ok: false
  errors: string[]
} {
  const errors: string[] = []

  const status = toStatus(raw.status)
  if (!status) errors.push('status thiếu hoặc không hợp lệ (MUA|CHỜ|BÁN/CHỜ|GIỮ)')

  const confidence = toConfidence(raw.confidence)
  if (!confidence) errors.push('confidence thiếu hoặc không hợp lệ (Thấp|Trung bình|Cao|Rất cao)')

  const horizon = normalizeHorizon(raw.horizon)
  if (!horizon) errors.push('horizon thiếu')

  const thesis = sanitizeThesis(raw.thesis)
  if (!thesis) errors.push('thesis thiếu')

  const reasonBlacklist = /\b(rsi|macd|stochastic|ichimoku|volume profile)\b/i
  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.map(v => normalizeListItem(v, 320)).filter(Boolean).filter(v => !reasonBlacklist.test(v))
    : []
  if (reasons.length < 2 || reasons.length > 4) {
    errors.push('reasons phải có từ 2 đến 4 ý hợp lệ')
  }

  const risks = Array.isArray(raw.risks)
    ? raw.risks.map(v => normalizeListItem(v, 320)).filter(Boolean)
    : []
  if (risks.length < 1 || risks.length > 3) {
    errors.push('risks phải có từ 1 đến 3 ý hợp lệ')
  }

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence
        .map(toEvidenceItem)
        .filter((item): item is SuggestionEvidence => Boolean(item))
    : []
  if (evidence.length < 3 || evidence.length > 8) {
    errors.push('evidence phải có từ 3 đến 8 phần tử, mỗi phần tử gồm key/value/unit/source')
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    data: {
      status: status as RecommendationStatus,
      confidence: confidence as Confidence,
      horizon,
      thesis,
      reasons: reasons.slice(0, 4),
      risks: risks.slice(0, 3),
      evidence: evidence.slice(0, 8)
    }
  }
}

async function requestAiSuggestion(
  snapshot: MarketSnapshot,
  monthlySeries: MonthlySeriesPoint[],
  macroContext: MacroContext,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<SuggestionPayload> {
  const systemPrompt = [
    'Bạn là AI phân tích vàng cho thị trường Việt Nam.',
    'Lưu ý quan trọng: chênh lệch giá vàng Việt Nam và thế giới (premium) là hiện tượng bình thường của thị trường Việt Nam.',
    'Không coi premium dương là bất thường nếu không có dấu hiệu cực đoan theo chuỗi dữ liệu.',
    'Nhiệm vụ: đưa ra trạng thái hành động ngắn gọn cho nhà đầu tư cá nhân.',
    'Bạn phải đọc dữ liệu chuỗi 30 ngày của giá thế giới và giá SJC Việt Nam để phân tích kỹ thuật cơ bản (xu hướng, động lượng, dao động premium).',
    'Bạn phải kết hợp thêm first-principles: USD, lợi suất thực, lạm phát kỳ vọng, phát ngôn chính sách, và sự kiện địa chính trị/hành động quốc gia.',
    'Chỉ dùng dữ liệu có trong input. Không được tự tạo thêm chỉ báo không có sẵn như RSI, MACD, stochastic, volume profile.',
    'Mỗi reason cần bám vào dữ liệu định lượng đã có (ít nhất 1 con số hoặc tỷ lệ cụ thể từ input).',
    'Khi nhắc MA7/MA30 hoặc giá phải ghi rõ ngữ cảnh là VND/lượng hoặc USD/oz để tránh mơ hồ đơn vị.',
    'Nếu dữ liệu sự kiện/nội dung tin không đủ liên quan thì giảm confidence và nêu rủi ro dữ liệu nhiễu thay vì suy diễn.',
    'Bắt buộc trả về evidence: mảng 3-8 phần tử, mỗi phần tử có key, value (số), unit, source. Thiếu trường nào xem như sai.',
    'Chỉ trả về JSON hợp lệ, không markdown, không giải thích ngoài JSON.',
    'status phải thuộc: MUA, CHỜ, BÁN/CHỜ, GIỮ.',
    'confidence phải thuộc: Thấp, Trung bình, Cao, Rất cao.',
    'reasons và risks là mảng chuỗi ngắn.'
  ].join(' ')

  const baseUserPrompt = {
    task: 'Đưa nhận định đầu tư vàng ngắn gọn dựa trên dữ liệu; kết hợp phân tích kỹ thuật 30 ngày và first-principles vĩ mô/sự kiện, tuyệt đối không bịa thêm chỉ báo không có trong input.',
    output_schema: {
      status: 'MUA|CHỜ|BÁN/CHỜ|GIỮ',
      confidence: 'Thấp|Trung bình|Cao|Rất cao',
      horizon: '1-4 tuần|1-3 tháng|3-12 tháng',
      thesis: '1-3 câu đầy đủ, không cắt cụt',
      reasons: ['2-4 ý ngắn'],
      risks: ['1-3 rủi ro chính'],
      evidence: [
        {
          key: 'metric_name',
          value: 0,
          unit: 'unit',
          source: 'market_snapshot|macro_context|monthly_series_30d'
        }
      ]
    },
    market_snapshot: snapshot,
    monthly_series_30d: monthlySeries,
    first_principles_context: macroContext
  }

  async function callAi(userPrompt: string): Promise<string> {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
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
    return text
  }

  let lastErrors: string[] = []
  let lastText = ''

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const promptPayload = attempt === 1
      ? baseUserPrompt
      : {
          ...baseUserPrompt,
          repair_request: {
            attempt,
            validation_errors: lastErrors,
            rule: 'Sửa đúng JSON trước đó theo các lỗi, không thêm diễn giải ngoài JSON.'
          },
          previous_response: lastText
        }

    const userPrompt = JSON.stringify(promptPayload)
    let text: string
    try {
      text = await callAi(userPrompt)
    } catch (error) {
      lastErrors = [`AI call failed on attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`]
      continue
    }
    lastText = text

    let parsed: Record<string, unknown>
    try {
      parsed = parseJsonObject(text)
    } catch (error) {
      lastErrors = [`JSON parse error: ${error instanceof Error ? error.message : String(error)}`]
      continue
    }

    const validated = validateAndNormalizeSuggestion(parsed)
    if (validated.ok) {
      return validated.data
    }

    lastErrors = 'errors' in validated ? validated.errors : ['Unknown validation error']
  }

  throw new Error(`AI output invalid after 3 attempts: ${lastErrors.join('; ')}`)
}

function buildMonthlySeries(
  history: HistoryData,
  vietnamHistory: VietnamHistoryData | null
): MonthlySeriesPoint[] {
  const vietnamByDate = new Map<string, { sell: number; premium: number }>()
  for (const snapshot of vietnamHistory?.snapshots || []) {
    if (!snapshot.sjcMieng?.sell) continue
    vietnamByDate.set(snapshot.date, {
      sell: snapshot.sjcMieng.sell,
      premium: snapshot.premium
    })
  }

  return history.data.slice(-30).map(point => {
    const vn = vietnamByDate.get(point.date)
    const premiumPct = vn
      ? round(((vn.sell - point.vndPerTael) / point.vndPerTael) * 100, 2)
      : null
    return {
      date: point.date,
      worldVndPerTael: round(point.vndPerTael, 0),
      worldUsdPerOunce: round(point.usdPerOunce, 2),
      vnSjcVndPerTael: vn ? round(vn.sell, 0) : null,
      premiumPct
    }
  })
}

const HEADLINE_RELEVANCE_PATTERN = /(gold|xau|bullion|usd|dollar|yield|treasury|real yield|inflation|fed|federal reserve|ecb|boe|boj|pboc|central bank|rate cut|rate hike|sanction|war|conflict|ceasefire|tariff|reserve)/i

function buildHeadline(items: FirstPrinciplesNewsItem[]): string[] {
  const filtered = items.filter(item =>
    HEADLINE_RELEVANCE_PATTERN.test(item.title) ||
    HEADLINE_RELEVANCE_PATTERN.test(item.source)
  )

  const selected = (filtered.length > 0 ? filtered : items).slice(0, 6)

  return selected.map(item => `${item.publishedAt.slice(0, 10)} | ${item.source} | ${item.title}`)
}

function buildMacroContext(data: FirstPrinciplesData | null): MacroContext {
  if (!data) {
    return {
      fetchedAt: null,
      healthy: false,
      missingFactors: ['Missing data/first-principles.json'],
      factors: [],
      policyHeadlines: [],
      geopoliticalHeadlines: [],
      countryActionHeadlines: [],
      dollarYieldHeadlines: []
    }
  }

  return {
    fetchedAt: data.fetchedAt,
    healthy: data.coverage.healthy,
    missingFactors: data.coverage.missingFactors,
    factors: data.factors.map(factor => ({
      id: factor.id,
      name: factor.name,
      value: factor.latest?.value ?? null,
      unit: factor.unit,
      date: factor.latest?.date ?? null,
      change1dPct: factor.change1dPct,
      change5dPct: factor.change5dPct,
      change20dPct: factor.change20dPct,
      relationToGold: factor.relationToGold
    })),
    policyHeadlines: buildHeadline(data.policyStatements),
    geopoliticalHeadlines: buildHeadline(data.geopoliticalEvents),
    countryActionHeadlines: buildHeadline(data.countryActions),
    dollarYieldHeadlines: buildHeadline(data.dollarAndYieldDrivers)
  }
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
  const vietnamHistory: VietnamHistoryData | null = await vietnamHistoryFile.exists() ? await vietnamHistoryFile.json() : null
  const firstPrinciples: FirstPrinciplesData | null = await firstPrinciplesFile.exists()
    ? await firstPrinciplesFile.json()
    : null

  if (history.data.length === 0) {
    console.error('history.json has no data points')
    process.exit(1)
  }

  const snapshot = buildSnapshot(latest, history, longHistory, drawdowns)
  const monthlySeries = buildMonthlySeries(history, vietnamHistory)
  const macroContext = buildMacroContext(firstPrinciples)
  const model = process.env.ZAI_MODEL || process.env.ANTHROPIC_DEFAULT_OPUS_MODEL
  const baseUrl = process.env.ZAI_BASE_URL || process.env.ANTHROPIC_BASE_URL
  const apiKey = pickApiKey()

  if (!apiKey) {
    throw new Error('Missing ZAI_API_KEY_1/ZAI_API_KEY_2/ZAI_API_KEY/ANTHROPIC_AUTH_TOKEN')
  }
  if (!baseUrl) {
    throw new Error('Missing ZAI_BASE_URL or ANTHROPIC_BASE_URL')
  }
  if (!model) {
    throw new Error('Missing ZAI_MODEL or ANTHROPIC_DEFAULT_OPUS_MODEL')
  }

  const suggestion = await requestAiSuggestion(snapshot, monthlySeries, macroContext, apiKey, baseUrl, model)
  const output: AiSuggestionOutput = {
    generatedAt: new Date().toISOString(),
    provider: 'z.ai',
    model: model ?? 'unknown',
    source: 'ai',
    suggestion,
    marketSnapshot: snapshot,
    macroContext
  }

  await Bun.write(outputFile, JSON.stringify(output, null, 2))
  console.log(`AI suggestion saved to ${outputFile}`)
  console.log(`  Status: ${output.suggestion.status} (${output.source})`)
}

main().catch(error => {
  console.error('Failed to generate AI suggestion:', error)
  process.exit(1)
})

export {}
