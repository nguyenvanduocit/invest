# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Investment analysis system for gold prices across multiple markets. Fetches real-time and historical data from Vietnam, China, Russia, India, and international (XAUUSD) sources. All prices are normalized to VND for easy comparison.

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

# Generate interactive chart
bun run chart               # creates data/chart.html

# Fetch individual sources
bun run fetch:vietnam
bun run fetch:world
bun run fetch:china
bun run fetch:russia
bun run fetch:india
```

## Architecture

```
src/
├── types.ts                    # Shared types
├── fetch-all.ts                # Current prices (normalized to VND)
├── fetch-history.ts            # Historical data
├── generate-chart.ts           # HTML chart generator
└── sources/
    ├── vietnam/                # SJC Miếng/Nhẫn (giavang.org)
    ├── international/          # XAUUSD (FreeGoldAPI)
    ├── china/                  # CNY (goldprice.org API)
    ├── russia/                 # RUB (goldprice.org API)
    ├── india/                  # IBJA 24K (ibjarates.com)
    ├── exchange-rate/          # USD/VND, CNY, RUB, INR rates
    └── premium/                # Vietnam premium calculation
```

## Output Files

```
data/
├── latest.json     # Current prices (all markets, normalized)
├── history.json    # Historical data with VND conversion
├── history.csv     # CSV for external charting tools
└── chart.html      # Interactive Chart.js visualization
```

## Key Conversions

- 1 troy ounce = 31.1035 grams
- 1 tael (lượng) = 37.5 grams (Vietnam)
- All prices normalized to VND using live exchange rates
- Vietnam premium = (SJC - International) / International × 100%

## Data Sources

| Market | Source | API/Scrape | Notes |
|--------|--------|------------|-------|
| XAUUSD | FreeGoldAPI | API | yahoo_finance feed, historical available |
| Vietnam | giavang.org | Scrape | SJC Miếng (bars) & Nhẫn (rings) |
| China | goldprice.org | API | CNY/gram |
| Russia | goldprice.org | API | RUB/gram |
| India | ibjarates.com | Scrape | IBJA 24K (per 10g, converted) |
| Rates | exchangerate-api | API | USD/VND, CNY, RUB, INR |

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
