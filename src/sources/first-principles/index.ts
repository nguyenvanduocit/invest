import { load } from 'cheerio'

export type GoldRelation = 'inverse' | 'direct' | 'context'

export interface TimePoint {
  date: string
  value: number
}

export interface FactorSnapshot {
  id: string
  name: string
  source: string
  unit: string
  relationToGold: GoldRelation
  latest: TimePoint | null
  change1dPct: number | null
  change5dPct: number | null
  change20dPct: number | null
  recent: TimePoint[]
}

export interface NewsItem {
  title: string
  url: string
  publishedAt: string
  source: string
  category: string
}

export interface SourceStatus {
  id: string
  label: string
  kind: 'factor' | 'policy_feed' | 'event_feed'
  ok: boolean
  count: number
  fetchedAt: string
  error?: string
}

export interface CoverageReport {
  requiredFactors: number
  availableFactors: number
  missingFactors: string[]
  staleFactors: string[]
  minNewsRequired: number
  policyCount: number
  geopoliticalCount: number
  countryActionCount: number
  dollarYieldCount: number
  sourceFailures: Array<{ id: string; error: string }>
  healthy: boolean
}

export interface FirstPrinciplesData {
  fetchedAt: string
  factors: FactorSnapshot[]
  policyStatements: NewsItem[]
  geopoliticalEvents: NewsItem[]
  countryActions: NewsItem[]
  dollarAndYieldDrivers: NewsItem[]
  sourceStatus: SourceStatus[]
  coverage: CoverageReport
}

interface FredFactorDef {
  id: string
  name: string
  seriesId: string
  unit: string
  relationToGold: GoldRelation
}

interface PolicyFeedDef {
  id: string
  label: string
  url: string
}

interface GdeltQueryDef {
  id: string
  label: string
  category: 'geopoliticalEvents' | 'countryActions' | 'dollarAndYieldDrivers'
  query: string
}

const USER_AGENT = 'invest-first-principles/1.0 (github-actions-friendly)'
const MAX_RECENT_POINTS = 60
const STALE_FACTOR_DAYS = 10
const MIN_NEWS_PER_CATEGORY = 3

const FRED_FACTOR_DEFS: FredFactorDef[] = [
  {
    id: 'usd_index_trade_weighted',
    name: 'US Dollar Trade Weighted Index',
    seriesId: 'DTWEXBGS',
    unit: 'index',
    relationToGold: 'inverse'
  },
  {
    id: 'us_real_yield_10y',
    name: 'US Real Yield 10Y',
    seriesId: 'DFII10',
    unit: '%',
    relationToGold: 'inverse'
  },
  {
    id: 'us_breakeven_10y',
    name: 'US Breakeven Inflation 10Y',
    seriesId: 'T10YIE',
    unit: '%',
    relationToGold: 'direct'
  },
  {
    id: 'us_fed_funds_effective',
    name: 'US Effective Fed Funds Rate',
    seriesId: 'DFF',
    unit: '%',
    relationToGold: 'inverse'
  },
  {
    id: 'us_treasury_10y',
    name: 'US Treasury Yield 10Y',
    seriesId: 'DGS10',
    unit: '%',
    relationToGold: 'inverse'
  },
  {
    id: 'us_treasury_2y',
    name: 'US Treasury Yield 2Y',
    seriesId: 'DGS2',
    unit: '%',
    relationToGold: 'inverse'
  },
  {
    id: 'vix',
    name: 'VIX Volatility Index',
    seriesId: 'VIXCLS',
    unit: 'index',
    relationToGold: 'direct'
  }
]

const POLICY_FEEDS: PolicyFeedDef[] = [
  {
    id: 'fed_speeches',
    label: 'Federal Reserve Speeches',
    url: 'https://www.federalreserve.gov/feeds/speeches.xml'
  },
  {
    id: 'fed_monetary',
    label: 'Federal Reserve Monetary Policy Press Releases',
    url: 'https://www.federalreserve.gov/feeds/press_monetary.xml'
  },
  {
    id: 'ecb_press',
    label: 'ECB Press / Speeches',
    url: 'https://www.ecb.europa.eu/rss/press.html'
  },
  {
    id: 'boe_news',
    label: 'Bank of England News',
    url: 'https://www.bankofengland.co.uk/rss/news'
  }
]

const GDELT_QUERIES: GdeltQueryDef[] = [
  {
    id: 'gdelt_geopolitics',
    label: 'Geopolitical stress around gold safe-haven flows',
    category: 'geopoliticalEvents',
    query: '(gold OR "safe haven") AND (war OR conflict OR sanctions OR tariff OR missile OR strike OR ceasefire OR election)'
  },
  {
    id: 'gdelt_country_actions',
    label: 'Central bank and sovereign policy actions',
    category: 'countryActions',
    query: '("central bank" OR "Federal Reserve" OR ECB OR BOE OR BOJ OR PBOC OR "Ministry of Finance") AND (policy OR intervention OR reserve OR tariff OR sanctions OR statement) AND (gold OR dollar OR yield)'
  },
  {
    id: 'gdelt_dollar_yields',
    label: 'US dollar and yield narrative around gold',
    category: 'dollarAndYieldDrivers',
    query: '("US dollar" OR DXY OR "Treasury yield" OR "real yield" OR inflation) AND (gold OR XAU)'
  }
]

export function parseFredCsv(csv: string): TimePoint[] {
  const normalized = csv.trim()

  if (!normalized) {
    throw new Error('Empty CSV payload')
  }

  if (/^<!DOCTYPE html>/i.test(normalized) || /^<html/i.test(normalized)) {
    throw new Error('Unexpected HTML payload instead of FRED CSV')
  }

  const lines = normalized.split(/\r?\n/)
  if (lines.length < 2 || !lines[0].includes(',')) {
    throw new Error('Malformed FRED CSV payload')
  }

  const points: TimePoint[] = []

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const [dateRaw, valueRaw] = line.split(',', 2)
    if (!dateRaw || !valueRaw) continue
    const date = dateRaw.trim()
    const valueText = valueRaw.trim()

    if (!date || valueText === '.' || valueText === '') continue

    const value = Number(valueText)
    if (!Number.isFinite(value)) continue

    points.push({ date, value })
  }

  if (points.length === 0) {
    throw new Error('No valid numeric observations in FRED CSV payload')
  }

  return points
}

export function parseStooqDailyCsv(csv: string): TimePoint[] {
  const normalized = csv.trim()
  if (!normalized) {
    throw new Error('Empty Stooq payload')
  }

  const lines = normalized.split(/\r?\n/)
  if (lines.length < 2 || lines[0].trim().toLowerCase() !== 'date,open,high,low,close') {
    throw new Error('Malformed Stooq daily CSV payload')
  }

  const points: TimePoint[] = []

  for (const line of lines.slice(1)) {
    const [date, _open, _high, _low, close] = line.split(',')
    if (!date || !close) continue
    const value = Number(close)
    if (!Number.isFinite(value)) continue
    points.push({ date, value })
  }

  if (points.length === 0) {
    throw new Error('No valid close prices in Stooq payload')
  }

  return points
}

export function parseRssItems(xml: string, fallbackSource: string): NewsItem[] {
  const normalized = xml.trim()
  if (!normalized || !normalized.startsWith('<')) {
    throw new Error('Malformed RSS payload')
  }

  const $ = load(normalized, { xmlMode: true })
  const items: NewsItem[] = []

  $('item').each((_i, el) => {
    const title = $(el).find('title').first().text().trim()
    const link = $(el).find('link').first().text().trim()
    const pubDate = $(el).find('pubDate').first().text().trim()
    const source = $(el).find('source').first().text().trim() || fallbackSource

    const publishedAt = toIsoDate(pubDate)
    if (!title || !link || !publishedAt) return

    items.push({
      title,
      url: link,
      publishedAt,
      source,
      category: 'policy_statement'
    })
  })

  if (items.length === 0) {
    $('entry').each((_i, el) => {
      const title = $(el).find('title').first().text().trim()
      const link = $(el).find('link').first().attr('href') || ''
      const updated = $(el).find('updated').first().text().trim()
      const publishedAt = toIsoDate(updated)

      if (!title || !link || !publishedAt) return

      items.push({
        title,
        url: link,
        publishedAt,
        source: fallbackSource,
        category: 'policy_statement'
      })
    })
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

function toIsoDate(dateText: string): string | null {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

function calcChangePct(points: TimePoint[], offset: number): number | null {
  const latest = points.at(-1)
  const previous = points.at(-(offset + 1))

  if (!latest || !previous || previous.value === 0) {
    return null
  }

  const pct = ((latest.value - previous.value) / previous.value) * 100
  return Number(pct.toFixed(2))
}

function normalizeUrl(value: string): string {
  try {
    return new URL(value).toString()
  } catch {
    return value
  }
}

async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs)
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  return res.text()
}

function parseGdeltSeendate(input: string): string | null {
  const match = input.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (!match) return null

  const [, y, m, d, hh, mm, ss] = match
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`
}

async function fetchFredFactor(def: FredFactorDef): Promise<{ factor: FactorSnapshot; status: SourceStatus }> {
  const statusBase = {
    id: def.id,
    label: def.name,
    kind: 'factor' as const,
    fetchedAt: new Date().toISOString()
  }

  try {
    const csvUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${def.seriesId}`
    const csv = await fetchText(csvUrl)
    const points = parseFredCsv(csv)
    const latest = points.at(-1) || null

    const factor: FactorSnapshot = {
      id: def.id,
      name: def.name,
      source: `FRED:${def.seriesId}`,
      unit: def.unit,
      relationToGold: def.relationToGold,
      latest,
      change1dPct: calcChangePct(points, 1),
      change5dPct: calcChangePct(points, 5),
      change20dPct: calcChangePct(points, 20),
      recent: points.slice(-MAX_RECENT_POINTS)
    }

    return {
      factor,
      status: {
        ...statusBase,
        ok: true,
        count: points.length
      }
    }
  } catch (error) {
    return {
      factor: {
        id: def.id,
        name: def.name,
        source: `FRED:${def.seriesId}`,
        unit: def.unit,
        relationToGold: def.relationToGold,
        latest: null,
        change1dPct: null,
        change5dPct: null,
        change20dPct: null,
        recent: []
      },
      status: {
        ...statusBase,
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

async function fetchGoldSpotFactor(): Promise<{ factor: FactorSnapshot; status: SourceStatus }> {
  const statusBase = {
    id: 'gold_spot_xauusd',
    label: 'Gold Spot XAUUSD',
    kind: 'factor' as const,
    fetchedAt: new Date().toISOString()
  }

  try {
    const csv = await fetchText('https://stooq.com/q/d/l/?s=xauusd&i=d')
    const points = parseStooqDailyCsv(csv)
    const latest = points.at(-1) || null

    const factor: FactorSnapshot = {
      id: 'gold_spot_xauusd',
      name: 'Gold Spot XAUUSD',
      source: 'Stooq:xauusd',
      unit: 'USD/oz',
      relationToGold: 'context',
      latest,
      change1dPct: calcChangePct(points, 1),
      change5dPct: calcChangePct(points, 5),
      change20dPct: calcChangePct(points, 20),
      recent: points.slice(-MAX_RECENT_POINTS)
    }

    return {
      factor,
      status: {
        ...statusBase,
        ok: true,
        count: points.length
      }
    }
  } catch (error) {
    return {
      factor: {
        id: 'gold_spot_xauusd',
        name: 'Gold Spot XAUUSD',
        source: 'Stooq:xauusd',
        unit: 'USD/oz',
        relationToGold: 'context',
        latest: null,
        change1dPct: null,
        change5dPct: null,
        change20dPct: null,
        recent: []
      },
      status: {
        ...statusBase,
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

async function fetchPolicyFeed(def: PolicyFeedDef): Promise<{ items: NewsItem[]; status: SourceStatus }> {
  const statusBase = {
    id: def.id,
    label: def.label,
    kind: 'policy_feed' as const,
    fetchedAt: new Date().toISOString()
  }

  try {
    const xml = await fetchText(def.url)
    const items = parseRssItems(xml, def.label)
      .slice(0, 10)
      .map(item => ({ ...item, source: def.label, category: 'policy_statement' }))

    return {
      items,
      status: {
        ...statusBase,
        ok: true,
        count: items.length
      }
    }
  } catch (error) {
    return {
      items: [],
      status: {
        ...statusBase,
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

async function fetchGdeltQuery(def: GdeltQueryDef): Promise<{ items: NewsItem[]; status: SourceStatus }> {
  const statusBase = {
    id: def.id,
    label: def.label,
    kind: 'event_feed' as const,
    fetchedAt: new Date().toISOString()
  }

  try {
    const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc')
    url.searchParams.set('query', def.query)
    url.searchParams.set('mode', 'ArtList')
    url.searchParams.set('maxrecords', '25')
    url.searchParams.set('format', 'json')
    url.searchParams.set('sort', 'datedesc')

    const res = await fetch(url.toString(), {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(20_000)
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const payload = await res.json() as {
      articles?: Array<{
        title?: string
        url?: string
        domain?: string
        seendate?: string
        language?: string
      }>
    }

    const items = (payload.articles || [])
      .filter(article => {
        const language = (article.language || '').toLowerCase()
        return language === '' || language === 'english'
      })
      .map(article => {
        const publishedAt = parseGdeltSeendate(article.seendate || '')
        if (!article.title || !article.url || !publishedAt) return null

        return {
          title: article.title.trim(),
          url: normalizeUrl(article.url),
          publishedAt,
          source: article.domain || 'gdelt',
          category: def.category
        } satisfies NewsItem
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, 15)

    return {
      items,
      status: {
        ...statusBase,
        ok: true,
        count: items.length
      }
    }
  } catch (error) {
    return {
      items: [],
      status: {
        ...statusBase,
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

function dedupeNews(items: NewsItem[]): NewsItem[] {
  const unique = new Map<string, NewsItem>()

  for (const item of items) {
    const key = `${item.title.toLowerCase()}|${item.url}`
    const existing = unique.get(key)

    if (!existing || existing.publishedAt < item.publishedAt) {
      unique.set(key, item)
    }
  }

  return [...unique.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

function isStale(isoDate: string, staleDays: number): boolean {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return true

  const ageMs = Date.now() - date.getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  return ageDays > staleDays
}

export function assessCoverage(data: {
  factors: FactorSnapshot[]
  policyStatements: NewsItem[]
  geopoliticalEvents: NewsItem[]
  countryActions: NewsItem[]
  dollarAndYieldDrivers: NewsItem[]
  sourceStatus: SourceStatus[]
}): CoverageReport {
  const requiredFactors = data.factors.length
  const availableFactors = data.factors.filter(f => f.latest !== null).length
  const missingFactors = data.factors
    .filter(f => f.latest === null)
    .map(f => f.name)

  const staleFactors = data.factors
    .filter(f => f.latest && isStale(f.latest.date, STALE_FACTOR_DAYS))
    .map(f => `${f.name} (${f.latest?.date})`)

  const sourceFailures = data.sourceStatus
    .filter(status => !status.ok)
    .map(status => ({ id: status.id, error: status.error || 'Unknown error' }))

  const policyCount = data.policyStatements.length
  const geopoliticalCount = data.geopoliticalEvents.length
  const countryActionCount = data.countryActions.length
  const dollarYieldCount = data.dollarAndYieldDrivers.length

  const healthy =
    missingFactors.length === 0 &&
    staleFactors.length === 0 &&
    policyCount >= MIN_NEWS_PER_CATEGORY &&
    geopoliticalCount >= MIN_NEWS_PER_CATEGORY &&
    countryActionCount >= MIN_NEWS_PER_CATEGORY &&
    dollarYieldCount >= MIN_NEWS_PER_CATEGORY

  return {
    requiredFactors,
    availableFactors,
    missingFactors,
    staleFactors,
    minNewsRequired: MIN_NEWS_PER_CATEGORY,
    policyCount,
    geopoliticalCount,
    countryActionCount,
    dollarYieldCount,
    sourceFailures,
    healthy
  }
}

export async function fetchFirstPrinciplesData(): Promise<FirstPrinciplesData> {
  const factorPromises = [
    fetchGoldSpotFactor(),
    ...FRED_FACTOR_DEFS.map(fetchFredFactor)
  ]

  const policyPromises = POLICY_FEEDS.map(fetchPolicyFeed)
  const gdeltPromises = GDELT_QUERIES.map(fetchGdeltQuery)

  const [factorResults, policyResults, gdeltResults] = await Promise.all([
    Promise.all(factorPromises),
    Promise.all(policyPromises),
    Promise.all(gdeltPromises)
  ])

  const factors = factorResults.map(result => result.factor)
  const sourceStatus: SourceStatus[] = [
    ...factorResults.map(result => result.status),
    ...policyResults.map(result => result.status),
    ...gdeltResults.map(result => result.status)
  ]

  const policyStatements = dedupeNews([
    ...policyResults.flatMap(result => result.items)
  ]).slice(0, 20)

  const geopoliticalEvents = dedupeNews(
    gdeltResults
      .filter(result => result.status.id === 'gdelt_geopolitics')
      .flatMap(result => result.items)
      .map(item => ({ ...item, category: 'geopolitical_event' }))
  ).slice(0, 20)

  const countryActions = dedupeNews(
    gdeltResults
      .filter(result => result.status.id === 'gdelt_country_actions')
      .flatMap(result => result.items)
      .map(item => ({ ...item, category: 'country_action' }))
  ).slice(0, 20)

  const dollarAndYieldDrivers = dedupeNews(
    gdeltResults
      .filter(result => result.status.id === 'gdelt_dollar_yields')
      .flatMap(result => result.items)
      .map(item => ({ ...item, category: 'dollar_yield_driver' }))
  ).slice(0, 20)

  const coverage = assessCoverage({
    factors,
    policyStatements,
    geopoliticalEvents,
    countryActions,
    dollarAndYieldDrivers,
    sourceStatus
  })

  return {
    fetchedAt: new Date().toISOString(),
    factors,
    policyStatements,
    geopoliticalEvents,
    countryActions,
    dollarAndYieldDrivers,
    sourceStatus,
    coverage
  }
}
