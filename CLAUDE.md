# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Investment analysis system for gold prices across multiple markets. Fetches real-time and historical data from Vietnam, China, Russia, India, and international (XAUUSD) sources. All prices are normalized to VND for easy comparison.

## Codebase Overview

This codebase is a Bun/TypeScript batch pipeline that pulls multi-source market data, normalizes values into VND, computes analytics (premium and drawdown metrics), and renders a static dashboard artifact. Daily and weekly GitHub Actions workflows execute these jobs and publish results via GitHub Pages.

**Stack**: Bun, TypeScript, Cheerio, Chart.js, GitHub Actions/Pages  
**Structure**: single-repo CLI pipeline with adapter modules under `src/sources/` and file-based outputs under `data/`

For detailed architecture, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **HTTP:** Native fetch + cheerio for scraping
- **Charts:** Chart.js (via generated HTML)

## Commands

```bash
# Install
bun install

# Fetch current prices (all markets, normalized to VND)
bun run fetch:all

# Fetch historical data (default 30 days)
bun run fetch:history
bun run fetch:history 60    # custom days

# Generate interactive dashboard
bun run dashboard           # creates data/dashboard.html

# Analyze drawdowns (price drops & recovery times)
bun run analyze:drawdowns      # default 10% threshold
bun run analyze:drawdowns 5    # 5% threshold (more drawdowns)
bun run analyze:drawdowns 15   # 15% threshold (only major drops)

# Fetch individual sources
bun run fetch:vietnam          # Current prices
bun run fetch:vietnam-history  # 1 year SJC history (webgia.com)
bun run fetch:world            # Uses TwelveData -> FreeGoldAPI fallback
bun run fetch:twelvedata       # Test TwelveData directly
bun run fetch:china
bun run fetch:russia
bun run fetch:india
```

## Architecture

```
src/
├── types.ts                    # Shared types
├── fetch-all.ts                # Current prices (normalized to VND)
├── fetch-history.ts            # International historical data
├── fetch-long-history.ts       # Extended history (up to 19 years)
├── analyze-drawdowns.ts        # Drawdown & recovery analysis
├── generate-dashboard.ts       # Interactive dashboard generator
└── sources/
    ├── twelvedata/             # XAUUSD primary (TwelveData API)
    ├── international/          # XAUUSD with fallback chain
    ├── vietnam/
    │   ├── index.ts            # Current prices (giavang.org)
    │   └── history.ts          # 1 year SJC history (webgia.com)
    ├── china/                  # CNY (goldprice.org API)
    ├── russia/                 # RUB (goldprice.org API)
    ├── india/                  # IBJA 24K (ibjarates.com)
    ├── exchange-rate/          # USD/VND, CNY, RUB, INR rates
    └── premium/                # Vietnam premium calculation
```

## Output Files

```
data/
├── latest.json           # Current prices (all markets, normalized)
├── history.json          # 30-day international history
├── history-Ny.json       # N-year history (TwelveData, up to 19y)
├── vietnam-history.json  # Daily collected Vietnam snapshots
├── vietnam-history-1y.json # 1 year SJC history (webgia.com)
├── drawdowns.json        # Drawdown analysis results
├── history.csv           # CSV for external charting tools
└── dashboard.html        # Interactive dashboard with annotations
```

## Key Conversions

- 1 troy ounce = 31.1035 grams
- 1 tael (lượng) = 37.5 grams (Vietnam)
- All prices normalized to VND using live exchange rates
- Vietnam premium = (SJC - International) / International × 100%

## Trading Days (Important)

Vàng quốc tế (XAUUSD) chỉ giao dịch vào ngày làm việc:
- **Không có giao dịch** vào thứ 7, chủ nhật, và ngày nghỉ lễ quốc tế
- TwelveData cung cấp dữ liệu 7 ngày/tuần (carry forward giá từ ngày giao dịch trước)
- FreeGoldAPI chỉ có dữ liệu trading days (~19-22 ngày trong 30 ngày lịch)
- Khi so sánh dữ liệu lịch sử từ nhiều nguồn, chỉ so sánh các ngày có dữ liệu từ tất cả nguồn

## Data Sources

| Market | Source | API/Scrape | Notes |
|--------|--------|------------|-------|
| XAUUSD | TwelveData | API | Primary, 19 years history, requires API key |
| XAUUSD | FreeGoldAPI | API | Fallback, yahoo_finance feed |
| Vietnam | giavang.org | Scrape | Current SJC Miếng & Nhẫn prices |
| Vietnam | webgia.com | Scrape | 1 year SJC historical data |
| China | goldprice.org | API | CNY/gram |
| Russia | goldprice.org | API | RUB/gram |
| India | ibjarates.com | Scrape | IBJA 24K (per 10g, converted) |
| Rates | exchangerate-api | API | USD/VND, CNY, RUB, INR |

## Environment Variables

```bash
# .env (local) or GitHub Secrets (CI)
TWELVEDATA_API_KEY=xxx   # Required for TwelveData source
```

## Typical Output

```
📊 PRICES PER GRAM (sorted low to high)
----------------------------------------------------------------------
Country        Source                                  VND/g   vs Intl
----------------------------------------------------------------------
China          GoldPrice.org-CNY                   4,257,067     -0.1%
International  FreeGoldAPI                         4,261,100    (base)
Russia         GoldPrice.org-RUB                   4,272,869     +0.3%
India          IBJA-gold 999                       4,519,819     +6.1%
Vietnam        SJC Nhẫn                            4,709,333    +10.5%
Vietnam        SJC Miếng                           4,728,000    +11.0%
```
