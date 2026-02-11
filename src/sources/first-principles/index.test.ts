import { describe, expect, test } from 'bun:test'

import { assessCoverage, parseFredCsv, parseRssItems, parseStooqDailyCsv } from './index'

describe('parseFredCsv', () => {
  test('parses valid FRED CSV and skips missing points', () => {
    const csv = [
      'observation_date,DFII10',
      '2026-02-05,1.72',
      '2026-02-06,.',
      '2026-02-09,1.70'
    ].join('\n')

    const points = parseFredCsv(csv)
    expect(points).toEqual([
      { date: '2026-02-05', value: 1.72 },
      { date: '2026-02-09', value: 1.7 }
    ])
  })

  test('throws on HTML payload', () => {
    const html = '<!DOCTYPE html><html><head></head><body>error</body></html>'
    expect(() => parseFredCsv(html)).toThrow('Unexpected HTML payload')
  })
})

describe('parseStooqDailyCsv', () => {
  test('parses daily close series', () => {
    const csv = [
      'Date,Open,High,Low,Close',
      '2026-02-10,5059.99,5078.405,4990.33,5025.48',
      '2026-02-11,5027.43,5118.05,5022.23,5070.85'
    ].join('\n')

    const points = parseStooqDailyCsv(csv)
    expect(points).toEqual([
      { date: '2026-02-10', value: 5025.48 },
      { date: '2026-02-11', value: 5070.85 }
    ])
  })
})

describe('parseRssItems', () => {
  test('parses RSS item entries', () => {
    const xml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Policy update</title>
            <link>https://example.com/policy</link>
            <pubDate>Wed, 11 Feb 2026 10:00:00 GMT</pubDate>
            <source>Central Bank</source>
          </item>
        </channel>
      </rss>
    `

    const items = parseRssItems(xml, 'Fallback Source')
    expect(items.length).toBe(1)
    expect(items[0]?.title).toBe('Policy update')
    expect(items[0]?.url).toBe('https://example.com/policy')
    expect(items[0]?.source).toBe('Central Bank')
  })
})

describe('assessCoverage', () => {
  test('marks payload healthy when requirements are met', () => {
    const coverage = assessCoverage({
      factors: [
        {
          id: 'gold',
          name: 'Gold',
          source: 'x',
          unit: 'USD/oz',
          relationToGold: 'context',
          latest: { date: '2026-02-11', value: 5070 },
          change1dPct: 1,
          change5dPct: 2,
          change20dPct: 3,
          recent: []
        }
      ],
      policyStatements: [
        { title: 'a', url: 'https://a', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'policy' },
        { title: 'b', url: 'https://b', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'policy' },
        { title: 'c', url: 'https://c', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'policy' }
      ],
      geopoliticalEvents: [
        { title: 'a', url: 'https://a1', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'geo' },
        { title: 'b', url: 'https://b1', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'geo' },
        { title: 'c', url: 'https://c1', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'geo' }
      ],
      countryActions: [
        { title: 'a', url: 'https://a2', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'act' },
        { title: 'b', url: 'https://b2', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'act' },
        { title: 'c', url: 'https://c2', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'act' }
      ],
      dollarAndYieldDrivers: [
        { title: 'a', url: 'https://a3', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'dxy' },
        { title: 'b', url: 'https://b3', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'dxy' },
        { title: 'c', url: 'https://c3', publishedAt: '2026-02-11T00:00:00Z', source: 's', category: 'dxy' }
      ],
      sourceStatus: []
    })

    expect(coverage.healthy).toBeTrue()
    expect(coverage.missingFactors.length).toBe(0)
  })

  test('reports missing factors and low news counts', () => {
    const coverage = assessCoverage({
      factors: [
        {
          id: 'gold',
          name: 'Gold',
          source: 'x',
          unit: 'USD/oz',
          relationToGold: 'context',
          latest: null,
          change1dPct: null,
          change5dPct: null,
          change20dPct: null,
          recent: []
        }
      ],
      policyStatements: [],
      geopoliticalEvents: [],
      countryActions: [],
      dollarAndYieldDrivers: [],
      sourceStatus: [{ id: 'x', label: 'x', kind: 'factor', ok: false, count: 0, fetchedAt: '2026-02-11T00:00:00Z', error: 'boom' }]
    })

    expect(coverage.healthy).toBeFalse()
    expect(coverage.missingFactors).toContain('Gold')
    expect(coverage.sourceFailures.length).toBe(1)
  })
})
