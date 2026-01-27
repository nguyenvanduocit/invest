// Generate an HTML chart from historical data

const historyFile = Bun.file('data/history.json')

if (!await historyFile.exists()) {
  console.error('No history data found. Run: bun run fetch:history')
  process.exit(1)
}

const history = await historyFile.json() as {
  fetchedAt: string
  days: number
  exchangeRate: { usdVnd: number }
  data: Array<{
    date: string
    usdPerOunce: number
    vndPerGram: number
    vndPerTael: number
  }>
}

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Gold Price Chart - ${history.days} Days</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      padding: 20px;
    }
    h1 { text-align: center; margin-bottom: 10px; color: #ffd700; }
    .subtitle { text-align: center; color: #888; margin-bottom: 30px; }
    .chart-container {
      background: #16213e;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #16213e;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
    }
    .stat-card .label { color: #888; font-size: 12px; margin-bottom: 5px; }
    .stat-card .value { font-size: 24px; font-weight: bold; }
    .stat-card .value.up { color: #4caf50; }
    .stat-card .value.down { color: #f44336; }
    .stat-card .value.gold { color: #ffd700; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 10px;
      text-align: right;
      border-bottom: 1px solid #333;
    }
    th { color: #888; font-weight: normal; }
    td:first-child, th:first-child { text-align: left; }
    .change-up { color: #4caf50; }
    .change-down { color: #f44336; }
  </style>
</head>
<body>
  <h1>📈 Gold Price Chart</h1>
  <p class="subtitle">Last ${history.data.length} trading days | Updated: ${new Date(history.fetchedAt).toLocaleString()}</p>

  <div class="stats">
    <div class="stat-card">
      <div class="label">Current Price</div>
      <div class="value gold">${history.data.at(-1)?.vndPerTael.toLocaleString()} ₫/tael</div>
    </div>
    <div class="stat-card">
      <div class="label">USD Price</div>
      <div class="value gold">$${history.data.at(-1)?.usdPerOunce.toLocaleString()}/oz</div>
    </div>
    <div class="stat-card">
      <div class="label">Period Change</div>
      <div class="value ${((history.data.at(-1)?.vndPerTael || 0) - (history.data[0]?.vndPerTael || 0)) >= 0 ? 'up' : 'down'}">
        ${(((history.data.at(-1)?.vndPerTael || 0) - (history.data[0]?.vndPerTael || 0)) / (history.data[0]?.vndPerTael || 1) * 100).toFixed(2)}%
      </div>
    </div>
    <div class="stat-card">
      <div class="label">Exchange Rate</div>
      <div class="value">1 USD = ${history.exchangeRate.usdVnd.toLocaleString()} ₫</div>
    </div>
  </div>

  <div class="chart-container">
    <canvas id="priceChart"></canvas>
  </div>

  <div class="chart-container">
    <canvas id="usdChart"></canvas>
  </div>

  <div class="chart-container">
    <h3 style="margin-bottom: 15px; color: #ffd700;">📊 Daily Data</h3>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>USD/oz</th>
          <th>VND/gram</th>
          <th>VND/tael</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody>
        ${history.data.map((p, i) => {
          const prev = history.data[i - 1]
          const change = prev ? ((p.vndPerTael - prev.vndPerTael) / prev.vndPerTael * 100) : 0
          const changeClass = change > 0 ? 'change-up' : change < 0 ? 'change-down' : ''
          const changeStr = prev ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%` : '-'
          return `<tr>
            <td>${p.date}</td>
            <td>$${p.usdPerOunce.toLocaleString()}</td>
            <td>${p.vndPerGram.toLocaleString()}</td>
            <td>${p.vndPerTael.toLocaleString()}</td>
            <td class="${changeClass}">${changeStr}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>

  <script>
    const data = ${JSON.stringify(history.data)};
    const labels = data.map(d => d.date);
    const vndPrices = data.map(d => d.vndPerTael);
    const usdPrices = data.map(d => d.usdPerOunce);

    // VND Chart
    new Chart(document.getElementById('priceChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'VND/tael',
          data: vndPrices,
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255, 215, 0, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Gold Price in VND (per tael)', color: '#fff' },
          legend: { display: false }
        },
        scales: {
          x: { ticks: { color: '#888' }, grid: { color: '#333' } },
          y: {
            ticks: {
              color: '#888',
              callback: v => v.toLocaleString() + ' ₫'
            },
            grid: { color: '#333' }
          }
        }
      }
    });

    // USD Chart
    new Chart(document.getElementById('usdChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'USD/oz',
          data: usdPrices,
          borderColor: '#4fc3f7',
          backgroundColor: 'rgba(79, 195, 247, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Gold Price in USD (per troy ounce)', color: '#fff' },
          legend: { display: false }
        },
        scales: {
          x: { ticks: { color: '#888' }, grid: { color: '#333' } },
          y: {
            ticks: {
              color: '#888',
              callback: v => '$' + v.toLocaleString()
            },
            grid: { color: '#333' }
          }
        }
      }
    });
  </script>
</body>
</html>`

await Bun.write('data/chart.html', html)
console.log('Chart generated: data/chart.html')
console.log('Open in browser to view')
