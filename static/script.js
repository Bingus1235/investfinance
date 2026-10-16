let stockChartInstance = null;
let rsiChartInstance = null;
let macdChartInstance = null;
let lastChartData = null; // store for overlay toggling
let currentSymbol = null;

// ═══════════════ THEME ═══════════════
const themeToggle = document.getElementById('theme-toggle');
const htmlEl = document.documentElement;

themeToggle.checked = true; // start in dark mode
htmlEl.setAttribute("data-theme", "dark");

themeToggle.addEventListener('change', function () {
    htmlEl.setAttribute('data-theme', this.checked ? 'dark' : 'light');
    if (lastChartData) rebuildAllCharts(lastChartData);
});

function getThemeColors() {
    const isDark = themeToggle.checked;
    return {
        textColor: isDark ? '#ffffff' : '#102a43',
        gridColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        accentColor: isDark ? '#f8333c' : '#117ced',
        accentBg: isDark ? 'rgba(248, 51, 60, 0.12)' : 'rgba(17, 124, 237, 0.1)',
        sma50: isDark ? '#ffd600' : '#f9a825',
        sma200: isDark ? '#ab47bc' : '#7b1fa2',
        bbColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
        positive: isDark ? '#00c853' : '#00a844',
        negative: isDark ? '#ff1744' : '#d50000',
        macdSignal: isDark ? '#ffd600' : '#f9a825',
        macdHistPos: isDark ? 'rgba(0,200,83,0.6)' : 'rgba(0,168,68,0.5)',
        macdHistNeg: isDark ? 'rgba(255,23,68,0.6)' : 'rgba(213,0,0,0.5)',
        tooltipBg: isDark ? '#1f2833' : '#ffffff',
        tooltipText: isDark ? '#ffffff' : '#102a43',
    };
}

// ═══════════════ FORMATTERS ═══════════════
function formatMarketCap(val) {
    if (val === null || val === undefined) return 'N/A';
    if (val >= 1e12) return '$' + (val / 1e12).toFixed(2) + 'T';
    if (val >= 1e9) return '$' + (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return '$' + (val / 1e6).toFixed(2) + 'M';
    return '$' + val.toLocaleString();
}

function formatVolume(val) {
    if (val === null || val === undefined) return 'N/A';
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
    return val.toLocaleString();
}

function formatPrice(val) {
    if (val === null || val === undefined) return 'N/A';
    return '$' + parseFloat(val).toFixed(2);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

// ═══════════════ WATCHLIST (localStorage) ═══════════════
function getWatchlist() {
    try {
        return JSON.parse(localStorage.getItem('stockAdvisorWatchlist')) || [];
    } catch { return []; }
}

function saveWatchlist(list) {
    localStorage.setItem('stockAdvisorWatchlist', JSON.stringify(list));
}

function isInWatchlist(symbol) {
    return getWatchlist().includes(symbol.toUpperCase());
}

function toggleWatchlist(symbol) {
    symbol = symbol.toUpperCase();
    let list = getWatchlist();
    if (list.includes(symbol)) {
        list = list.filter(s => s !== symbol);
    } else {
        list.push(symbol);
    }
    saveWatchlist(list);
    renderWatchlist();
    updateWatchlistButton();
}

function renderWatchlist() {
    const container = document.getElementById('watchlist-items');
    const emptyMsg = document.getElementById('watchlist-empty');
    const list = getWatchlist();

    // Remove all chips
    container.querySelectorAll('.watchlist-chip').forEach(el => el.remove());

    if (list.length === 0) {
        emptyMsg.style.display = 'block';
        return;
    }
    emptyMsg.style.display = 'none';

    list.forEach(sym => {
        const chip = document.createElement('div');
        chip.className = 'watchlist-chip';
        chip.innerHTML = `<span class="chip-symbol">${sym}</span><span class="chip-remove">✕</span>`;

        // Click chip symbol to search
        chip.querySelector('.chip-symbol').addEventListener('click', () => {
            document.getElementById('symbol-input').value = sym;
            document.getElementById('stock-form').dispatchEvent(new Event('submit'));
        });

        // Click X to remove
        chip.querySelector('.chip-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleWatchlist(sym);
        });

        container.appendChild(chip);
    });
}

function updateWatchlistButton() {
    const btn = document.getElementById('watchlist-add-btn');
    if (!currentSymbol) return;
    if (isInWatchlist(currentSymbol)) {
        btn.innerText = '★';
        btn.classList.add('active');
    } else {
        btn.innerText = '☆';
        btn.classList.remove('active');
    }
}

// Init watchlist on page load
renderWatchlist();

// Watchlist button click
document.getElementById('watchlist-add-btn').addEventListener('click', () => {
    if (currentSymbol) toggleWatchlist(currentSymbol);
});

// ═══════════════ CHART OVERLAY TOGGLES ═══════════════
document.getElementById('toggle-sma50').addEventListener('change', () => { if (lastChartData) renderMainChart(lastChartData); });
document.getElementById('toggle-sma200').addEventListener('change', () => { if (lastChartData) renderMainChart(lastChartData); });
document.getElementById('toggle-bollinger').addEventListener('change', () => { if (lastChartData) renderMainChart(lastChartData); });

// ═══════════════ FORM SUBMIT ═══════════════
document.getElementById('stock-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const symbol = document.getElementById('symbol-input').value.trim().toUpperCase();
    const period = document.getElementById('period-dropdown').value;
    if (!symbol) return;

    currentSymbol = symbol;

    document.getElementById('error-message').classList.add('error-hidden');
    document.getElementById('results-panel').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');

    try {
        const response = await fetch(`/api/stock/${symbol}?period=${period}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch data');
        }

        lastChartData = data;
        populateStats(data);
        populateCompanyInfo(data);
        populateAnalyst(data);
        populateNews(data);
        rebuildAllCharts(data);
        updateWatchlistButton();

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('results-panel').classList.remove('hidden');

    } catch (error) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error-message').innerText = error.message;
        document.getElementById('error-message').classList.remove('error-hidden');
    }
});

// ═══════════════ POPULATE STATS ═══════════════
function populateStats(data) {
    // Symbol header
    document.getElementById('symbol-name').innerText = data.symbol;
    document.getElementById('price-large').innerText = formatPrice(data.current_price);
    document.getElementById('company-name').innerText = data.company_name || '';

    const sectorBadge = document.getElementById('sector-badge');
    if (data.sector && data.sector !== 'N/A') {
        sectorBadge.innerText = data.sector;
        sectorBadge.style.display = 'inline-block';
    } else {
        sectorBadge.style.display = 'none';
    }

    const changeEl = document.getElementById('price-change');
    if (data.day_change !== null && data.day_change_pct !== null) {
        const sign = data.day_change >= 0 ? '+' : '';
        changeEl.innerText = `${sign}${data.day_change.toFixed(2)} (${sign}${data.day_change_pct.toFixed(2)}%)`;
        changeEl.className = 'price-change ' + (data.day_change >= 0 ? 'positive' : 'negative');
    } else {
        changeEl.innerText = '';
        changeEl.className = 'price-change';
    }

    // Tier 1 cards
    document.getElementById('market-cap-val').innerText = formatMarketCap(data.market_cap);
    document.getElementById('pe-ratio-val').innerText = data.pe_ratio !== null ? data.pe_ratio.toFixed(2) : 'N/A';

    const fwdLabel = document.getElementById('forward-pe-label');
    fwdLabel.innerText = data.forward_pe !== null ? `Forward: ${data.forward_pe.toFixed(2)}` : '';

    document.getElementById('avg-volume-val').innerText = formatVolume(data.avg_volume);
    document.getElementById('dividend-val').innerText = data.dividend_yield !== null ? data.dividend_yield.toFixed(2) + '%' : 'N/A';
    document.getElementById('monthly-up-val').innerText = data.monthly_up + '%';

    // 52-Week Range
    if (data.high_52w !== null && data.low_52w !== null) {
        document.getElementById('range-52w-val').innerText = formatPrice(data.low_52w) + ' – ' + formatPrice(data.high_52w);
        const range = data.high_52w - data.low_52w;
        const pos = range > 0 ? ((data.current_price - data.low_52w) / range) * 100 : 50;
        document.getElementById('range-bar-fill').style.width = '100%';
        document.getElementById('range-bar-marker').style.left = Math.min(Math.max(pos, 0), 100) + '%';
    } else {
        document.getElementById('range-52w-val').innerText = 'N/A';
    }
}

// ═══════════════ POPULATE COMPANY INFO ═══════════════
function populateCompanyInfo(data) {
    document.getElementById('about-company-name').innerText = data.company_name || data.symbol;

    const industryEl = document.getElementById('company-industry');
    if (data.industry && data.industry !== 'N/A' && data.sector && data.sector !== 'N/A') {
        industryEl.innerText = `${data.industry} · ${data.sector}`;
    } else {
        industryEl.innerText = '';
    }

    const descEl = document.getElementById('company-description');
    const section = document.getElementById('company-section');
    if (data.description) {
        descEl.innerText = data.description;
        section.style.display = 'block';

        // Remove old read-more button if exists
        const oldBtn = section.querySelector('.read-more-btn');
        if (oldBtn) oldBtn.remove();

        // Add read-more if text is long
        if (data.description.length > 300) {
            descEl.classList.remove('expanded');
            const btn = document.createElement('button');
            btn.className = 'read-more-btn';
            btn.innerText = 'Read more ▾';
            btn.addEventListener('click', () => {
                descEl.classList.toggle('expanded');
                btn.innerText = descEl.classList.contains('expanded') ? 'Read less ▴' : 'Read more ▾';
            });
            section.appendChild(btn);
        } else {
            descEl.classList.add('expanded');
        }
    } else {
        section.style.display = 'none';
    }
}

// ═══════════════ POPULATE ANALYST ═══════════════
function populateAnalyst(data) {
    const ratingEl = document.getElementById('analyst-rating');
    const countEl = document.getElementById('analyst-count');
    const markerEl = document.getElementById('gauge-marker');

    if (data.recommendation && data.recommendation !== 'N/A') {
        // Format recommendation nicely
        const recMap = {
            'strong_buy': 'Strong Buy',
            'buy': 'Buy',
            'hold': 'Hold',
            'sell': 'Sell',
            'strong_sell': 'Strong Sell',
            'underperform': 'Underperform',
            'overweight': 'Overweight',
            'outperform': 'Outperform'
        };
        ratingEl.innerText = recMap[data.recommendation] || data.recommendation;
    } else {
        ratingEl.innerText = 'N/A';
    }

    if (data.num_analysts) {
        countEl.innerText = `${data.num_analysts} analyst${data.num_analysts > 1 ? 's' : ''}`;
    } else {
        countEl.innerText = '';
    }

    // Position gauge marker: recommendation_mean is 1 (strong buy) to 5 (strong sell)
    if (data.recommendation_mean !== null && data.recommendation_mean !== undefined) {
        const pct = ((data.recommendation_mean - 1) / 4) * 100; // 1→0%, 5→100%
        markerEl.style.left = Math.min(Math.max(pct, 0), 100) + '%';
    } else {
        markerEl.style.left = '50%';
    }
}

// ═══════════════ POPULATE NEWS ═══════════════
function populateNews(data) {
    const grid = document.getElementById('news-grid');
    const section = document.getElementById('news-section');
    grid.innerHTML = '';

    if (!data.news || data.news.length === 0) {
        grid.innerHTML = '<p class="news-empty">No recent news available</p>';
        return;
    }

    data.news.forEach(item => {
        const a = document.createElement('a');
        a.className = 'news-card';
        a.href = item.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.innerHTML = `
            <div class="news-card-content">
                <div class="news-title">${escapeHtml(item.title)}</div>
                <div class="news-meta">${escapeHtml(item.publisher)} · ${formatDate(item.date)}</div>
            </div>
            <span class="news-arrow">→</span>
        `;
        grid.appendChild(a);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// ═══════════════ REBUILD ALL CHARTS ═══════════════
function rebuildAllCharts(data) {
    renderMainChart(data);
    renderRSIChart(data);
    renderMACDChart(data);
}

// ═══════════════ MAIN PRICE CHART ═══════════════
function renderMainChart(data) {
    const ctx = document.getElementById('stockChart').getContext('2d');
    const colors = getThemeColors();
    const chartData = data.chart_data;

    if (stockChartInstance) stockChartInstance.destroy();

    const datasets = [{
        label: 'Close',
        data: chartData.prices,
        borderColor: colors.accentColor,
        backgroundColor: colors.accentBg,
        borderWidth: 2,
        pointRadius: 0,
        pointHitRadius: 10,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.15,
        order: 1
    }];

    // SMA 50
    if (document.getElementById('toggle-sma50').checked) {
        datasets.push({
            label: 'SMA 50',
            data: chartData.sma_50,
            borderColor: colors.sma50,
            borderWidth: 1.5,
            borderDash: [6, 3],
            pointRadius: 0,
            fill: false,
            tension: 0.15,
            order: 2
        });
    }

    // SMA 200
    if (document.getElementById('toggle-sma200').checked) {
        datasets.push({
            label: 'SMA 200',
            data: chartData.sma_200,
            borderColor: colors.sma200,
            borderWidth: 1.5,
            borderDash: [6, 3],
            pointRadius: 0,
            fill: false,
            tension: 0.15,
            order: 3
        });
    }

    // Bollinger Bands
    if (document.getElementById('toggle-bollinger').checked) {
        datasets.push({
            label: 'BB Upper',
            data: chartData.bb_upper,
            borderColor: colors.bbColor,
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
            tension: 0.15,
            order: 4
        });
        datasets.push({
            label: 'BB Lower',
            data: chartData.bb_lower,
            borderColor: colors.bbColor,
            backgroundColor: colors.bbColor,
            borderWidth: 1,
            pointRadius: 0,
            fill: '-1',
            tension: 0.15,
            order: 5
        });
    }

    stockChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: chartData.dates, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: colors.textColor,
                        usePointStyle: true,
                        pointStyle: 'line',
                        font: { size: 12, family: 'Inter' },
                        padding: 16
                    }
                },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    borderColor: colors.accentColor,
                    borderWidth: 1,
                    padding: 10,
                    displayColors: true,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (context.parsed.y !== null) {
                                label += ': ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.textColor, maxTicksLimit: 10, font: { size: 11 } }
                },
                y: {
                    grid: { color: colors.gridColor },
                    ticks: {
                        color: colors.textColor,
                        font: { size: 11 },
                        callback: v => '$' + v.toLocaleString()
                    }
                }
            }
        }
    });
}

// ═══════════════ RSI CHART ═══════════════
function renderRSIChart(data) {
    const ctx = document.getElementById('rsiChart').getContext('2d');
    const colors = getThemeColors();

    if (rsiChartInstance) rsiChartInstance.destroy();

    const latestRSI = data.rsi.filter(v => v !== null);
    const rsiVal = latestRSI.length > 0 ? latestRSI[latestRSI.length - 1] : null;
    const rsiReadingEl = document.getElementById('rsi-reading');
    if (rsiVal !== null) {
        let status = 'Neutral';
        let statusColor = colors.textColor;
        if (rsiVal >= 70) { status = 'Overbought'; statusColor = colors.negative; }
        else if (rsiVal <= 30) { status = 'Oversold'; statusColor = colors.positive; }
        rsiReadingEl.innerHTML = `RSI: <strong style="color:${statusColor}">${rsiVal.toFixed(1)}</strong> — ${status}`;
    } else {
        rsiReadingEl.innerText = '-';
    }

    rsiChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.chart_data.dates,
            datasets: [{
                label: 'RSI',
                data: data.rsi,
                borderColor: colors.accentColor,
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.2,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    borderColor: colors.accentColor,
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => 'RSI: ' + (ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) : '-')
                    }
                }
            },
            scales: {
                x: { display: false },
                y: {
                    min: 0, max: 100,
                    grid: { color: colors.gridColor },
                    ticks: {
                        color: colors.textColor,
                        stepSize: 10,
                        font: { size: 10 }
                    }
                }
            }
        },
        plugins: [{
            id: 'rsiZones',
            beforeDraw(chart) {
                const { ctx: c, chartArea: { left, right }, scales: { y } } = chart;
                const y70 = y.getPixelForValue(70);
                const y100 = y.getPixelForValue(100);
                c.fillStyle = 'rgba(255, 23, 68, 0.06)';
                c.fillRect(left, y100, right - left, y70 - y100);

                const y30 = y.getPixelForValue(30);
                const y0 = y.getPixelForValue(0);
                c.fillStyle = 'rgba(0, 200, 83, 0.06)';
                c.fillRect(left, y30, right - left, y0 - y30);

                c.setLineDash([5, 5]);
                c.strokeStyle = 'rgba(128,128,128,0.4)';
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(left, y70); c.lineTo(right, y70);
                c.moveTo(left, y30); c.lineTo(right, y30);
                c.stroke();
                c.setLineDash([]);
            }
        }]
    });
}

// ═══════════════ MACD CHART ═══════════════
function renderMACDChart(data) {
    const ctx = document.getElementById('macdChart').getContext('2d');
    const colors = getThemeColors();
    const macd = data.macd;

    if (macdChartInstance) macdChartInstance.destroy();

    const histColors = macd.histogram.map(v => v !== null && v >= 0 ? colors.macdHistPos : colors.macdHistNeg);

    const latestMACD = macd.line.filter(v => v !== null);
    const latestSignal = macd.signal.filter(v => v !== null);
    const macdReadingEl = document.getElementById('macd-reading');
    if (latestMACD.length > 0 && latestSignal.length > 0) {
        const m = latestMACD[latestMACD.length - 1];
        const s = latestSignal[latestSignal.length - 1];
        const trend = m > s ? 'Bullish' : 'Bearish';
        const trendColor = m > s ? colors.positive : colors.negative;
        macdReadingEl.innerHTML = `MACD: ${m.toFixed(3)} | Signal: ${s.toFixed(3)} — <strong style="color:${trendColor}">${trend}</strong>`;
    } else {
        macdReadingEl.innerText = '-';
    }

    macdChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.chart_data.dates,
            datasets: [
                {
                    label: 'Histogram',
                    data: macd.histogram,
                    backgroundColor: histColors,
                    borderWidth: 0,
                    order: 3,
                    barPercentage: 0.6,
                    type: 'bar'
                },
                {
                    label: 'MACD',
                    data: macd.line,
                    borderColor: colors.accentColor,
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: false,
                    type: 'line',
                    order: 1
                },
                {
                    label: 'Signal',
                    data: macd.signal,
                    borderColor: colors.macdSignal,
                    borderWidth: 1.5,
                    pointRadius: 0,
                    borderDash: [4, 2],
                    tension: 0.2,
                    fill: false,
                    type: 'line',
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: colors.textColor,
                        usePointStyle: true,
                        font: { size: 11, family: 'Inter' },
                        padding: 12
                    }
                },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    borderColor: colors.accentColor,
                    borderWidth: 1
                }
            },
            scales: {
                x: { display: false },
                y: {
                    grid: { color: colors.gridColor },
                    ticks: { color: colors.textColor, font: { size: 10 } }
                }
            }
        }
    });
}
