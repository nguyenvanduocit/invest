# API Surface

## Endpoints

### CLI Command Surface

| Method | Path | Handler | Auth | Description |
|--------|------|---------|------|-------------|
| CLI | `bun run build` | `src/main.ts` | N/A | Scheduled orchestration: fetch current data, collect snapshot, analyze drawdowns, generate dashboard |
| CLI | `bun run backfill` | `src/backfill.ts` | N/A | Weekly orchestration: refresh international history + backfill Vietnam snapshots |
| CLI | `bun run src/fetch-all.ts` | `main()` in `src/fetch-all.ts` | N/A | Aggregates global spot prices and writes `data/latest.json` |
| CLI | `bun run src/fetch-history.ts [days]` | `main()` in `src/fetch-history.ts` | N/A | Fetches historical international prices and writes `data/history.json` |
| CLI | `bun run src/fetch-long-history.ts [years]` | `main()` in `src/fetch-long-history.ts` | N/A | Builds long-history datasets (`data/history-Ny.json`) |
| CLI | `bun run src/collect-daily.ts` | `main()` in `src/collect-daily.ts` | N/A | Upserts today’s Vietnam + international snapshot |
| CLI | `bun run src/backfill-vietnam.ts` | `main()` in `src/backfill-vietnam.ts` | N/A | Merges webgia + TwelveData history into `data/vietnam-history.json` |
| CLI | `bun run src/update-vietnam-daily.ts` | `main()` in `src/update-vietnam-daily.ts` | N/A | Uses VNAppMob + TwelveData to append latest Vietnam record |
| CLI | `bun run src/analyze-drawdowns.ts [minPct] [file]` | `main()` in `src/analyze-drawdowns.ts` | N/A | Computes drawdown/recovery windows and writes `data/drawdowns.json` |
| CLI | `bun run src/generate-dashboard.ts` | module body in `src/generate-dashboard.ts` | N/A | Renders `data/dashboard.html` from JSON artifacts |

### Source Adapter Entrypoints (module APIs)

| Method | Path | Handler | Auth | Description |
|--------|------|---------|------|-------------|
| Function | `sources/international.fetchAll()` | `src/sources/international/index.ts` | Optional `GOLDAPI_KEY` | International price with fallback chain (TwelveData -> FreeGold -> GoldAPI) |
| Function | `sources/international.fetchHistory(days)` | `src/sources/international/index.ts` | TwelveData key preferred | Historical XAU/USD with fallback to FreeGold |
| Function | `sources/twelvedata.fetchCurrent/fetchHistory` | `src/sources/twelvedata/index.ts` | `TWELVEDATA_API_KEY` | Primary XAU/USD provider |
| Function | `sources/vnappmob.fetchCurrent()` | `src/sources/vnappmob/index.ts` | `VNAPPMOB_API_KEY` | Current Vietnam SJC API integration |

## Authentication

No user authentication is implemented because the system is a local/CI CLI pipeline. Authentication appears only as outbound provider credentials via environment variables (API keys/Bearer tokens).

## Request/Response Schemas

### `fetch-all` output (`data/latest.json`)

**Request**:
```text
CLI invocation: bun run src/fetch-all.ts
No body arguments.
```

**Response**:
```json
{
  "timestamp": "ISO-8601",
  "normalized": [{ "source": "", "country": "", "originalCurrency": "", "vndPerGram": 0, "vndPerTael": 0 }],
  "raw": { "vietnam": [], "international": [], "china": [], "russia": [], "india": [] },
  "exchangeRates": { "USD": 1, "VND": 0, "CNY": 0, "RUB": 0, "INR": 0 },
  "vietnamPremium": { "premiumPercent": 0, "benchmarkVND": 0, "localPriceVND": 0 }
}
```

### `collect-daily` output (`data/vietnam-history.json`)

**Request**:
```text
CLI invocation: bun run src/collect-daily.ts
```

**Response**:
```json
{
  "lastUpdated": "ISO-8601",
  "snapshots": [
    {
      "date": "YYYY-MM-DD",
      "timestamp": "ISO-8601",
      "sjcMieng": { "buy": 0, "sell": 0 },
      "international": { "usdPerOunce": 0, "vndPerTael": 0 },
      "exchangeRate": 0,
      "premium": 0
    }
  ]
}
```

### `analyze-drawdowns` output (`data/drawdowns.json`)

**Request**:
```text
CLI invocation: bun run src/analyze-drawdowns.ts [min_drawdown_pct] [data_file]
Defaults: 10, data/history-19y.json
```

**Response**:
```json
{
  "analyzedAt": "ISO-8601",
  "summary": {
    "totalDrawdowns": 0,
    "recovered": 0,
    "notRecovered": 0,
    "worstDrawdownPct": 0,
    "longestRecoveryDays": 0,
    "avgRecoveryDays": 0
  },
  "drawdowns": [
    {
      "peakDate": "YYYY-MM-DD",
      "troughDate": "YYYY-MM-DD",
      "drawdownPct": 0,
      "recoveryDate": "YYYY-MM-DD|null",
      "daysToTrough": 0,
      "daysToRecovery": 0,
      "recovered": true
    }
  ]
}
```

## Error Handling

Errors are handled locally per command/module with `FetchResult<T>` discriminated unions (`{ ok: true, data } | { ok: false, error }`) and `try/catch` wrappers around network/parsing operations. CLI entrypoints log failure reasons and generally terminate via `process.exit(1)` for hard failures. Multi-source collectors use partial-failure tolerance by aggregating warnings and continuing when at least one source succeeds.
