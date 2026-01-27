export interface GoldPrice {
  source: string
  country: string
  currency: string
  pricePerGram?: number
  pricePerOunce?: number
  pricePerTael?: number // Vietnam uses tael (lượng)
  buyPrice?: number
  sellPrice?: number
  timestamp: Date
  raw?: unknown
}

export interface HistoricalPrice {
  date: string // YYYY-MM-DD
  pricePerGram: number
  pricePerOunce?: number
  currency: string
}

export interface GoldPriceHistory {
  source: string
  country: string
  currency: string
  data: HistoricalPrice[]
}

export interface PremiumDiscount {
  country: string
  premium: number // positive = premium, negative = discount
  benchmark: number // international price
  localPrice: number
  timestamp: Date
}

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type GoldSource = {
  name: string
  country: string
  fetch: () => Promise<FetchResult<GoldPrice[]>>
  fetchHistory?: (days: number) => Promise<FetchResult<GoldPriceHistory>>
}
