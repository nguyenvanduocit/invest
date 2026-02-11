# Key Flows

## Daily Build and Publish

Triggered by `bun run build` (manually or `.github/workflows/collect-daily.yml`) to refresh all outputs and publish the dashboard.

```mermaid
sequenceDiagram
    actor Scheduler as GitHub Actions
    participant Main as src/main.ts
    participant FetchAll as src/fetch-all.ts
    participant Collect as src/collect-daily.ts
    participant Drawdowns as src/analyze-drawdowns.ts
    participant Dashboard as src/generate-dashboard.ts
    participant Data as data/*.json

    Scheduler->>Main: bun run build
    Main->>FetchAll: bun run src/fetch-all.ts
    FetchAll->>Data: write data/latest.json
    Main->>Collect: bun run src/collect-daily.ts
    Collect->>Data: upsert data/vietnam-history.json
    Main->>Drawdowns: bun run src/analyze-drawdowns.ts
    Drawdowns->>Data: write data/drawdowns.json
    Main->>Dashboard: bun run src/generate-dashboard.ts
    Dashboard->>Data: read JSON + write data/dashboard.html
    Main-->>Scheduler: success/failure
```

## International Price Resolution with Fallbacks

Triggered by `fetch-all` and history commands; resolves XAU/USD using primary API then fallbacks.

```mermaid
sequenceDiagram
    participant Task as fetch-all/fetch-history
    participant Intl as sources/international
    participant Twelve as sources/twelvedata
    participant Free as FreeGoldAPI
    participant GoldAPI as GoldAPI.io

    Task->>Intl: fetchAll()/fetchHistory(days)
    Intl->>Twelve: fetchCurrent()/fetchHistory()
    alt TwelveData success
        Twelve-->>Intl: price/history data
        Intl-->>Task: ok
    else TwelveData fails
        Intl->>Free: fetch fallback feed
        alt FreeGold success
            Free-->>Intl: fallback data
            Intl-->>Task: ok
        else FreeGold fails and GOLDAPI key exists
            Intl->>GoldAPI: fetch XAU/USD backup
            GoldAPI-->>Intl: backup data
            Intl-->>Task: ok/error
        end
    end
```

## Regional Aggregation and VND Normalization

Triggered by `src/fetch-all.ts`; concurrently pulls multi-country prices and converts all values to VND.

```mermaid
sequenceDiagram
    participant FetchAll as src/fetch-all.ts
    participant FX as sources/exchange-rate
    participant VN as sources/vietnam
    participant Intl as sources/international
    participant CN as sources/china
    participant RU as sources/russia
    participant IN as sources/india
    participant Premium as sources/premium
    participant Data as data/latest.json

    FetchAll->>FX: fetchAllRates()
    FetchAll->>Intl: fetchAll() (preload XAUUSD)
    FetchAll->>VN: fetchAll() (parallel)
    FetchAll->>CN: fetchAll(xauusdPrice)
    FetchAll->>RU: fetchAll(xauusdPrice)
    FetchAll->>IN: fetchAll()
    FetchAll->>FetchAll: dedupe + normalizeToVND()
    alt SJC and international available
        FetchAll->>Premium: calculateVietnamPremium()
    end
    FetchAll->>Data: write normalized snapshot
```

## Weekly Historical Backfill

Triggered by `.github/workflows/backfill.yml`; updates long-running historical datasets.

```mermaid
sequenceDiagram
    actor Scheduler as Weekly Cron
    participant Backfill as src/backfill.ts
    participant Hist as src/fetch-history.ts
    participant VNBackfill as src/backfill-vietnam.ts
    participant VNHist as sources/vietnam/history
    participant Twelve as sources/twelvedata
    participant Data as data/history.json + data/vietnam-history.json

    Scheduler->>Backfill: bun run backfill
    Backfill->>Hist: bun run src/fetch-history.ts
    Hist->>Twelve: fetch history
    Hist->>Data: write history.json
    Backfill->>VNBackfill: bun run src/backfill-vietnam.ts
    VNBackfill->>VNHist: fetchVietnamHistory(1year)
    VNBackfill->>Twelve: fetchHistory(400)
    VNBackfill->>VNBackfill: match nearby trading dates
    VNBackfill->>Data: merge snapshots + write vietnam-history.json
```
