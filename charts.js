/**
 * CEI Dashboard v9 — Charts Module (v6.1 Extensibility Refactor)
 * All ECharts initialization, update, and cross-filter wiring.
 *
 * Phase 2: _tabRegistry — declarative tab init/update, no switch statement.
 * Phase 3: _debug audit — localhost console warnings for missing containers.
 * Phase 4: _palette — single color source, _colors/_vtColors derived.
 * Phase 5: _deepDiveSubSection — unified method replaces 3 near-identical clones.
 */

const Charts = {
    _instances: {},
    _subFilter: {},
    _initialized: new Set(),
    _applyFns: {},

    // ═══════════════════════════════════════════════════════════════════════
    // Phase 3: Debug audit — localhost-only logging for chart container mismatches
    // ═══════════════════════════════════════════════════════════════════════

    _debug: location.hostname === 'localhost' || location.hostname === '127.0.0.1',

    _get(id) {
        if (this._instances[id]) return this._instances[id];
        const el = document.getElementById(id);
        if (!el) {
            if (this._debug) console.warn(`[Charts] Missing container: #${id}`);
            return null;
        }
        const chart = echarts.init(el, null, { renderer: 'canvas' });
        this._instances[id] = chart;
        // Auto ARIA: set role and label from parent h3
        el.setAttribute('role', 'img');
        const h3 = el.closest('.chart-card')?.querySelector('h3');
        if (h3) el.setAttribute('aria-label', h3.textContent + ' chart');
        // v7: Inject chart export button
        this._injectExportBtn(el, chart, h3 ? h3.textContent : id);
        return chart;
    },

    /** Console utility: audit HTML containers vs JS-initialized charts */
    auditContainers() {
        const htmlIds = new Set([...document.querySelectorAll('.chart-container')].map(el => el.id).filter(Boolean));
        const jsIds = new Set(Object.keys(this._instances));
        const unused = [...htmlIds].filter(id => !jsIds.has(id));
        const missing = [...jsIds].filter(id => !htmlIds.has(id));
        if (unused.length) console.warn('[Charts] HTML containers never initialized:', unused);
        if (missing.length) console.warn('[Charts] JS referenced but missing from HTML:', missing);
        else console.log(`[Charts] All ${jsIds.size} containers matched.`);
    },

    resizeAll() {
        requestAnimationFrame(() => {
            const activePane = document.querySelector('.tab-pane.active');
            if (!activePane) return;
            Object.entries(this._instances).forEach(([id, c]) => {
                const el = document.getElementById(id);
                if (c && el && activePane.contains(el) && el.offsetParent !== null) c.resize();
            });
        });
    },

    // Theme colors resolved from CSS custom properties (updated on theme toggle)
    _tc: null,

    _resolveThemeColors() {
        const s = getComputedStyle(document.body);
        const g = (v) => s.getPropertyValue(v).trim();
        this._tc = {
            textSec: g('--text-secondary') || '#94a3b8',
            textPri: g('--text-primary') || '#f1f5f9',
            bgCard: g('--bg-card') || '#1e293b',
            border: g('--border') || '#334155',
            bgPrimary: g('--bg-primary') || '#0f172a',
            textMuted: g('--text-muted') || '#64748b',
        };
        this._theme = {
            textStyle: { color: this._tc.textSec },
            title: { textStyle: { color: this._tc.textPri, fontSize: 14 } },
            legend: { textStyle: { color: this._tc.textSec }, pageTextStyle: { color: this._tc.textSec } },
            tooltip: {
                backgroundColor: this._tc.bgCard, borderColor: this._tc.border,
                textStyle: { color: this._tc.textPri, fontSize: 12 },
            },
        };
        // Re-render all active charts with new theme colors
        for (const [id, chart] of Object.entries(this._instances)) {
            const el = document.getElementById(id);
            if (el && el.offsetParent !== null) chart.resize();
        }
    },

    _theme: {
        textStyle: { color: '#94a3b8' },
        title: { textStyle: { color: '#f1f5f9', fontSize: 14 } },
        legend: { textStyle: { color: '#94a3b8' }, pageTextStyle: { color: '#94a3b8' } },
        tooltip: {
            backgroundColor: '#1e293b', borderColor: '#334155',
            textStyle: { color: '#f1f5f9', fontSize: 12 },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Phase 4: Centralized color palette
    // Contract: when changing a color, update _palette AND the matching CSS
    //           custom property in style.css (see :root comments).
    // ═══════════════════════════════════════════════════════════════════════

    _palette: {
        accent: '#6366f1',  // --accent / indigo
        green: '#22c55e',   // --green
        yellow: '#f59e0b',  // --yellow
        pink: '#ec4899',    // --pink
        cyan: '#22d3ee',    // --cyan
        orange: '#f97316',  // --orange
        violet: '#a855f7',  // --violet (approx)
        teal: '#14b8a6',    // --teal
        red: '#ef4444',     // --red
        lime: '#84cc16',
        slate: '#64748b',   // --slate / --text-muted
        zinc: '#71717a',    // --zinc
        emerald: '#10b981', // --emerald
        sky: '#38bdf8',     // --sky
    },

    // Derived arrays — set by _initPalette() on first use
    _colors: null,
    _vtColors: null,

    _initPalette() {
        const p = this._palette;
        this._colors = [p.accent, p.green, p.yellow, p.pink, p.cyan, p.orange, p.violet, p.teal, p.red, p.lime];
        this._vtColors = {
            'Conference': p.accent, 'Preprint': p.zinc, 'Journal': p.emerald,
            'Findings': p.cyan, 'Workshop': p.orange, 'N/A': p.slate,
        };
        this._resolveThemeColors();
    },

    // ═══════════════════════════════════════════════════════════════════════
    // CHART FACTORIES — 7 parameterized builders replace ~55 methods
    // ═══════════════════════════════════════════════════════════════════════

    _horizontalBar(id, items, opts = {}) {
        const chart = this._get(id);
        if (!chart) return chart;
        const d = (items || []).slice(0, opts.maxItems || 30);
        if (!d.length) {
            chart.setOption({ ...this._theme, graphic: { type: 'text', left: 'center', top: 'center', style: { text: opts.emptyText || 'No data', fill: '#64748b' } } }, true);
            return chart;
        }
        const color = opts.color || this._palette.accent;
        const colorFn = opts.colorFn;
        chart.setOption({
            ...this._theme,
            grid: { left: opts.gridLeft || 130, right: opts.gridRight || 30, top: 10, bottom: 20 },
            xAxis: { type: 'value', axisLabel: { color: this._tc.textSec }, splitLine: { lineStyle: { color: this._tc.bgPrimary } } },
            yAxis: { type: 'category', data: d.map(x => x.n).reverse(), axisLabel: { color: this._tc.textSec, fontSize: opts.fontSize || 11, width: opts.labelWidth || (opts.gridLeft ? opts.gridLeft - 10 : 120), overflow: 'truncate' } },
            tooltip: { ...this._theme.tooltip, trigger: 'axis', ...(opts.tooltipFmt ? { formatter: opts.tooltipFmt } : {}) },
            series: [{
                type: 'bar',
                data: d.map(x => ({
                    value: x.c,
                    itemStyle: { color: colorFn ? colorFn(x) : color, borderRadius: [0,4,4,0] },
                })).reverse(),
                ...(opts.barMaxWidth ? { barMaxWidth: opts.barMaxWidth } : {}),
                ...(opts.label ? { label: opts.label } : {}),
            }],
        }, true);
        if (opts.onClick) {
            chart.off('click');
            chart.on('click', opts.onClick);
        }
        return chart;
    },

    _donut(id, data, opts = {}) {
        const chart = this._get(id);
        if (!chart) return chart;
        chart.setOption({
            ...this._theme,
            ...(opts.useColors ? { color: this._colors } : {}),
            tooltip: { ...this._theme.tooltip, trigger: 'item', formatter: '{b}: {c} ({d}%)' },
            series: [{
                type: 'pie', radius: opts.radius || ['40%', '70%'], center: ['50%', '50%'],
                data, label: { color: this._tc.textSec, fontSize: opts.fontSize || 12 },
                emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
            }],
        }, true);
        if (opts.onClick) {
            chart.off('click');
            chart.on('click', opts.onClick);
        }
        return chart;
    },

    _heatmap(id, config) {
        const chart = this._get(id);
        if (!chart) return chart;
        const hmData = [];
        let maxVal = 0;
        (config.matrix || []).forEach((row, i) => {
            row.forEach((val, j) => {
                hmData.push([j, i, val || '-']);
                if (val > maxVal) maxVal = val;
            });
        });
        chart.setOption({
            ...this._theme,
            grid: config.grid || { left: 120, right: 60, top: 40, bottom: 80 },
            xAxis: { type: 'category', data: config.xLabels, axisLabel: { color: this._tc.textSec, fontSize: config.xFontSize || 10, rotate: config.xRotate || 0 }, ...(config.xPos ? { position: config.xPos } : {}), splitArea: config.splitArea || undefined },
            yAxis: { type: 'category', data: config.yLabels, inverse: !!config.yInverse, axisLabel: { color: this._tc.textSec, fontSize: config.yFontSize || 10, width: config.yLabelWidth || undefined, overflow: config.yLabelWidth ? 'truncate' : undefined } },
            tooltip: { ...this._theme.tooltip, ...(config.tooltipFmt ? { formatter: config.tooltipFmt } : {}) },
            visualMap: { min: 0, max: Math.max(maxVal, 1), calculable: !!config.calculable, orient: 'vertical', right: 10, top: config.vmTop || undefined, inRange: { color: [this._tc.bgCard, config.vmColor || this._palette.accent] }, textStyle: { color: this._tc.textSec } },
            series: [{
                type: 'heatmap', data: hmData,
                label: { show: true, color: this._tc.textPri, fontSize: config.labelFontSize || 10, formatter: p => p.value[2] === '-' ? '' : p.value[2] },
            }],
        }, true);
        if (config.onClick) {
            chart.off('click');
            chart.on('click', config.onClick);
        }
        return chart;
    },

    _radar(id, config) {
        const chart = this._get(id);
        if (!chart || !config.indicators || !config.indicators.length) return chart;
        const maxVal = config.maxVal || Math.max(...config.indicators.map(i => i.max || 0), 1);
        const indicators = config.indicators.map(i => ({ name: i.name, max: i.max || maxVal }));
        chart.setOption({
            ...this._theme,
            ...(config.series.length > 1 ? { legend: { ...this._theme.legend, top: 0 } } : {}),
            radar: {
                triggerEvent: !!config.triggerEvent,
                indicator: indicators,
                axisName: { color: this._tc.textSec, fontSize: 10 },
                splitLine: { lineStyle: { color: this._tc.border } },
                splitArea: { areaStyle: { color: config.splitAreaColors || ['transparent'] } },
                axisLine: config.showAxisLine ? { lineStyle: { color: this._tc.border } } : undefined,
            },
            series: [{
                type: 'radar',
                data: config.series.map(s => ({
                    value: s.values, name: s.name,
                    areaStyle: { color: s.areaColor || s.color.replace(')', ',0.3)').replace('rgb', 'rgba') },
                    lineStyle: { color: s.color }, itemStyle: { color: s.color },
                })),
                lineStyle: config.series.length === 1 ? { color: config.series[0].color } : undefined,
                itemStyle: config.series.length === 1 ? { color: config.series[0].color } : undefined,
            }],
        }, true);
        return chart;
    },

    _stackedTimeline(id, config) {
        const chart = this._get(id);
        if (!chart) return chart;
        chart.setOption({
            ...this._theme,
            grid: { left: 50, right: 20, top: 40, bottom: 40 },
            legend: { ...this._theme.legend, top: 0, ...(config.legendType ? { type: config.legendType } : {}), data: config.series.map(s => s.name) },
            xAxis: { type: 'category', data: (config.years || []).map(String), axisLabel: { color: this._tc.textSec } },
            yAxis: { type: 'value', ...(config.yMax ? { max: config.yMax } : {}), axisLabel: { color: this._tc.textSec, ...(config.yFmt ? { formatter: config.yFmt } : {}) }, splitLine: { lineStyle: { color: this._tc.bgPrimary } } },
            tooltip: { ...this._theme.tooltip, trigger: 'axis', ...(config.tooltipFmt ? { formatter: config.tooltipFmt } : {}) },
            series: config.series.map(s => ({
                name: s.name, type: s.type || 'line', data: s.data || [], smooth: s.smooth !== false,
                stack: s.stack || undefined,
                lineStyle: s.type !== 'bar' ? { color: s.color, width: s.width || 2 } : undefined,
                itemStyle: { color: s.color },
                areaStyle: s.areaStyle || undefined,
            })),
        }, true);
        return chart;
    },

    _groupedBar(id, config) {
        const chart = this._get(id);
        if (!chart || !config.categories || !config.categories.length) return chart;
        chart.setOption({
            ...this._theme,
            grid: { left: config.gridLeft || 80, right: 20, top: 40, bottom: 40 },
            legend: { ...this._theme.legend, top: 0 },
            xAxis: { type: 'category', data: config.categories, axisLabel: { color: this._tc.textSec, rotate: config.xRotate || 0, fontSize: 10 } },
            yAxis: { type: 'value', axisLabel: { color: this._tc.textSec }, splitLine: { lineStyle: { color: this._tc.bgPrimary } } },
            tooltip: { ...this._theme.tooltip, trigger: 'axis', ...(config.axisPointer ? { axisPointer: config.axisPointer } : {}) },
            series: config.series.map(s => ({
                name: s.name, type: 'bar', data: s.data,
                stack: config.stack || undefined,
                itemStyle: { color: s.color, borderRadius: config.stack ? undefined : [4,4,0,0] },
            })),
        }, true);
        return chart;
    },

    _treemap(id, data, opts = {}) {
        const chart = this._get(id);
        if (!chart || !data || !data.length) return chart;
        chart.setOption({
            ...this._theme,
            ...(opts.useColors ? { color: this._colors } : {}),
            tooltip: { ...this._theme.tooltip, ...(opts.tooltipFmt ? { formatter: opts.tooltipFmt } : {}) },
            series: [{
                type: 'treemap', data, roam: false,
                label: { show: true, color: '#fff', fontSize: 11 },
                breadcrumb: { show: false },
                itemStyle: { borderColor: this._tc.bgPrimary, borderWidth: 2 },
                levels: opts.levels || [
                    { itemStyle: { borderColor: this._tc.bgPrimary, borderWidth: 2 } },
                    { colorSaturation: [0.3, 0.7], itemStyle: { borderColor: this._tc.bgPrimary, borderWidth: 1 } },
                ],
            }],
        }, true);
        if (opts.onClick) {
            chart.off('click');
            chart.on('click', opts.onClick);
        }
        return chart;
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Phase 2: Tab Initialization Registry
    // Adding a tab = 1 registry entry + init method + HTML.
    // Making a tab filter-reactive = add `update` key.
    // ═══════════════════════════════════════════════════════════════════════

    _tabRegistry: {
        overview:   { init: '_initOverview',   update: '_updateOverview' },
        conference: { init: '_initConference' },
        taxonomy:   { init: '_initTaxonomy' },
        cultural:   { init: '_initCultural' },
        normative:  { init: '_initNormative' },
        moralpsych: { init: '_initMoralPsych' },
        religious:  { init: '_initReligious' },
        models:     { init: '_initModels' },
        intersections: { init: '_initIntersections' },
        authors:    { init: '_initAuthors' },
    },

    initTab(tabId) {
        if (!this._colors) this._initPalette(); // one-time palette setup
        if (this._initialized.has(tabId)) return;
        this._initialized.add(tabId);
        const reg = this._tabRegistry[tabId];
        if (!reg) {
            if (this._debug) console.warn(`[Charts] No registry entry for tab: ${tabId}`);
            return;
        }
        this[reg.init](FilterState.getFilteredPapers());
        if (reg.update) {
            FilterState.subscribe(filtered => {
                if (this._initialized.has(tabId)) this[reg.update](filtered);
            });
        }
    },

    // ═══════════════════════════════════════════════════════════════════════
    // TAB 1: OVERVIEW
    // ═══════════════════════════════════════════════════════════════════════

    _initOverview(papers) {
        // v9: KPIs populated by _populateOverviewDigest() in app.js
        this._chartTimeline(papers);
        this._chartVenueDonut(papers);
        this._horizontalBar('chart-category-bar', DATA.taxonomy.categories.slice(0, 10), { gridLeft: 220, labelWidth: 200, color: this._palette.accent });
        // Availability donut
        const av = DATA.agg.availability;
        const avData = Object.entries(av).filter(([,v]) => v > 0).map(([n, v]) => ({ name: n, value: v }));
        this._donut('chart-availability', avData, { useColors: true, radius: ['35%', '65%'] });
    },

    _updateOverview(papers) {
        this._chartTimeline(papers);
        this._chartVenueDonut(papers);
    },

    _chartTimeline(papers) {
        const chart = this._get('chart-timeline');
        if (!chart) return;
        const yearCount = {};
        papers.forEach(p => { if (p.y > 0) yearCount[p.y] = (yearCount[p.y]||0) + 1; });
        const years = Object.keys(yearCount).sort();
        chart.setOption({
            ...this._theme, color: this._colors,
            grid: { left: 50, right: 20, top: 30, bottom: 40 },
            xAxis: { type: 'category', data: years, axisLabel: { color: this._tc.textSec }, axisLine: { lineStyle: { color: this._tc.border } } },
            yAxis: { type: 'value', axisLabel: { color: this._tc.textSec }, splitLine: { lineStyle: { color: this._tc.bgPrimary } } },
            tooltip: { ...this._theme.tooltip, trigger: 'axis' },
            series: [{ type: 'bar', data: years.map(y => yearCount[y]), itemStyle: { color: this._palette.accent, borderRadius: [4,4,0,0] }, emphasis: { itemStyle: { color: '#818cf8' } } }],
        }, true);
        chart.off('click');
        chart.on('click', p => { if (p.name) FilterState.toggle('year', +p.name); });
        // v7: Add YoY growth labels
        this._timelineYoYLabels(chart, yearCount, years);
    },

    _chartVenueDonut(papers) {
        const vtCount = {};
        papers.forEach(p => { vtCount[p.vt] = (vtCount[p.vt]||0) + 1; });
        const data = Object.entries(vtCount).map(([n, v]) => ({ name: n, value: v, itemStyle: { color: this._vtColors[n] || this._palette.slate } }));
        this._donut('chart-venue-donut', data, { onClick: p => { if (p.name) FilterState.toggle('venueType', p.name); } });
    },

    // ═══════════════════════════════════════════════════════════════════════
    // TAB 3: CONFERENCE & VENUE
    // ═══════════════════════════════════════════════════════════════════════

    _initConference() {
        const C = DATA.conf;
        const vt = DATA.agg.vtDist || {};
        document.getElementById('kpi-conf-venues').textContent = fmt(C.uniqueVenues);
        document.getElementById('kpi-conf-conf').textContent = fmt(vt.Conference || 0);
        document.getElementById('kpi-conf-peer').textContent = fmt((vt.Conference||0) + (vt.Journal||0) + (vt.Findings||0) + (vt.Workshop||0));
        document.getElementById('kpi-conf-preprint').textContent = fmt(vt.Preprint || 0);

        // Venue type donut
        const vtData = Object.entries(vt).map(([n, v]) => ({ name: n, value: v, itemStyle: { color: this._vtColors[n] || this._palette.slate } }));
        this._donut('chart-conf-donut', vtData, { onClick: p => { if (p.name) FilterState.toggle('venueType', p.name); } });

        // Top 30 venues
        this._horizontalBar('chart-conf-top30', C.topVenues, {
            maxItems: 30, gridLeft: 200, labelWidth: 190, fontSize: 10, barMaxWidth: 20,
            colorFn: x => this._vtColors[x.vt] || this._palette.accent,
            onClick: p => { if (p.name) FilterState.toggle('venue', p.name); },
        });

        // Conference family treemap
        const ecoColors = { 'NLP/CL': this._palette.accent, 'ML/AI': this._palette.green, 'AI Ethics': this._palette.yellow, 'Other': this._palette.slate };
        const ecoGroups = {};
        C.families.forEach(f => { if (!ecoGroups[f.eco]) ecoGroups[f.eco] = []; ecoGroups[f.eco].push({ name: f.n, value: f.c }); });
        const tmData = Object.entries(ecoGroups).map(([eco, children]) => ({ name: eco, itemStyle: { color: ecoColors[eco] || this._palette.slate }, children }));
        this._treemap('chart-conf-treemap', tmData, {
            levels: [
                { itemStyle: { borderColor: this._tc.bgPrimary, borderWidth: 2 } },
                { itemStyle: { borderColor: this._tc.bgPrimary, borderWidth: 1, gapWidth: 1 }, colorSaturation: [0.3, 0.7] },
            ],
            onClick: p => { if (p.data && p.data.children === undefined) FilterState.toggle('confFamily', p.name); },
        });

        // Ecosystem donut
        const ecoData = C.ecosystem.map(e => ({ name: e.n, value: e.c, itemStyle: { color: ecoColors[e.n] } }));
        this._donut('chart-conf-ecosystem', ecoData);

        // Family x year heatmap
        const fams = C.heatmap.map(h => h.n);
        const hmMatrix = C.heatmap.map(row => C.hmYears.map((_, yi) => row.d[yi] || 0));
        this._heatmap('chart-conf-heatmap', {
            xLabels: C.hmYears.map(String), yLabels: fams, matrix: hmMatrix,
            grid: { left: 120, right: 60, top: 30, bottom: 40 }, yInverse: true, yFontSize: 11,
            calculable: true, vmTop: 30, vmColor: this._palette.accent, labelFontSize: 11,
            splitArea: { show: true, areaStyle: { color: ['transparent'] } },
            tooltipFmt: p => `${fams[p.value[1]]} ${C.hmYears[p.value[0]]}: ${p.value[2]}`,
            onClick: params => {
                if (params.value[2] === '-' || params.value[2] === 0) return;
                this._showHeatmapDrilldown(fams[params.value[1]], C.hmYears[params.value[0]]);
            },
        });

        // Journals bar
        this._horizontalBar('chart-conf-journals', C.journals, { maxItems: 20, gridLeft: 250, labelWidth: 240, fontSize: 10, color: this._palette.emerald });

        // Venue type timeline
        const vtTypes = ['Conference', 'Preprint', 'Journal', 'Findings', 'Workshop'];
        this._stackedTimeline('chart-conf-timeline', {
            years: C.timeline.years,
            series: vtTypes.map(t => ({ name: t, type: 'bar', data: C.timeline[t] || [], color: this._vtColors[t], stack: 'total', smooth: false })),
        });

        // Peer-review ratio
        this._stackedTimeline('chart-conf-peer-ratio', {
            years: C.peerRatio.map(r => r.y), yMax: 100, yFmt: '{value}%',
            tooltipFmt: p => `${p[0].name}: ${p[0].value}% peer-reviewed`,
            series: [{
                name: 'Peer-Review %', type: 'line', data: C.peerRatio.map(r => r.pct), color: this._palette.accent, width: 3,
                areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{offset: 0, color: 'rgba(99,102,241,0.3)'}, {offset: 1, color: 'rgba(99,102,241,0.0)'}] } },
            }],
        });

        // --- Paper lists + click-to-filter ---
        this._attachModelFilter('conf-ov', DATA.papers, [
            { chartId: 'chart-conf-donut', dim: 'venueType', filterFn: (p, val) => p.vt === val },
            { chartId: 'chart-conf-top30', dim: 'venue', filterFn: (p, val) => p.cc === val },
        ]);

        const famPapers = DATA.papers.filter(p => p.cf);
        this._attachModelFilter('conf-fam', famPapers, [
            {
                chartId: 'chart-conf-treemap',
                dim: 'family',
                filterFn: (p, val) => p.cf === val,
                resolveName: params => (params.data && params.data.children === undefined) ? params.name : null,
            },
        ]);

        const journalPapers = DATA.papers.filter(p => p.vt === 'Journal');
        this._attachModelFilter('conf-jour', journalPapers, [
            { chartId: 'chart-conf-journals', dim: 'journal', filterFn: (p, val) => p.cc === val },
        ]);

        this._attachModelFilter('conf-temp', DATA.papers, [
            { chartId: 'chart-conf-timeline', dim: 'year', filterFn: (p, val) => p.y === +val },
        ]);
    },

    _heatmapExpandedIdx: null,
    _heatmapPapers: null,
    _heatmapDelegated: false,

    _showHeatmapDrilldown(family, year) {
        const container = document.getElementById('heatmap-drilldown');
        if (!container) return;
        this._heatmapPapers = DATA.papers.filter(p => p.cf === family && p.y === year);
        document.getElementById('heatmap-drilldown-title').textContent = `${family} ${year} \u2014 ${this._heatmapPapers.length} paper${this._heatmapPapers.length !== 1 ? 's' : ''}`;
        this._heatmapExpandedIdx = null;

        if (!this._heatmapDelegated) {
            this._heatmapDelegated = true;
            document.getElementById('heatmap-drilldown-tbody').addEventListener('click', (e) => {
                const row = e.target.closest('.paper-row');
                if (!row) return;
                const idx = +row.dataset.idx;
                this._heatmapExpandedIdx = this._heatmapExpandedIdx === idx ? null : idx;
                this._renderHeatmapTable();
            });
        }

        this._renderHeatmapTable();
        container.style.display = 'block';
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('heatmap-drilldown-close').onclick = () => { container.style.display = 'none'; };
    },

    _renderHeatmapTable() {
        const tbody = document.getElementById('heatmap-drilldown-tbody');
        if (!tbody || !this._heatmapPapers) return;
        const sorted = [...this._heatmapPapers].sort((a, b) => a.t.localeCompare(b.t));
        let html = '';
        for (const p of sorted) {
            html += renderPaperRow(p);
            if (this._heatmapExpandedIdx === p.i) html += renderPaperDetail(p);
        }
        if (!sorted.length) html = '<tr><td colspan="8" style="color:var(--text-muted);padding:16px;">No papers found.</td></tr>';
        tbody.innerHTML = html;
    },

    // ═══════════════════════════════════════════════════════════════════════
    // TAB 4: TAXONOMY & METHODS
    // ═══════════════════════════════════════════════════════════════════════

    _initTaxonomy() {
        const T = DATA.taxonomy;

        // Category x Year heatmap
        const cats = T.categories;
        const allYears = new Set();
        cats.forEach(c => Object.keys(c.byYear).forEach(y => allYears.add(y)));
        const years = [...allYears].sort();
        const matrix = cats.map(c => years.map(y => c.byYear[y] || 0));
        this._heatmap('chart-tax-heatmap', {
            xLabels: years, yLabels: cats.map(c => c.n), matrix,
            grid: { left: 220, right: 60, top: 10, bottom: 40 }, xPos: 'bottom',
            yFontSize: 10, yLabelWidth: 210, vmColor: this._palette.accent,
        });

        // Co-occurrence
        this._heatmap('chart-tax-cooccurrence', {
            xLabels: T.catNames, yLabels: T.catNames, matrix: T.cooccurrence,
            grid: { left: 200, right: 60, top: 40, bottom: 100 },
            xRotate: 45, xFontSize: 9, yFontSize: 9, yLabelWidth: 190, vmColor: this._palette.green, labelFontSize: 9,
        });

        // Models
        this._horizontalBar('chart-tax-models', T.models, { maxItems: 15, color: this._palette.yellow });

        // v7: Benchmarks sub-tab
        this._initBenchmarks();
    },

    // ═══════════════════════════════════════════════════════════════════════
    // TAB 5: CULTURAL VALUES
    // ═══════════════════════════════════════════════════════════════════════

    _initCultural() {
        const C = DATA.cultural;

        // Region donut
        const regionData = C.regionDist.map(d => ({ name: d.n, value: d.c }));
        this._donut('chart-cult-region-donut', regionData, { useColors: true, radius: ['35%', '70%'] });

        // Region timeline
        const tl = C.timeline;
        const regions = tl.regions.filter(r => tl.series[r] && tl.series[r].some(v => v > 0));
        this._stackedTimeline('chart-cult-region-timeline', {
            years: tl.years, legendType: 'scroll',
            series: regions.slice(0, 8).map((r, i) => ({
                name: r, type: 'line', data: tl.series[r], color: this._colors[i % this._colors.length],
                stack: 'total', areaStyle: {},
            })),
        });

        // Country bar
        this._horizontalBar('chart-cult-country-bar', C.countryDist, { maxItems: 30, color: this._palette.pink });

        // ── C2: Culture Focus Shift Timeline ──
        if (C.cultureTimeline) {
            const ct = C.cultureTimeline;
            const cults = ct.cultures.filter(c => ct.series[c] && ct.series[c].some(v => v > 0));
            this._stackedTimeline('chart-cult-country-timeline', {
                years: ct.years, legendType: 'scroll',
                series: cults.map((c, i) => ({
                    name: c, type: 'line', data: ct.series[c],
                    color: this._colors[i % this._colors.length],
                    stack: 'total', areaStyle: {},
                })),
            });
        }

        // ── C1: Culture Co-Occurrence Matrix ──
        if (C.coLabels && C.coMatrix) {
            this._heatmap('chart-cult-country-cooccur', {
                xLabels: C.coLabels, yLabels: C.coLabels, matrix: C.coMatrix,
                grid: { left: 100, right: 60, top: 10, bottom: 90 },
                xRotate: 35, yInverse: true, vmColor: this._palette.orange,
                tooltipFmt: p => p.value[2] === '-' ? '' :
                    (p.value[0] === p.value[1]
                        ? `${C.coLabels[p.value[1]]}: ${p.value[2]} papers`
                        : `${C.coLabels[p.value[1]]} × ${C.coLabels[p.value[0]]}: ${p.value[2]} co-occurrences`),
            });
        }

        // ── C3: Ethical Framework × Culture Heatmap ──
        if (C.cultureFramework) {
            const cf = C.cultureFramework;
            this._heatmap('chart-cult-country-framework', {
                xLabels: cf.columns, yLabels: cf.cultures, matrix: cf.matrix,
                grid: { left: 100, right: 60, top: 10, bottom: 50 },
                yInverse: true, vmColor: this._palette.violet,
                tooltipFmt: p => p.value[2] === '-' ? '' :
                    `${cf.cultures[p.value[1]]} × ${cf.columns[p.value[0]]}: ${p.value[2]} papers`,
            });
        }

        // ── C4: Benchmark Gap by Culture ──
        if (C.cultureBenchmark) {
            const cb = C.cultureBenchmark;
            this._groupedBar('chart-cult-country-bench', {
                categories: cb.cultures, xRotate: 30,
                series: [
                    { name: 'Benchmark/Eval', data: cb.benchEval, color: this._palette.accent },
                    { name: 'Conceptual Only', data: cb.conceptual, color: this._palette.slate },
                ],
            });
        }

        // ── C5: Culture × Venue Type Heatmap ──
        if (C.cultureVenue) {
            const cv = C.cultureVenue;
            this._heatmap('chart-cult-country-venue', {
                xLabels: cv.venues, yLabels: cv.cultures, matrix: cv.matrix,
                grid: { left: 100, right: 60, top: 10, bottom: 50 },
                yInverse: true, vmColor: this._palette.teal,
                tooltipFmt: p => p.value[2] === '-' ? '' :
                    `${cv.cultures[p.value[1]]} × ${cv.venues[p.value[0]]}: ${p.value[2]} papers`,
            });
        }

        // Language bar
        this._horizontalBar('chart-cult-lang-bar', C.langDist, { maxItems: 20, gridLeft: 110, color: this._palette.cyan });

        // ── L1: Language Family Treemap ──
        if (C.langFamilyTreemap) {
            const lfData = C.langFamilyTreemap.map(f => ({
                name: f.n, children: f.ch.map(l => ({ name: l.n, value: l.v })),
            }));
            this._treemap('chart-cult-lang-family', lfData, { useColors: true });
        }

        // ── L2: Language Coverage Timeline ──
        if (C.langTimeline) {
            const lt = C.langTimeline;
            const langs = lt.languages.filter(l => lt.series[l] && lt.series[l].some(v => v > 0));
            this._stackedTimeline('chart-cult-lang-timeline', {
                years: lt.years, legendType: 'scroll',
                series: langs.map((l, i) => ({
                    name: l, type: 'line', data: lt.series[l],
                    color: this._colors[i % this._colors.length],
                    stack: 'total', areaStyle: {},
                    ...(l === 'English' ? { lineStyle: { type: 'dashed' } } : {}),
                })),
            });
        }

        // ── L3: Language Benchmark Gap ──
        if (C.langBenchmark) {
            const lb = C.langBenchmark;
            this._groupedBar('chart-cult-lang-bench', {
                categories: lb.languages, xRotate: 30,
                series: [
                    { name: 'Benchmark/Eval', data: lb.benchEval, color: this._palette.accent },
                    { name: 'Conceptual Only', data: lb.conceptual, color: this._palette.slate },
                ],
            });
        }

        // ── L4: Language–Culture Alignment Radar ──
        if (C.langCultureRadar && C.langCultureRadar.regions.length) {
            const lr = C.langCultureRadar;
            const maxPct = Math.max(...lr.culturePct, ...lr.langPct, 1);
            this._radar('chart-cult-lang-radar', {
                indicators: lr.regions.map(r => ({ name: r, max: Math.ceil(maxPct / 10) * 10 })),
                series: [
                    { name: 'Culture Coverage %', values: lr.culturePct, color: this._palette.pink },
                    { name: 'Language Coverage %', values: lr.langPct, color: this._palette.cyan },
                ],
            });
        }

        // ── L5: Language × Venue Type Heatmap ──
        if (C.langVenue) {
            const lv = C.langVenue;
            this._heatmap('chart-cult-lang-venue', {
                xLabels: lv.venues, yLabels: lv.languages, matrix: lv.matrix,
                grid: { left: 100, right: 60, top: 10, bottom: 50 },
                yInverse: true, vmColor: this._palette.teal,
                tooltipFmt: p => p.value[2] === '-' ? '' :
                    `${lv.languages[p.value[1]]} × ${lv.venues[p.value[0]]}: ${p.value[2]} papers`,
            });
        }

        // WEIRD pie
        const wColors = { WEIRD: this._palette.red, 'Non-WEIRD': this._palette.green, Mixed: this._palette.yellow };
        const wData = Object.entries(C.weird).map(([n, v]) => ({ name: n, value: v, itemStyle: { color: wColors[n] } }));
        this._donut('chart-cult-weird-pie', wData, { radius: ['35%', '70%'] });
        // Culture treemap
        const ctmData = C.treemap.map(r => ({ name: r.n, children: r.ch.map(c => ({ name: c.n, value: c.v })) }));
        this._treemap('chart-cult-treemap', ctmData, { useColors: true });
        // Paper lists
        this._cultInitPaperList('country', 'cu');
        this._cultInitPaperList('lang', 'ln');
    },

    _cultInitPaperList(key, dim) {
        const countEl = document.getElementById(`cult-${key}-count`);
        const headerH3 = countEl ? countEl.parentElement.querySelector('h3') : null;
        const baseTitle = headerH3 ? headerH3.textContent : '';
        const filterKey = `cult-${key}`;
        const containerId = `cult-${key}-papers`;
        const allPapers = DATA.papers.filter(p => p[dim] && p[dim].length);
        if (countEl) countEl.textContent = allPapers.length;
        renderPaperList(containerId, allPapers, 50);

        const applyFilter = () => {
            const f = this._subFilter[filterKey];
            let filtered;
            if (!f) { filtered = allPapers; if (headerH3) headerH3.textContent = baseTitle; }
            else { filtered = DATA.papers.filter(p => p[dim] && p[dim].includes(f.val)); if (headerH3) headerH3.textContent = `${baseTitle} \u2014 ${f.val}`; }
            if (countEl) countEl.textContent = filtered.length;
            renderPaperList(containerId, filtered, 50);
        };
        const chartId = key === 'country' ? 'chart-cult-country-bar' : 'chart-cult-lang-bar';
        const chart = this._get(chartId);
        if (chart) {
            chart.off('click');
            chart.on('click', params => {
                if (!params.name) return;
                const cur = this._subFilter[filterKey];
                if (cur && cur.val === params.name) delete this._subFilter[filterKey];
                else this._subFilter[filterKey] = { dim, val: params.name };
                applyFilter();
            });
        }
    },

    // ═══════════════════════════════════════════════════════════════════════
    // TAB 6: NORMATIVE ETHICS
    // ═══════════════════════════════════════════════════════════════════════

    _initNormative() {
        const N = DATA.normative;
        // Classification donut
        const classData = [
            { name: 'Yes', value: N.yes, itemStyle: { color: this._palette.green } },
            { name: 'Borderline', value: N.borderline, itemStyle: { color: this._palette.yellow } },
            { name: 'Excluded', value: N.excluded, itemStyle: { color: this._palette.slate } },
        ];
        this._donut('chart-norm-class-donut', classData);
        // Framework bar
        this._horizontalBar('chart-norm-fw-bar', N.frameworks, { gridLeft: 200, labelWidth: 190, fontSize: 10 });
        // Timeline
        const fwColors = { ve: this._palette.green, de: this._palette.accent, cu: this._palette.yellow };
        const fwNames = { ve: 'Virtue Ethics', de: 'Deontological', cu: 'Consequentialism' };
        this._stackedTimeline('chart-norm-timeline', {
            years: N.timelineFw.years,
            series: ['ve','de','cu'].map(k => ({ name: fwNames[k], data: N.timelineFw[k] || [], color: fwColors[k] })),
        });
        // Sub-sections via unified _deepDiveSubSection
        this._deepDiveSubSection('norm', 've', N.ve, [
            { render(data, pfx) {
                if (data.virtueKeywords) this._horizontalBar(`chart-${pfx}-virtues`, data.virtueKeywords, { maxItems: 15, color: this._palette.green });
                this._normExtraCharts(data, pfx);
            }},
        ]);
        this._deepDiveSubSection('norm', 'de', N.de, [
            { render(data, pfx) {
                if (data.deontConcepts) this._horizontalBar(`chart-${pfx}-concepts`, data.deontConcepts, { maxItems: 13, gridLeft: 160, color: '#818cf8', emptyText: 'No concept data' });
                this._normExtraCharts(data, pfx);
            }},
        ]);
        this._deepDiveSubSection('norm', 'cu', N.cu, [
            { render(data, pfx) {
                if (data.cuConcepts) this._horizontalBar(`chart-${pfx}-concepts`, data.cuConcepts, { maxItems: 13, gridLeft: 160, color: this._palette.yellow, emptyText: 'No concept data' });
                this._normExtraCharts(data, pfx);
            }},
        ]);
        // Overlap
        this._normOverlap(N.overlap);

        // ── Item 5: Gap Matrix ──────────────────────────────
        if (N.gapMatrix) {
            this._heatmap('chart-norm-gap-matrix', {
                xLabels: N.gapCols || [],
                yLabels: N.gapRows || [],
                matrix: N.gapMatrix || [],
                grid: { left: 220, right: 60, top: 10, bottom: 60 },
                xRotate: 30,
                vmColor: this._palette.accent,
                customFormatter: (p) => {
                    const row = (N.gapRows || [])[p.value[1]];
                    const col = (N.gapCols || [])[p.value[0]];
                    const val = p.value[2];
                    if (col === 'Paper Count') return `${row}: ${val} papers`;
                    return `${row} × ${col}: ${val ? '✓ Yes' : '✗ No'}`;
                },
            });
        }

        // ── Care Ethics deep-dive (promoted from accordion) ──
        if (N.ceYaml) {
            this._deepDiveSubSection('norm', 'ce', N.ceYaml, [
                { render(data, pfx) {
                    if (data.concepts) this._horizontalBar(`chart-${pfx}-concepts`, data.concepts, { maxItems: 10, gridLeft: 160, color: this._palette.pink });
                    this._normExtraCharts(data, pfx);
                }},
            ]);
        }

        // ── Contractualism deep-dive (promoted from accordion) ──
        if (N.coYaml) {
            this._deepDiveSubSection('norm', 'co', N.coYaml, [
                { render(data, pfx) {
                    if (data.concepts) this._horizontalBar(`chart-${pfx}-concepts`, data.concepts, { maxItems: 10, gridLeft: 160, color: this._palette.pink });
                    this._normExtraCharts(data, pfx);
                }},
            ]);
        }

        // ── Principlism (sparse data — manual render) ──
        const princData = N.princ;
        if (princData) {
            const countEl = document.getElementById('norm-princ-count');
            if (countEl) countEl.textContent = princData.count;
            const listCountEl = document.getElementById('norm-princ-list-count');
            if (listCountEl) listCountEl.textContent = princData.count;
            this._yearBar('chart-norm-princ-year', princData.yearDist);
            if (princData.concepts) this._horizontalBar('chart-norm-princ-concepts', princData.concepts, { maxItems: 10, gridLeft: 160, color: this._palette.pink });
            renderPaperList('norm-princ-papers', princData.papers || [], 50);
        }

        // ── Tier 3: Meta-Ethics, Citations, Author-FW, Full-Text ─
        if (N.metaEthics) this._horizontalBar('chart-norm-meta-ethics', N.metaEthics, { gridLeft: 180, color: this._palette.violet });
        if (N.citations) this._horizontalBar('chart-norm-citations', N.citations, { maxItems: 12, gridLeft: 120, color: this._palette.teal });

        if (N.authorFramework && N.authorFramework.length) {
            const afData = N.authorFramework.slice(0, 20);
            const chart = this._get('chart-norm-author-fw');
            if (chart) {
                const fwColors = { ve: this._palette.green, de: this._palette.accent, cu: this._palette.yellow };
                chart.setOption({
                    ...this._theme,
                    grid: { left: 150, right: 30, top: 30, bottom: 20 },
                    legend: { data: ['VE', 'DE', 'CU'], top: 0, textStyle: { color: this._tc.textSec } },
                    xAxis: { type: 'value', axisLabel: { color: this._tc.textSec }, splitLine: { lineStyle: { color: this._tc.bgPrimary } } },
                    yAxis: { type: 'category', data: afData.map(a => a.n).reverse(), axisLabel: { color: this._tc.textSec, fontSize: 10, width: 140, overflow: 'truncate' } },
                    tooltip: { ...this._theme.tooltip, trigger: 'axis' },
                    series: ['ve', 'de', 'cu'].map(fw => ({
                        name: fw.toUpperCase(), type: 'bar', stack: 'total',
                        data: afData.map(a => a[fw] || 0).reverse(),
                        itemStyle: { color: fwColors[fw] },
                    })),
                }, true);
            }
        }

        if (N.ve && N.ve.fullTextDepth && N.ve.fullTextDepth.length) {
            const allDepth = [...(N.ve.fullTextDepth || []), ...(N.de.fullTextDepth || []), ...(N.cu.fullTextDepth || [])];
            allDepth.sort((a, b) => b.density - a.density);
            const top = allDepth.slice(0, 15);
            this._horizontalBar('chart-norm-fulltext-depth', top.map(d => ({ n: d.fn.replace('.md', '').slice(0, 40), c: d.density })), {
                gridLeft: 260, labelWidth: 250, fontSize: 10, color: this._palette.emerald,
            });
        }

        // Item 6: Bridge
        if (N.bridge) this._normBridge(N.bridge);
    },

    _normOverlap(overlap) {
        // Overlap bar
        const oData = [
            { n: 'VE + DE', c: overlap.ve_de }, { n: 'VE + CU', c: overlap.ve_cu },
            { n: 'DE + CU', c: overlap.de_cu }, { n: 'All Three', c: overlap.all },
        ];
        const paperKeys = { 'VE + DE': 've_de_papers', 'VE + CU': 've_cu_papers', 'DE + CU': 'de_cu_papers', 'All Three': 'all_papers' };
        const countEl = document.getElementById('norm-overlap-count');
        const headerH3 = countEl ? countEl.parentElement.querySelector('h3') : null;
        let activeFilter = null;
        if (countEl) countEl.textContent = (overlap.any_papers || []).length;
        renderPaperList('norm-overlap-papers', overlap.any_papers || [], 50);

        this._horizontalBar('chart-norm-overlap', oData, {
            gridLeft: 100, color: this._palette.violet,
            onClick: params => {
                if (!params.name) return;
                const key = paperKeys[params.name];
                if (!key) return;
                if (activeFilter === params.name) {
                    activeFilter = null;
                    if (headerH3) headerH3.textContent = 'Overlapping Papers';
                    if (countEl) countEl.textContent = (overlap.any_papers || []).length;
                    renderPaperList('norm-overlap-papers', overlap.any_papers || [], 50);
                } else {
                    activeFilter = params.name;
                    const papers = overlap[key] || [];
                    if (headerH3) headerH3.textContent = `Overlapping Papers \u2014 ${params.name}`;
                    if (countEl) countEl.textContent = papers.length;
                    renderPaperList('norm-overlap-papers', papers, 50);
                }
            },
        });

        // Overlap timeline
        const oColors = { ve_de: '#f472b6', ve_cu: '#fb923c', de_cu: '#34d399', all: '#a78bfa' };
        const oNames = { ve_de: 'VE + DE', ve_cu: 'VE + CU', de_cu: 'DE + CU', all: 'All Three' };
        if (overlap.overlapTimeline) {
            this._stackedTimeline('chart-norm-overlap-timeline', {
                years: overlap.overlapTimeline.years,
                series: ['ve_de', 've_cu', 'de_cu', 'all'].map(k => ({
                    name: oNames[k], data: overlap.overlapTimeline[k] || [], color: oColors[k],
                    stack: 'overlap', areaStyle: { opacity: 0.4 },
                })),
            });
        }

        // Exclusivity sunburst
        if (overlap.exclusivity) this._normOverlapExclusivity(overlap.exclusivity);

        // Overlap models grouped bar
        if (overlap.overlapModels) {
            const totals = {};
            for (const combo of ['ve_de', 've_cu', 'de_cu', 'all']) {
                for (const m of (overlap.overlapModels[combo] || [])) totals[m.n] = (totals[m.n] || 0) + m.c;
            }
            const modelNames = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
            if (modelNames.length) {
                const comboLookup = {};
                for (const combo of ['ve_de', 've_cu', 'de_cu', 'all']) {
                    const lk = {}; for (const m of (overlap.overlapModels[combo] || [])) lk[m.n] = m.c; comboLookup[combo] = lk;
                }
                this._groupedBar('chart-norm-overlap-models', {
                    categories: [...modelNames].reverse(), gridLeft: 120,
                    series: ['ve_de', 've_cu', 'de_cu', 'all'].map(combo => ({
                        name: oNames[combo], data: [...modelNames].reverse().map(n => comboLookup[combo][n] || 0), color: oColors[combo],
                    })),
                });
            }
        }

        // Region heatmap
        if (overlap.regionHeatmap) {
            this._heatmap('chart-norm-overlap-region', {
                xLabels: overlap.regionHeatmap.regionLabels || [], yLabels: overlap.regionHeatmap.comboLabels || [],
                matrix: overlap.regionHeatmap.matrix || [],
                grid: { left: 90, right: 60, top: 10, bottom: 80 }, xRotate: 30, vmColor: this._palette.violet,
            });
        }

        // Benchmark density
        this._normOverlapBench(overlap);

        // Item 3: Comparative radar
        if (DATA.normative.comparative) {
            this._radar('chart-norm-comparative-radar', {
                indicators: DATA.normative.comparative.indicators,
                series: DATA.normative.comparative.series.map((s, i) => ({
                    name: s.name,
                    values: s.data,
                    color: [this._palette.green, this._palette.accent, this._palette.yellow][i],
                })),
                maxVal: null,  // use indicator-specific max
            });
        }

        // Item 9: Typology donut
        if (overlap.typology && overlap.typology.length) {
            const typoColors = { 'Comparative': this._palette.accent, 'Integrative': this._palette.green, 'Incidental': this._palette.slate };
            const typoData = overlap.typology.map(d => ({
                name: d.n, value: d.c,
                itemStyle: { color: typoColors[d.n] || this._palette.slate },
            }));
            this._donut('chart-norm-overlap-typology', typoData);
        }
    },

    _normOverlapExclusivity(excl) {
        const chart = this._get('chart-norm-overlap-excl');
        if (!chart || !excl) return;
        const fwColors = { ve: this._palette.green, de: this._palette.accent, cu: this._palette.yellow };
        const fwNames = { ve: 'Virtue Ethics', de: 'Deontological', cu: 'Consequentialism' };
        const subLabels = {
            ve: [['VE only','only'],['+ DE','ve_de'],['+ CU','ve_cu'],['All 3','all']],
            de: [['DE only','only'],['+ VE','ve_de'],['+ CU','de_cu'],['All 3','all']],
            cu: [['CU only','only'],['+ VE','ve_cu'],['+ DE','de_cu'],['All 3','all']],
        };
        const data = ['ve','de','cu'].map(fw => {
            const d = excl[fw]; const base = fwColors[fw];
            const children = subLabels[fw].map(([label, key], i) => ({
                name: `${label} (${d[key]})`, value: d[key],
                itemStyle: { color: i === 0 ? base : (i === 3 ? this._palette.violet : base + '88') },
            }));
            const sum = children.reduce((s, c) => s + c.value, 0);
            return { name: `${fwNames[fw]} (${sum})`, itemStyle: { color: base }, children };
        });
        chart.setOption({
            ...this._theme,
            tooltip: { ...this._theme.tooltip },
            series: [{
                type: 'sunburst', data, radius: ['15%', '90%'],
                label: { color: this._tc.textPri, fontSize: 10, overflow: 'truncate', width: 70 },
                itemStyle: { borderColor: this._tc.bgPrimary, borderWidth: 1 },
                levels: [{}, { r0: '15%', r: '50%', label: { fontSize: 12 } }, { r0: '50%', r: '90%', label: { fontSize: 10 } }],
            }],
        }, true);
    },

    _normOverlapBench(overlap) {
        const chart = this._get('chart-norm-overlap-bench');
        if (!chart) return;
        const bars = [
            { name: 'VE + DE', count: overlap.ve_de_bench, total: overlap.ve_de, pct: overlap.ve_de_pct },
            { name: 'VE + CU', count: overlap.ve_cu_bench, total: overlap.ve_cu, pct: overlap.ve_cu_pct },
            { name: 'DE + CU', count: overlap.de_cu_bench, total: overlap.de_cu, pct: overlap.de_cu_pct },
            { name: 'All Three', count: overlap.all_bench, total: overlap.all, pct: overlap.all_pct },
            { name: 'Single FW', count: overlap.single_bench, total: overlap.single_total, pct: overlap.single_pct },
        ];
        chart.setOption({
            ...this._theme,
            grid: { left: 100, right: 60, top: 10, bottom: 20 },
            xAxis: { type: 'value', max: 100, axisLabel: { color: this._tc.textSec, formatter: '{value}%' }, splitLine: { lineStyle: { color: this._tc.bgPrimary } } },
            yAxis: { type: 'category', data: bars.map(b => b.name).reverse(), axisLabel: { color: this._tc.textSec } },
            tooltip: { ...this._theme.tooltip, trigger: 'axis', formatter: params => { const p = params[0]; const b = bars.find(x => x.name === p.name); return b ? `${b.name}: ${b.count}/${b.total} (${b.pct}%)` : ''; } },
            series: [{
                type: 'bar',
                data: bars.map(b => ({ value: b.pct, itemStyle: { color: b.name === 'Single FW' ? this._palette.slate : this._palette.teal, borderRadius: [0, 4, 4, 0] } })).reverse(),
                label: { show: true, position: 'right', color: this._tc.textSec, fontSize: 10, formatter: p => { const b = bars[bars.length - 1 - p.dataIndex]; return `${b.count}/${b.total}`; } },
            }],
        }, true);
    },

    _normExtraCharts(data, pfx) {
        // Item 1: Depth histogram
        if (data.depthHist) {
            const chart = this._get(`chart-${pfx}-depth`);
            if (chart) {
                const d = data.depthHist;
                chart.setOption({
                    ...this._theme,
                    grid: { left: 40, right: 20, top: 10, bottom: 30 },
                    xAxis: { type: 'category', data: d.map(x => x.depth), name: 'Keywords', nameLocation: 'center', nameGap: 25, axisLabel: { color: this._tc.textSec } },
                    yAxis: { type: 'value', axisLabel: { color: this._tc.textSec }, splitLine: { lineStyle: { color: this._tc.bgPrimary } } },
                    tooltip: { ...this._theme.tooltip, trigger: 'axis', formatter: p => `${p[0].name} keywords: ${p[0].value} papers` },
                    series: [{ type: 'bar', data: d.map(x => x.count), itemStyle: { color: this._palette.accent, borderRadius: [4,4,0,0] } }],
                }, true);
            }
        }

        // Item 2: Co-occurrence heatmap
        if (data.coocLabels && data.coocMatrix) {
            this._heatmap(`chart-${pfx}-cooc`, {
                xLabels: data.coocLabels,
                yLabels: data.coocLabels,
                matrix: data.coocMatrix,
                grid: { left: 140, right: 60, top: 10, bottom: 100 },
                xRotate: 45,
                vmColor: this._palette.accent,
            });
        }

        // Item 7: Sub-traditions
        if (data.subTraditions && data.subTraditions.length) {
            this._horizontalBar(`chart-${pfx}-subtrad`, data.subTraditions, { gridLeft: 120, color: this._palette.teal });
        }

        // Item 8: Concept timeline
        if (data.conceptTimeline && data.conceptTimeline.years && data.conceptTimeline.years.length) {
            const ct = data.conceptTimeline;
            this._stackedTimeline(`chart-${pfx}-concept-timeline`, {
                years: ct.years,
                series: ct.series.map((s, i) => ({
                    name: s.name,
                    data: s.data,
                    color: this._colors[i % this._colors.length],
                })),
            });
        }

        // Item 10: 5-category research type (replaces donut if present)
        if (data.researchType5 && data.researchType5.length) {
            const rt5Colors = {
                'Empirical Benchmark': this._palette.green,
                'Empirical Non-Benchmark': this._palette.cyan,
                'Philosophical Analysis': this._palette.violet,
                'Mixed Methods': this._palette.yellow,
                'Dataset/Resource': this._palette.orange,
            };
            const pieData = data.researchType5.map(d => ({
                name: d.n, value: d.c,
                itemStyle: { color: rt5Colors[d.n] || this._palette.slate },
            }));
            this._donut(`chart-${pfx}-split`, pieData);
        }
    },

    _normBridge(bridge) {
        if (!bridge) return;
        const countEl = document.getElementById('kpi-norm-bridge-count');
        if (countEl) countEl.textContent = bridge.count || 0;
        const listCountEl = document.getElementById('norm-bridge-list-count');
        if (listCountEl) listCountEl.textContent = (bridge.papers || []).length;

        // Heatmap
        if (bridge.heatmap) {
            this._heatmap('chart-norm-bridge-heatmap', {
                xLabels: bridge.heatmap.xLabels,
                yLabels: bridge.heatmap.yLabels,
                matrix: bridge.heatmap.matrix,
                grid: { left: 60, right: 60, top: 10, bottom: 80 },
                xRotate: 30,
                vmColor: this._palette.violet,
            });
        }

        // Timeline
        if (bridge.timeline && bridge.timeline.years) {
            this._yearBar('chart-norm-bridge-timeline',
                Object.fromEntries(bridge.timeline.years.map((y, i) => [y, bridge.timeline.data[i]])));
        }

        // Paper list
        renderPaperList('norm-bridge-papers', bridge.papers || [], 50);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // TAB 7: MORAL PSYCHOLOGY
    // ═══════════════════════════════════════════════════════════════════════

    _initMoralPsych() {
        const M = DATA.moralPsych;

        // ── KPI Cards ───────────────────────────────────────────────────
        const totalEl = document.getElementById('mp-kpi-total');
        if (totalEl) totalEl.textContent = M.paperCount;
        const pctEl = document.getElementById('mp-kpi-pct');
        if (pctEl) pctEl.textContent = ((M.paperCount / Math.max(DATA.agg.total, 1)) * 100).toFixed(1) + '%';
        const benchEl = document.getElementById('mp-kpi-bench');
        if (benchEl) benchEl.textContent = M.benchmarkCount;
        const llmEl = document.getElementById('mp-kpi-llm');
        if (llmEl) llmEl.textContent = M.papers.filter(p => p.lm && p.lm.length).length;
        const thEl = document.getElementById('mp-kpi-theories');
        if (thEl) thEl.textContent = M.theoryDist.filter(t => t.c > 0).length;
        const weirdEl = document.getElementById('mp-kpi-weird');
        if (weirdEl && M.weirdSplit) {
            const totalW = M.weirdSplit.WEIRD.reduce((a, b) => a + b, 0);
            const totalNW = M.weirdSplit['Non-WEIRD'].reduce((a, b) => a + b, 0);
            weirdEl.textContent = totalW + ' / ' + totalNW;
        }

        // ── Overview: Theory bar ────────────────────────────────────────
        this._horizontalBar('chart-mp-theory-bar', M.theoryDist, { gridLeft: 200, colorFn: x => x.col });

        // ── Overview: Timeline (updated series) ─────────────────────────
        this._stackedTimeline('chart-mp-timeline', {
            years: M.timeline.years,
            series: [
                { name: 'MFT', data: M.timeline.mft, color: '#6366f1' },
                { name: 'Schwartz', data: M.timeline.schwartz, color: '#22d3ee' },
                { name: 'Reasoning', data: M.timeline.reasoning, color: '#f59e0b' },
                { name: 'Dilemmas', data: M.timeline.dilemmas, color: '#ec4899' },
            ],
        });

        // ── Overview: Dominance Shift (stacked % timeline) ──────────────
        if (M.dominanceShift) {
            const ds = M.dominanceShift;
            this._stackedTimeline('chart-mp-dominance', {
                years: ds.years,
                series: [
                    { name: 'MFT', data: ds.MFT, color: '#6366f1' },
                    { name: 'Schwartz', data: ds.Schwartz, color: '#22d3ee' },
                    { name: 'Kohlberg', data: ds.Kohlberg, color: '#f59e0b' },
                    { name: 'Trolley', data: ds.Trolley, color: '#ec4899' },
                    { name: 'DualProc', data: ds.DualProc, color: '#22c55e' },
                ],
                yAxisLabel: '%',
            });
        }

        // ── Overview: WEIRD Split (grouped bar) ─────────────────────────
        if (M.weirdSplit) {
            this._groupedBar('chart-mp-weird-split', {
                categories: M.weirdSplit.theories,
                series: [
                    { name: 'WEIRD', data: M.weirdSplit.WEIRD, color: '#6366f1' },
                    { name: 'Non-WEIRD', data: M.weirdSplit['Non-WEIRD'], color: '#22c55e' },
                    { name: 'Mixed', data: M.weirdSplit.Mixed, color: '#f59e0b' },
                ],
            });
        }

        // ── Overview: Co-occurrence (filtered to 5 theories) ────────────
        this._heatmap('chart-mp-cooccurrence', {
            xLabels: M.coLabels, yLabels: M.coLabels, matrix: M.cooccurrence,
            grid: { left: 180, right: 60, top: 40, bottom: 120 }, xRotate: 30, vmColor: this._palette.pink,
        });

        // ── Value Frameworks: MFT ───────────────────────────────────────
        this._deepDiveSubSection('mp', 'mft', M.mft, [
            { render(data, pfx) {
                const maxVal = Math.max(...data.foundations.map(f => f.c), 1);
                this._radar(`chart-${pfx}-radar`, {
                    indicators: data.foundations.map(f => ({ name: f.n, max: maxVal })),
                    series: [{ values: data.foundations.map(f => f.c), name: 'MFT Foundations', color: '#6366f1', areaColor: 'rgba(99,102,241,0.3)' }],
                });
                if (data.approachDist && data.approachDist.length) {
                    const apData = data.approachDist.map(d => ({ name: d.n, value: d.c }));
                    this._donut(`chart-${pfx}-approach`, apData);
                }
            }},
        ]);

        // ── Value Frameworks: Schwartz ──────────────────────────────────
        this._deepDiveSubSection('mp', 'schwartz', M.schwartz, [
            { render(data, pfx) {
                if (data.valueDims) {
                    const maxVal = Math.max(...data.valueDims.map(v => v.c), 1);
                    this._radar(`chart-${pfx}-radar`, {
                        indicators: data.valueDims.map(v => ({ name: v.n, max: maxVal })),
                        series: [{ values: data.valueDims.map(v => v.c), name: 'Schwartz Values', color: '#22d3ee', areaColor: 'rgba(34,211,238,0.3)' }],
                    });
                }
                if (data.higherOrder && data.higherOrder.length) {
                    const hoData = data.higherOrder.map(d => ({ name: d.n, value: d.c }));
                    this._donut(`chart-${pfx}-circumplex`, hoData);
                }
            }},
        ]);

        // ── Moral Reasoning (Kohlberg) ──────────────────────────────────
        this._deepDiveSubSection('mp', 'reasoning', M.reasoning, []);

        // ── Moral Dilemmas (Trolley) ────────────────────────────────────
        this._deepDiveSubSection('mp', 'dilemmas', M.dilemmas, [
            { render(data, pfx) {
                if (data.paradigmDist && data.paradigmDist.length) {
                    this._horizontalBar(`chart-${pfx}-paradigm`, data.paradigmDist, {
                        gridLeft: 140, color: this._palette.pink, barMaxWidth: 30,
                        emptyText: 'No paradigm data'
                    });
                }
            }},
        ]);

        // ── Cross-Framework: Model x Theory Heatmap ─────────────────────
        if (M.modelTheory) {
            this._heatmap('chart-mp-model-theory-heatmap', {
                xLabels: M.modelTheory.theories,
                yLabels: M.modelTheory.models,
                matrix: M.modelTheory.matrix,
                grid: { left: 120, right: 60, top: 40, bottom: 120 },
                xRotate: 30,
                vmColor: '#6366f1',
            });
        }

        // ── Cross-Framework: Alignment Outcomes ─────────────────────────
        if (M.alignment && M.alignment.length) {
            this._horizontalBar('chart-mp-alignment', M.alignment, {
                gridLeft: 160, color: '#22c55e',
            });
        }

        // ── Cross-Framework: Research Methodology ───────────────────────
        if (M.methodology && M.methodology.length) {
            const methData = M.methodology.map(d => ({ name: d.n, value: d.c }));
            this._donut('chart-mp-methodology', methData);
        }

        // ── Cross-Framework: Instruments ────────────────────────────────
        if (M.instruments && M.instruments.length) {
            this._horizontalBar('chart-mp-instruments', M.instruments, {
                gridLeft: 120, color: '#f59e0b',
            });
        }

        // ── Cross-Framework: Normative Bridge Heatmap ───────────────────
        if (M.normativeBridge) {
            this._heatmap('chart-mp-normative-bridge', {
                xLabels: M.normativeBridge.frameworks,
                yLabels: M.normativeBridge.theories,
                matrix: M.normativeBridge.matrix,
                grid: { left: 180, right: 60, top: 40, bottom: 80 },
                xRotate: 0,
                vmColor: '#a855f7',
            });
        }

        // ── Cross-Framework: Sophistication (dual-axis bar + line) ──────
        if (M.sophistication && M.sophistication.years.length) {
            const soph = M.sophistication;
            const chart = this._get('chart-mp-sophistication');
            if (chart) {
                chart.setOption({
                    tooltip: { trigger: 'axis' },
                    legend: { data: ['Paper Count', 'Avg Theories/Paper'], textStyle: { color: this._tc.textSec } },
                    grid: { left: 60, right: 60, top: 40, bottom: 30 },
                    xAxis: { type: 'category', data: soph.years.map(String), axisLabel: { color: this._tc.textSec } },
                    yAxis: [
                        { type: 'value', name: 'Papers', axisLabel: { color: this._tc.textSec }, splitLine: { lineStyle: { color: this._tc.bgPrimary } } },
                        { type: 'value', name: 'Avg Theories', axisLabel: { color: this._tc.textSec }, splitLine: { show: false } },
                    ],
                    series: [
                        { name: 'Paper Count', type: 'bar', data: soph.paperCounts, itemStyle: { color: 'rgba(99,102,241,0.5)' }, yAxisIndex: 0 },
                        { name: 'Avg Theories/Paper', type: 'line', data: soph.avgTheories, lineStyle: { color: '#ec4899', width: 2 }, itemStyle: { color: '#ec4899' }, yAxisIndex: 1, smooth: true },
                    ],
                });
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════════════
    // TAB 8: RELIGIOUS VALUES
    // ═══════════════════════════════════════════════════════════════════════

    _initReligious() {
        const R = DATA.religious;

        // Tradition bar (per-item colors)
        this._horizontalBar('chart-rel-trad-bar', R.traditionDist, {
            gridLeft: 120, colorFn: x => x.col,
            onClick: p => { if (p.name) FilterState.toggle('religion', p.name); },
        });

        // Timeline
        this._stackedTimeline('chart-rel-timeline', {
            years: R.timeline.years,
            series: [
                { name: 'Abrahamic', data: R.timeline.abrahamic, color: this._palette.accent },
                { name: 'Dharmic', data: R.timeline.dharmic, color: this._palette.yellow },
                { name: 'East Asian', data: R.timeline.eastAsian, color: this._palette.cyan },
                { name: 'African/Indigenous', data: R.timeline.africanIndigenous, color: this._palette.orange },
            ],
        });

        // Co-occurrence
        this._heatmap('chart-rel-cooccurrence', {
            xLabels: R.coLabels, yLabels: R.coLabels, matrix: R.cooccurrence,
            grid: { left: 110, right: 60, top: 40, bottom: 80 }, xRotate: 30, vmColor: this._palette.orange,
        });

        // Sub-sections + extended charts via unified _deepDiveSubSection (11 individual traditions)
        const relSections = [
            ['islamic', R.islamic], ['christianity', R.christianity],
            ['judaism', R.judaism], ['buddhism', R.buddhism],
            ['hinduism', R.hinduism], ['confucian', R.confucian],
            ['shinto', R.shinto], ['ubuntu', R.ubuntu],
            ['indigenous', R.indigenous], ['other', R.otherTraditions],
        ];
        for (const [key, data] of relSections) {
            if (data) this._deepDiveSubSection('rel', key, data, this._relExtendedConfigs[key]);
        }
    },

    // Config-driven extended chart definitions for each religious sub-section
    _relExtendedConfigs: {
        islamic: [
            { render(data, fk) {
                // Domain treemap
                const items = (data.domainDist || []).map(d => ({ name: d.n, value: d.c }));
                this._treemap('chart-rel-islamic-domains', items, {
                    levels: [{ color: ['#166534','#15803d','#16a34a','#22c55e','#4ade80','#86efac'], colorMappingBy: 'index' }],
                    tooltipFmt: p => `${p.name}: ${p.value}`,
                });
                this._attachExtFnFilter(fk, 'chart-rel-islamic-domains', p => { const d = (data.domainDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Language/geo bar
                const d = (data.langGeo || []).slice(0, 12);
                const regionColors = { 'Middle East': this._palette.green, 'South Asia': this._palette.yellow, 'Southeast Asia': this._palette.cyan, 'Africa': this._palette.orange, 'Global': this._palette.accent, 'Other': this._palette.slate };
                this._horizontalBar('chart-rel-islamic-langgeo', d.map(x => ({ n: x.lang, c: x.c, region: x.region })), {
                    gridLeft: 110, colorFn: x => regionColors[x.region] || this._palette.slate,
                    tooltipFmt: p => `${p[0].name}: ${p[0].value} (${d.find(x => x.lang === p[0].name)?.region || ''})`,
                });
                this._attachExtFnFilter(fk, 'chart-rel-islamic-langgeo', p => { const dd = (data.langGeo||[]).find(x => x.lang === p.name); return dd ? {label: dd.lang, fns: dd.fns} : null; });
            }},
            { render(data, fk) {
                // Resource vs Bias streams
                const sl = data.streamTimeline || {};
                if ((sl.years || []).length) {
                    this._stackedTimeline('chart-rel-islamic-streams', {
                        years: sl.years,
                        series: [
                            { name: 'Resource', data: sl.resource || [], color: this._palette.green, areaStyle: { color: 'rgba(34,197,94,0.2)' } },
                            { name: 'Bias', data: sl.bias || [], color: this._palette.red, areaStyle: { color: 'rgba(239,68,68,0.2)' } },
                        ],
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-islamic-streams', p => { const fns = (data.streamTimelineFns||{})[p.seriesName]; return fns ? {label: p.seriesName, fns} : null; });
            }},
            { render(data, fk) {
                // Source coverage radar
                const d = data.sourceCoverage || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-islamic-sources', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Source Coverage', color: this._palette.green, areaColor: 'rgba(34,197,94,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-islamic-sources', p => { const fns = (data.sourceCoverageFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Co-traditions bar
                const flows = data.coTraditions || [];
                if (flows.length) {
                    const tradColors = { 'Christianity': this._palette.accent, 'Judaism': this._palette.violet, 'Buddhism': this._palette.yellow, 'Hinduism': this._palette.pink, 'Confucian': this._palette.cyan, 'Ubuntu': this._palette.orange, 'Indigenous': this._palette.teal, 'Shinto': '#e879f9' };
                    const sorted = [...flows].sort((a, b) => b.value - a.value);
                    this._horizontalBar('chart-rel-islamic-sankey', sorted.map(f => ({ n: f.target, c: f.value, trad: f.target })), { colorFn: x => tradColors[x.trad] || this._palette.slate });
                }
                this._attachExtFnFilter(fk, 'chart-rel-islamic-sankey', p => { const d = (data.coTraditions||[]).find(x => x.target === p.name); return d ? {label: d.target, fns: d.fns} : null; });
            }},
        ],
        christianity: [
            { render(data, fk) {
                // Denominational landscape donut
                const denomColors = { 'Catholic': '#6366f1', 'Protestant': '#818cf8', 'Orthodox': '#a5b4fc', 'Evangelical': '#c7d2fe', 'General/Unspecified': this._palette.slate };
                const pieData = (data.denomDist || []).map(d => ({ name: d.n, value: d.c, itemStyle: { color: denomColors[d.n] || this._palette.slate } }));
                if (pieData.length) this._donut('chart-rel-christianity-denom', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-christianity-denom', p => { const d = (data.denomDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Theological concepts radar
                const d = data.conceptRadar || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-christianity-concepts', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Theological Concepts', color: this._palette.accent, areaColor: 'rgba(99,102,241,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-christianity-concepts', p => { const fns = (data.conceptRadarFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Sacred text coverage radar
                const d = data.textCoverage || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-christianity-texts', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Text Coverage', color: '#818cf8', areaColor: 'rgba(129,140,248,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-christianity-texts', p => { const fns = (data.textCoverageFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Research focus donut
                const pieColors = [this._palette.accent, this._palette.violet, this._palette.sky, this._palette.green, this._palette.yellow, this._palette.slate];
                const pieData = (data.focusDist || []).map((d, i) => ({ name: d.n, value: d.c, itemStyle: { color: pieColors[i % 6] } }));
                if (pieData.length) this._donut('chart-rel-christianity-focus', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-christianity-focus', p => { const d = (data.focusDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Normative ethics overlap bar
                const d = data.normativeCross || [];
                if (d.length) {
                    this._horizontalBar('chart-rel-christianity-normative', d.map(x => ({ n: x.framework, c: x.count })), { color: this._palette.accent });
                }
                this._attachExtFnFilter(fk, 'chart-rel-christianity-normative', p => { const fns = (data.normativeCrossFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Cross-tradition connections
                const tradColors = { 'Islam': this._palette.green, 'Judaism': this._palette.violet, 'Buddhism': this._palette.yellow, 'Hinduism': this._palette.pink, 'Confucian': this._palette.cyan, 'Ubuntu': this._palette.orange, 'Indigenous': this._palette.teal, 'Shinto': '#e879f9' };
                this._horizontalBar('chart-rel-christianity-cotrad', (data.coTraditions || []), { colorFn: x => tradColors[x.n] || this._palette.slate });
                this._attachExtFnFilter(fk, 'chart-rel-christianity-cotrad', p => { const d = (data.coTraditions||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
        ],
        judaism: [
            { render(data, fk) {
                // Core concepts radar
                const d = data.conceptRadar || [];
                if (d.length && d.some(x => x.val > 0)) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-judaism-concepts', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Core Concepts', color: this._palette.violet, areaColor: 'rgba(168,85,247,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                } else { const el = document.getElementById('chart-rel-judaism-concepts'); if (el) el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:40px;font-size:13px">Sparse data — fewer than 5 papers reference specific Jewish concepts in abstracts</p>'; }
                this._attachExtFnFilter(fk, 'chart-rel-judaism-concepts', p => { const fns = (data.conceptRadarFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Textual sources radar
                const d = data.textSources || [];
                if (d.length && d.some(x => x.val > 0)) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-judaism-texts', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Textual Sources', color: '#c084fc', areaColor: 'rgba(192,132,252,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                } else { const el = document.getElementById('chart-rel-judaism-texts'); if (el) el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:40px;font-size:13px">Sparse data — textual source references not detected in abstracts</p>'; }
                this._attachExtFnFilter(fk, 'chart-rel-judaism-texts', p => { const fns = (data.textSourcesFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Research focus donut
                const pieColors = [this._palette.violet, this._palette.accent, this._palette.sky, this._palette.slate];
                const pieData = (data.focusDist || []).map((d, i) => ({ name: d.n, value: d.c, itemStyle: { color: pieColors[i % 4] } }));
                if (pieData.length) this._donut('chart-rel-judaism-focus', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-judaism-focus', p => { const d = (data.focusDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Normative ethics overlap bar
                const d = data.normativeCross || [];
                if (d.length) {
                    this._horizontalBar('chart-rel-judaism-normative', d.map(x => ({ n: x.framework, c: x.count })), { color: this._palette.violet });
                }
                this._attachExtFnFilter(fk, 'chart-rel-judaism-normative', p => { const fns = (data.normativeCrossFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Cross-tradition connections
                const tradColors = { 'Islam': this._palette.green, 'Christianity': this._palette.accent, 'Buddhism': this._palette.yellow, 'Hinduism': this._palette.pink, 'Confucian': this._palette.cyan, 'Ubuntu': this._palette.orange, 'Indigenous': this._palette.teal, 'Shinto': '#e879f9' };
                this._horizontalBar('chart-rel-judaism-cotrad', (data.coTraditions || []), { colorFn: x => tradColors[x.n] || this._palette.slate });
                this._attachExtFnFilter(fk, 'chart-rel-judaism-cotrad', p => { const d = (data.coTraditions||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
        ],
        buddhism: [
            { render(data, fk) {
                // School detection donut
                const schoolColors = { 'Theravada': '#f59e0b', 'Mahayana': '#fbbf24', 'Vajrayana': '#d97706', 'Zen': '#b45309', 'Secular Buddhism': '#92400e', 'General/Unspecified': this._palette.slate };
                const pieData = (data.schoolDist || []).map(d => ({ name: d.n, value: d.c, itemStyle: { color: schoolColors[d.n] || this._palette.slate } }));
                if (pieData.length) this._donut('chart-rel-buddhism-schools', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-buddhism-schools', p => { const d = (data.schoolDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Core concepts radar
                const d = data.conceptRadar || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-buddhism-concepts', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Buddhist Concepts', color: this._palette.yellow, areaColor: 'rgba(245,158,11,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-buddhism-concepts', p => { const fns = (data.conceptRadarFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Textual sources radar
                const d = data.textSources || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-buddhism-texts', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Text Sources', color: '#fbbf24', areaColor: 'rgba(251,191,36,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-buddhism-texts', p => { const fns = (data.textSourcesFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Research focus bar
                const d = data.researchFocus || [];
                if (d.length) this._horizontalBar('chart-rel-buddhism-focus', d.map(x => ({ n: x.category, c: x.count })), { color: this._palette.yellow });
                this._attachExtFnFilter(fk, 'chart-rel-buddhism-focus', p => { const fns = (data.researchFocusFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Cultural contexts donut
                const pieColors = [this._palette.yellow, this._palette.pink, this._palette.sky, this._palette.green, this._palette.accent, this._palette.slate];
                const pieData = (data.cultureDist || []).map((d, i) => ({ name: d.n, value: d.c, itemStyle: { color: pieColors[i % 6] } }));
                if (pieData.length) this._donut('chart-rel-buddhism-cultures', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-buddhism-cultures', p => { const d = (data.cultureDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Language coverage bar
                this._horizontalBar('chart-rel-buddhism-langs', (data.languageDist || []), { maxItems: 10, gridLeft: 110, color: this._palette.yellow });
                this._attachExtFnFilter(fk, 'chart-rel-buddhism-langs', p => { const d = (data.languageDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Cross-tradition connections
                const tradColors = { 'Islam': this._palette.green, 'Christianity': this._palette.accent, 'Judaism': this._palette.violet, 'Hinduism': this._palette.pink, 'Confucian': this._palette.cyan, 'Ubuntu': this._palette.orange, 'Indigenous': this._palette.teal, 'Shinto': '#e879f9' };
                this._horizontalBar('chart-rel-buddhism-cotrad', (data.coTraditions || []), { colorFn: x => tradColors[x.n] || this._palette.slate });
                this._attachExtFnFilter(fk, 'chart-rel-buddhism-cotrad', p => { const d = (data.coTraditions||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
        ],
        hinduism: [
            { render(data, fk) {
                // Textual tradition radar
                const d = data.textRadar || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-hinduism-texts', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Textual Tradition', color: this._palette.pink, areaColor: 'rgba(236,72,153,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-hinduism-texts', p => { const fns = (data.textRadarFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Core concepts radar
                const d = data.conceptRadar || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-hinduism-concepts', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Hindu Concepts', color: '#f472b6', areaColor: 'rgba(244,114,182,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-hinduism-concepts', p => { const fns = (data.conceptRadarFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Philosophical schools donut
                const schoolColors = { 'Vedanta': '#ec4899', 'Samkhya': '#f472b6', 'Yoga': '#db2777', 'Nyaya': '#be185d', 'Mimamsa': '#9d174d', 'General/Unspecified': this._palette.slate };
                const pieData = (data.schoolDist || []).map(d => ({ name: d.n, value: d.c, itemStyle: { color: schoolColors[d.n] || this._palette.slate } }));
                if (pieData.length) this._donut('chart-rel-hinduism-schools', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-hinduism-schools', p => { const d = (data.schoolDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Research focus bar
                const d = data.researchFocus || [];
                if (d.length) this._horizontalBar('chart-rel-hinduism-focus', d.map(x => ({ n: x.category, c: x.count })), { color: this._palette.pink });
                this._attachExtFnFilter(fk, 'chart-rel-hinduism-focus', p => { const fns = (data.researchFocusFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Cultural contexts donut
                const pieColors = [this._palette.pink, this._palette.yellow, this._palette.sky, this._palette.green, this._palette.accent, this._palette.slate];
                const pieData = (data.cultureDist || []).map((d, i) => ({ name: d.n, value: d.c, itemStyle: { color: pieColors[i % 6] } }));
                if (pieData.length) this._donut('chart-rel-hinduism-cultures', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-hinduism-cultures', p => { const d = (data.cultureDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Language coverage bar
                this._horizontalBar('chart-rel-hinduism-langs', (data.languageDist || []), { maxItems: 10, gridLeft: 110, color: this._palette.pink });
                this._attachExtFnFilter(fk, 'chart-rel-hinduism-langs', p => { const d = (data.languageDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Cross-tradition connections
                const tradColors = { 'Islam': this._palette.green, 'Christianity': this._palette.accent, 'Judaism': this._palette.violet, 'Buddhism': this._palette.yellow, 'Confucian': this._palette.cyan, 'Ubuntu': this._palette.orange, 'Indigenous': this._palette.teal, 'Shinto': '#e879f9' };
                this._horizontalBar('chart-rel-hinduism-cotrad', (data.coTraditions || []), { colorFn: x => tradColors[x.n] || this._palette.slate });
                this._attachExtFnFilter(fk, 'chart-rel-hinduism-cotrad', p => { const d = (data.coTraditions||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
        ],
        confucian: [
            { render(data, fk) {
                // Cultural footprint treemap
                const items = (data.culturalFootprint || []).map(d => ({ name: d.n, value: d.c }));
                if (items.length) this._treemap('chart-rel-confucian-cultures', items, {
                    levels: [{ color: ['#164e63','#155e75','#0e7490','#0891b2','#22d3ee','#67e8f9'], colorMappingBy: 'index' }],
                    tooltipFmt: p => `${p.name}: ${p.value}`,
                });
                this._attachExtFnFilter(fk, 'chart-rel-confucian-cultures', p => { const d = (data.culturalFootprint||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Framework overlap radar
                const d = data.frameworkOverlap || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-confucian-frameworks', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Framework Overlap', color: this._palette.cyan, areaColor: 'rgba(34,211,238,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-confucian-frameworks', p => { const fns = (data.frameworkOverlapFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Chinese vs Western LLMs grouped bar
                const d = data.chineseVsWesternLLMs || [];
                if (d.length) {
                    const chinese = d.filter(x => x.origin === 'Chinese'), western = d.filter(x => x.origin === 'Western');
                    const allNames = [...new Set(d.map(x => x.n))];
                    const lookup = (arr, name) => { const f = arr.find(x => x.n === name); return f ? f.c : 0; };
                    this._groupedBar('chart-rel-confucian-llms', {
                        categories: allNames, xRotate: 20,
                        series: [
                            { name: 'Chinese', data: allNames.map(n => lookup(chinese, n)), color: this._palette.red },
                            { name: 'Western', data: allNames.map(n => lookup(western, n)), color: this._palette.sky },
                        ],
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-confucian-llms', p => { const d = (data.chineseVsWesternLLMs||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Language distribution donut
                const pieColors = [this._palette.cyan, this._palette.accent, this._palette.yellow, this._palette.green, this._palette.pink, this._palette.slate];
                const pieData = (data.languageDist || []).map((d, i) => ({ name: d.n, value: d.c, itemStyle: { color: pieColors[i % 6] } }));
                if (pieData.length) this._donut('chart-rel-confucian-langs', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-confucian-langs', p => { const d = (data.languageDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Research trajectory stacked bar
                const rp = data.researchProfile || {};
                if ((rp.years || []).length) {
                    this._groupedBar('chart-rel-confucian-trajectory', {
                        categories: rp.years.map(String), stack: 'total',
                        axisPointer: { type: 'shadow' },
                        series: [
                            { name: 'Empirical', data: rp.empirical || [], color: this._palette.cyan },
                            { name: 'Theoretical', data: rp.theoretical || [], color: this._palette.accent },
                        ],
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-confucian-trajectory', p => { const fns = (data.researchProfileFns||{})[p.seriesName]; return fns ? {label: p.seriesName, fns} : null; });
            }},
            { render(data, fk) {
                // Concept frequency bar
                this._horizontalBar('chart-rel-confucian-concepts', (data.conceptFreq || []), { maxItems: 15, gridLeft: 140, color: this._palette.cyan });
                this._attachExtFnFilter(fk, 'chart-rel-confucian-concepts', p => { const d = (data.conceptFreq||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
        ],
        shinto: [
            { render(data, fk) {
                // Core concepts radar
                const d = data.conceptRadar || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-shinto-concepts', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Shinto Concepts', color: '#e879f9', areaColor: 'rgba(232,121,249,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-shinto-concepts', p => { const fns = (data.conceptRadarFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Research themes donut
                const pieColors = ['#e879f9', '#d946ef', '#c026d3', '#a21caf', this._palette.slate];
                const pieData = (data.themeDist || []).map((d, i) => ({ name: d.n, value: d.c, itemStyle: { color: pieColors[i % 5] } }));
                if (pieData.length) this._donut('chart-rel-shinto-themes', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-shinto-themes', p => { const d = (data.themeDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Cultural context bar
                this._horizontalBar('chart-rel-shinto-cultures', (data.cultureDist || []), { maxItems: 10, gridLeft: 110, color: '#e879f9' });
                this._attachExtFnFilter(fk, 'chart-rel-shinto-cultures', p => { const d = (data.cultureDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Cross-tradition connections
                const tradColors = { 'Islam': this._palette.green, 'Christianity': this._palette.accent, 'Judaism': this._palette.violet, 'Buddhism': this._palette.yellow, 'Hinduism': this._palette.pink, 'Confucian': this._palette.cyan, 'Ubuntu': this._palette.orange, 'Indigenous': this._palette.teal };
                this._horizontalBar('chart-rel-shinto-cotrad', (data.coTraditions || []), { colorFn: x => tradColors[x.n] || this._palette.slate });
                this._attachExtFnFilter(fk, 'chart-rel-shinto-cotrad', p => { const d = (data.coTraditions||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data) {
                // Gap vs vault average
                const d = data.gapComparison || [];
                if (d.length) {
                    this._groupedBar('chart-rel-shinto-gap', {
                        categories: d.map(x => x.metric), xRotate: 20,
                        series: [
                            { name: 'Shinto', data: d.map(x => x.subset), color: '#e879f9' },
                            { name: 'Vault Avg', data: d.map(x => x.vault), color: this._palette.slate },
                        ],
                    });
                }
            }},
        ],
        ubuntu: [
            { render(data, fk) {
                // Core concepts radar
                const d = data.conceptRadar || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-ubuntu-concepts', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Ubuntu Concepts', color: this._palette.orange, areaColor: 'rgba(249,115,22,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-ubuntu-concepts', p => { const fns = (data.conceptRadarFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Research themes donut
                const pieColors = [this._palette.orange, '#ea580c', '#c2410c', '#9a3412', this._palette.slate];
                const pieData = (data.themeDist || []).map((d, i) => ({ name: d.n, value: d.c, itemStyle: { color: pieColors[i % 5] } }));
                if (pieData.length) this._donut('chart-rel-ubuntu-themes', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-ubuntu-themes', p => { const d = (data.themeDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Pan-African geographic spread
                this._horizontalBar('chart-rel-ubuntu-geo', (data.geoDist || []), { maxItems: 12, gridLeft: 110, color: this._palette.orange });
                this._attachExtFnFilter(fk, 'chart-rel-ubuntu-geo', p => { const d = (data.geoDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data) {
                // Gap vs vault average
                const d = data.gapComparison || [];
                if (d.length) {
                    this._groupedBar('chart-rel-ubuntu-gap', {
                        categories: d.map(x => x.metric), xRotate: 20,
                        series: [
                            { name: 'Ubuntu', data: d.map(x => x.subset), color: this._palette.orange },
                            { name: 'Vault Avg', data: d.map(x => x.vault), color: this._palette.slate },
                        ],
                    });
                }
            }},
            { render(data, fk) {
                // Cross-tradition connections
                const tradColors = { 'Islam': this._palette.green, 'Christianity': this._palette.accent, 'Judaism': this._palette.violet, 'Buddhism': this._palette.yellow, 'Hinduism': this._palette.pink, 'Confucian': this._palette.cyan, 'Indigenous': this._palette.teal, 'Shinto': '#e879f9' };
                this._horizontalBar('chart-rel-ubuntu-cotrad', (data.coTraditions || []), { colorFn: x => tradColors[x.n] || this._palette.slate });
                this._attachExtFnFilter(fk, 'chart-rel-ubuntu-cotrad', p => { const d = (data.coTraditions||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
        ],
        indigenous: [
            { render(data, fk) {
                // Specific traditions donut
                const tradColors = { 'Maori': '#14b8a6', 'First Nations': '#0d9488', 'Aboriginal Australian': '#0f766e', 'Native American': '#115e59', 'Other Indigenous': this._palette.slate };
                const pieData = (data.traditionDist || []).map(d => ({ name: d.n, value: d.c, itemStyle: { color: tradColors[d.n] || this._palette.slate } }));
                if (pieData.length) this._donut('chart-rel-indigenous-traditions', pieData);
                this._attachExtFnFilter(fk, 'chart-rel-indigenous-traditions', p => { const d = (data.traditionDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data, fk) {
                // Core themes radar
                const d = data.themeRadar || [];
                if (d.length) {
                    const maxVal = Math.max(...d.map(x => x.val), 1);
                    this._radar('chart-rel-indigenous-themes', {
                        triggerEvent: true, indicators: d.map(x => ({ name: x.axis, max: maxVal })),
                        series: [{ values: d.map(x => x.val), name: 'Indigenous Themes', color: this._palette.teal, areaColor: 'rgba(20,184,166,0.3)' }],
                        splitAreaColors: [this._tc.bgPrimary, this._tc.bgCard], showAxisLine: true,
                    });
                }
                this._attachExtFnFilter(fk, 'chart-rel-indigenous-themes', p => { const fns = (data.themeRadarFns||{})[p.name]; return fns ? {label: p.name, fns} : null; });
            }},
            { render(data, fk) {
                // Geographic origins bar
                this._horizontalBar('chart-rel-indigenous-geo', (data.geoDist || []), { maxItems: 12, gridLeft: 110, color: this._palette.teal });
                this._attachExtFnFilter(fk, 'chart-rel-indigenous-geo', p => { const d = (data.geoDist||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
            { render(data) {
                // Gap vs vault average
                const d = data.gapComparison || [];
                if (d.length) {
                    this._groupedBar('chart-rel-indigenous-gap', {
                        categories: d.map(x => x.metric), xRotate: 20,
                        series: [
                            { name: 'Indigenous', data: d.map(x => x.subset), color: this._palette.teal },
                            { name: 'Vault Avg', data: d.map(x => x.vault), color: this._palette.slate },
                        ],
                    });
                }
            }},
            { render(data, fk) {
                // Cross-tradition connections
                const tradColors = { 'Islam': this._palette.green, 'Christianity': this._palette.accent, 'Judaism': this._palette.violet, 'Buddhism': this._palette.yellow, 'Hinduism': this._palette.pink, 'Confucian': this._palette.cyan, 'Ubuntu': this._palette.orange, 'Shinto': '#e879f9' };
                this._horizontalBar('chart-rel-indigenous-cotrad', (data.coTraditions || []), { colorFn: x => tradColors[x.n] || this._palette.slate });
                this._attachExtFnFilter(fk, 'chart-rel-indigenous-cotrad', p => { const d = (data.coTraditions||[]).find(x => x.n === p.name); return d ? {label: d.n, fns: d.fns} : null; });
            }},
        ],
        other: [
            { render(data) {
                // Summary comparison table
                const el = document.getElementById('rel-other-summary');
                if (!el) return;
                const st = data.summaryTable || [];
                if (!st.length) return;
                const rows = st.map(t => {
                    return `<tr><td style="padding:6px 12px;color:#cbd5e1;font-weight:500">${t.tradition}</td><td style="padding:6px 12px;text-align:right;color:#94a3b8">${t.paperCount}</td><td style="padding:6px 12px;text-align:right;color:#94a3b8">${t.benchmarkCount}</td><td style="padding:6px 12px;color:#94a3b8;font-size:11px">${t.keyConcepts.join(', ')}</td></tr>`;
                }).join('');
                el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;background:#0f172a;border-radius:6px;overflow:hidden"><thead><tr style="background:#1e293b"><th style="padding:8px 12px;text-align:left;color:#94a3b8;border-bottom:1px solid #334155">Tradition</th><th style="padding:8px 12px;text-align:right;color:#94a3b8;border-bottom:1px solid #334155">Papers</th><th style="padding:8px 12px;text-align:right;color:#94a3b8;border-bottom:1px solid #334155">Benchmarks</th><th style="padding:8px 12px;text-align:left;color:#94a3b8;border-bottom:1px solid #334155">Key Concepts</th></tr></thead><tbody>${rows}</tbody></table>`;
            }},
            { render(data, fk) {
                // Key concepts per tradition grouped bar
                const cd = data.conceptData || [];
                if (cd.length) {
                    const tradColors = { 'Jainism': '#22c55e', 'Sikhism': '#f59e0b', 'Taoism': '#22d3ee', "Baha'i": '#a855f7', 'Zoroastrianism': '#ef4444' };
                    this._horizontalBar('chart-rel-other-concepts', cd.map(x => ({ n: `${x.tradition}: ${x.concept}`, c: x.count, trad: x.tradition })), {
                        gridLeft: 180, colorFn: x => tradColors[x.trad] || this._palette.slate,
                    });
                }
            }},
            { render(data) {
                // Coverage gap bar
                const d = data.gapComparison || [];
                if (d.length) {
                    this._groupedBar('chart-rel-other-gap', {
                        categories: d.map(x => x.metric), xRotate: 20,
                        series: [
                            { name: 'Other Traditions', data: d.map(x => x.subset), color: this._palette.slate },
                            { name: 'Vault Avg', data: d.map(x => x.vault), color: this._palette.accent },
                        ],
                    });
                }
            }},
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // TAB 9: MODELS & LLMs
    // ═══════════════════════════════════════════════════════════════════════

    _initModels() {
        const L = DATA.llm;

        // Compute model-family counts from p.lm at runtime (matches filter logic)
        const llmPapers = DATA.papers.filter(p => p.lm && p.lm.length);
        const familyCounts = {};
        llmPapers.forEach(p => (p.lm || []).forEach(m => {
            familyCounts[m] = (familyCounts[m] || 0) + 1;
        }));
        const familyItems = Object.entries(familyCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([n, c]) => ({ n, c }));
        this._horizontalBar('chart-llm-models', familyItems, {
            maxItems: 20, fontSize: 10, color: this._palette.violet,
        });

        // Model coverage timeline (computed from p.lm to match filter)
        const yearCounts = {};
        DATA.papers.forEach(p => {
            if (!p.y || p.y < 2016) return;
            const k = String(p.y);
            if (!yearCounts[k]) yearCounts[k] = { a: 0, na: 0 };
            if (p.lm && p.lm.length) yearCounts[k].a++;
            else yearCounts[k].na++;
        });
        const years = Object.keys(yearCounts).sort();
        this._stackedTimeline('chart-llm-timeline', {
            years,
            series: [
                { name: 'Has Models', type: 'bar', data: years.map(y => yearCounts[y].a),
                  color: this._palette.green, stack: 'total', smooth: false },
                { name: 'No Models', type: 'bar', data: years.map(y => yearCounts[y].na),
                  color: '#475569', stack: 'total', smooth: false },
            ],
        });

        // Repo distribution donut
        const repoColors = { GitHub: this._tc.textPri, HuggingFace: this._palette.yellow, Zenodo: this._palette.green, OSF: this._palette.accent, Kaggle: this._palette.cyan, Other: this._palette.slate };
        const repoData = L.repoDist.map(d => ({ name: d.n, value: d.c, itemStyle: { color: repoColors[d.n] || this._palette.slate } }));
        this._donut('chart-llm-repos', repoData, { radius: ['35%', '65%'] });

        // v7: Model Depth sub-tab
        this._initModelDepth();

        // --- Paper list + click-to-filter (Overview) ---
        this._attachModelFilter('models-ov', llmPapers, [
            {
                chartId: 'chart-llm-models',
                dim: 'model',
                filterFn: (p, val) => (p.lm || []).includes(val),
            },
            {
                chartId: 'chart-llm-timeline',
                dim: 'year',
                filterFn: (p, val) => p.y === +val,
            },
        ]);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Phase 5: UNIFIED DEEP-DIVE SUB-SECTION
    // Replaces _normSubSection, _mpSubSection, _relSubSection (~80 lines saved)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Standard deep-dive sub-section renderer.
     * Handles: count badge, year bar, models bar, optional split/venue/region donuts,
     * extraCharts for section-specific additions, paper list, and filter wiring.
     *
     * @param {string} prefix - tab prefix (e.g., 'norm', 'mp', 'rel')
     * @param {string} key - sub-section key (e.g., 've', 'mft', 'islamic')
     * @param {object} data - sub-section data (count, yearDist, topModels, papers, etc.)
     * @param {Array} [extraCharts] - section-specific chart configs: [{render(data, pfx)}]
     */
    _deepDiveSubSection(prefix, key, data, extraCharts) {
        const countEl = document.getElementById(`${prefix}-${key}-count`);
        if (countEl) countEl.textContent = data.count;
        const listCountEl = document.getElementById(`${prefix}-${key}-list-count`);
        if (listCountEl) listCountEl.textContent = data.count;

        // Standard charts
        this._yearBar(`chart-${prefix}-${key}-year`, data.yearDist);
        this._horizontalBar(`chart-${prefix}-${key}-models`, data.topModels, {
            maxItems: 10, color: this._palette.yellow, emptyText: 'No model data' });

        // Optional standard charts (present on normative/moralpsych, absent on religious)
        if (data.theoryVsEmpirical) {
            const sliceColors = { 'Benchmark / Evaluation': this._palette.green, 'Theoretical / Framework': this._palette.slate };
            const pieData = data.theoryVsEmpirical.map(d => ({ name: d.n, value: d.c, itemStyle: { color: sliceColors[d.n] || this._tc.textSec } }));
            this._donut(`chart-${prefix}-${key}-split`, pieData);
        }
        if (data.venueTypeDist) {
            const vtPie = data.venueTypeDist.map(d => ({ name: d.n, value: d.c, itemStyle: { color: this._vtColors[d.n] || this._palette.slate } }));
            this._donut(`chart-${prefix}-${key}-venue`, vtPie);
        }
        if (data.regionDist && data.regionDist.length) {
            this._horizontalBar(`chart-${prefix}-${key}-regions`, data.regionDist, { maxItems: 8, color: this._palette.pink });
        }

        // Section-specific extras (e.g., virtue keywords, Schwartz radar, Islamic domains)
        if (extraCharts) {
            const fk = `${prefix}-${key}`;
            for (const cfg of extraCharts) cfg.render.call(this, data, fk);
        }

        // Paper list + filter wiring
        renderPaperList(`${prefix}-${key}-papers`, data.papers, 50);
        this._attachSubSectionFilter(prefix, key, data, countEl);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SHARED HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    _yearBar(chartId, yearDist) {
        const chart = this._get(chartId);
        if (!chart) return;
        const years = Object.keys(yearDist || {}).sort();
        chart.setOption({
            ...this._theme,
            grid: { left: 40, right: 20, top: 10, bottom: 30 },
            xAxis: { type: 'category', data: years, axisLabel: { color: this._tc.textSec, fontSize: 10 } },
            yAxis: { type: 'value', axisLabel: { color: this._tc.textSec }, splitLine: { lineStyle: { color: this._tc.bgPrimary } } },
            tooltip: { ...this._theme.tooltip, trigger: 'axis' },
            series: [{ type: 'bar', data: years.map(y => yearDist[y]), itemStyle: { color: this._palette.accent, borderRadius: [4,4,0,0] } }],
        }, true);
    },

    /**
     * Unified sub-section filter handler — replaces 8 near-identical click-handler blocks
     * with a loop over chart bindings + a dimension→filter-function lookup map.
     */
    _attachSubSectionFilter(prefix, key, data, countEl) {
        const headerH3 = countEl ? countEl.parentElement.querySelector('h3') : null;
        const baseTitle = headerH3 ? headerH3.textContent : '';
        const filterKey = `${prefix}-${key}`;
        const listHeaderEl = document.getElementById(`${prefix}-${key}-list-header`);
        const listH3 = listHeaderEl ? listHeaderEl.querySelector('h3') : null;
        const listCountEl = listHeaderEl ? listHeaderEl.querySelector('.badge') : null;

        // Resolve embedded paper → full paper from main array
        const _r = (sp) => DATA._paperByFn[sp.fn] || sp;

        // Dimension → filter function map
        const filterFns = {
            year: (sp, val) => _r(sp).y === +val,
            model: (sp, val) => (_r(sp).lm || []).includes(val),
            researchType: (sp, val) => val === 'Benchmark / Evaluation' ? _r(sp).ib === 1 : !_r(sp).ib,
            venueType: (sp, val) => _r(sp).vt === val,
            region: (sp, val) => (_r(sp).rg || []).includes(val),
            subTheory: (sp, val) => (sp.st || []).includes(val),
            concept: (sp, val) => (sp.kw || []).includes(val),
            fns: (sp, _val, f) => f._fnSet.has(sp.fn),
        };

        const applyFilter = () => {
            const f = this._subFilter[filterKey];
            let filtered;
            if (!f) {
                filtered = data.papers;
                if (headerH3) headerH3.textContent = baseTitle;
            } else {
                if (f.dim === 'fns') f._fnSet = new Set(f.fns);
                const fn = filterFns[f.dim];
                filtered = fn ? data.papers.filter(sp => fn(sp, f.val, f)) : data.papers;
                if (headerH3) headerH3.textContent = `${baseTitle} \u2014 ${f.val}`;
            }
            if (countEl) countEl.textContent = filtered.length;
            if (listH3) listH3.textContent = headerH3 ? headerH3.textContent : baseTitle;
            if (listCountEl) listCountEl.textContent = filtered.length;
            renderPaperList(`${prefix}-${key}-papers`, filtered, 50);
        };
        this._applyFns[filterKey] = applyFilter;

        // Chart bindings: [chartSuffix, dim, condition?]
        const bindings = [
            ['year', 'year'],
            ['models', 'model'],
            ['split', 'researchType', !!data.theoryVsEmpirical],
            ['venue', 'venueType', !!data.venueTypeDist],
            ['regions', 'region', !!(data.regionDist && data.regionDist.length)],
            ['paradigm', 'subTheory', !!data.subTheories],
            ['virtues', 'concept'],
            ['concepts', 'concept'],
        ];
        for (const [suffix, dim, condition] of bindings) {
            if (condition === false) continue;
            const chart = this._get(`chart-${prefix}-${key}-${suffix}`);
            if (!chart) continue;
            chart.off('click');
            chart.on('click', params => {
                if (!params.name) return;
                const cur = this._subFilter[filterKey];
                if (cur && cur.dim === dim && cur.val === params.name) delete this._subFilter[filterKey];
                else this._subFilter[filterKey] = { dim, val: params.name };
                applyFilter();
            });
        }
    },

    /**
     * Attach filter wiring for Models & LLMs sub-tabs.
     * Like _attachSubSectionFilter but for non-standard chart IDs.
     * @param {string} filterKey - unique key for _subFilter (e.g., 'models-ov')
     * @param {Array} basePapers - full paper objects to filter from
     * @param {Array} bindings - [{chartId, dim, filterFn, resolveName?}]
     */
    _attachModelFilter(filterKey, basePapers, bindings) {
        const listHeaderEl = document.getElementById(`${filterKey}-list-header`);
        const listH3 = listHeaderEl ? listHeaderEl.querySelector('h3') : null;
        const listCountEl = listHeaderEl ? listHeaderEl.querySelector('.badge') : null;
        const baseTitle = listH3 ? listH3.textContent : '';
        const containerId = `${filterKey}-papers`;

        // Initial render
        if (listCountEl) listCountEl.textContent = basePapers.length;
        renderPaperList(containerId, basePapers, 50);

        const applyFilter = () => {
            const f = this._subFilter[filterKey];
            let filtered;
            if (!f) {
                filtered = basePapers;
                if (listH3) listH3.textContent = baseTitle;
            } else {
                filtered = basePapers.filter(p => f.filterFn(p, f.val));
                if (listH3) listH3.textContent = `${baseTitle} \u2014 ${f.val}`;
            }
            if (listCountEl) listCountEl.textContent = filtered.length;
            renderPaperList(containerId, filtered, 50);
        };
        this._applyFns[filterKey] = applyFilter;

        // Wire click handlers on each chart
        for (const b of bindings) {
            const chart = this._get(b.chartId);
            if (!chart) continue;
            chart.off('click');
            chart.on('click', params => {
                const name = b.resolveName ? b.resolveName(params) : (params.name || null);
                if (!name) return;
                const cur = this._subFilter[filterKey];
                if (cur && cur.dim === b.dim && cur.val === name) {
                    delete this._subFilter[filterKey];
                } else {
                    this._subFilter[filterKey] = { dim: b.dim, val: name, filterFn: b.filterFn };
                }
                applyFilter();
            });
        }
    },

    _attachExtFnFilter(filterKey, chartId, resolve) {
        const chart = this._get(chartId);
        if (!chart) return;
        chart.off('click');
        chart.on('click', params => {
            const r = resolve(params);
            if (!r || !r.fns || !r.fns.length) return;
            const cur = this._subFilter[filterKey];
            if (cur && cur.dim === 'fns' && cur.val === r.label) delete this._subFilter[filterKey];
            else this._subFilter[filterKey] = { dim: 'fns', val: r.label, fns: r.fns };
            if (this._applyFns[filterKey]) this._applyFns[filterKey]();
        });
    },

    // ═══════════════════════════════════════════════════════════════════════
    // v7: CHART EXPORT (Step 8)
    // ═══════════════════════════════════════════════════════════════════════

    _injectExportBtn(el, chart, title) {
        const card = el.closest('.chart-card');
        if (!card || card.querySelector('.chart-export-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'chart-export-btn';
        btn.title = 'Export as PNG';
        btn.textContent = '\u2913'; // ⤓
        btn.setAttribute('aria-label', 'Export ' + title + ' as PNG');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#1e293b' });
            const a = document.createElement('a');
            a.href = url;
            a.download = (title || 'chart').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase() + '.png';
            a.click();
        });
        card.appendChild(btn);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // v7: TAB — INTERSECTIONS (Cross-Dimensional Analysis)
    // ═══════════════════════════════════════════════════════════════════════

    _initIntersections() {
        const papers = DATA.papers;

        // Helper: get top N items from a frequency map
        const topN = (map, n) => Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0, n).map(e => e[0]);

        // === 1. Model x Ethical Framework ===
        const modelCounts = {};
        papers.forEach(p => (p.lm || []).forEach(m => { modelCounts[m] = (modelCounts[m] || 0) + 1; }));
        const topModels = topN(modelCounts, 15);
        const fwCols = ['VE', 'DE', 'CU', 'Ethics (General)', 'No Ethics'];
        const mfMatrix = topModels.map(m => {
            const mPapers = papers.filter(p => p.lm && p.lm.includes(m));
            return [
                mPapers.filter(p => p.ve).length,
                mPapers.filter(p => p.de).length,
                mPapers.filter(p => p.ue).length,
                mPapers.filter(p => p.eo && !p.ve && !p.de && !p.ue).length,
                mPapers.filter(p => !p.eo).length,
            ];
        });
        this._heatmap('chart-ix-model-ethics', {
            xLabels: fwCols, yLabels: topModels, matrix: mfMatrix,
            grid: { left: 130, right: 60, top: 10, bottom: 40 },
            yFontSize: 10, yLabelWidth: 120, vmColor: this._palette.accent,
            tooltipFmt: p => `${topModels[p.value[1]]} + ${fwCols[p.value[0]]}: ${p.value[2] === '-' ? 0 : p.value[2]}`,
            onClick: params => {
                if (params.value[2] === '-' || params.value[2] === 0) return;
                const model = topModels[params.value[1]];
                const fwIdx = params.value[0];
                const filtered = papers.filter(p => {
                    if (!p.lm || !p.lm.includes(model)) return false;
                    if (fwIdx === 0) return p.ve;
                    if (fwIdx === 1) return p.de;
                    if (fwIdx === 2) return p.ue;
                    if (fwIdx === 3) return p.eo && !p.ve && !p.de && !p.ue;
                    return !p.eo;
                });
                this._showIxDrilldown(`${model} + ${fwCols[fwIdx]}`, filtered);
            },
        });

        // === 2. Model x Culture/Region ===
        const regionMap = {};
        papers.forEach(p => (p.cu || []).forEach(c => {
            regionMap[c] = (regionMap[c] || 0) + 1;
        }));
        const topRegions = topN(regionMap, 10);
        const mcMatrix = topModels.map(m => {
            const mPapers = papers.filter(p => p.lm && p.lm.includes(m));
            return topRegions.map(r => mPapers.filter(p => p.cu && p.cu.includes(r)).length);
        });
        this._heatmap('chart-ix-model-culture', {
            xLabels: topRegions, yLabels: topModels, matrix: mcMatrix,
            grid: { left: 130, right: 60, top: 10, bottom: 80 },
            xRotate: 30, xFontSize: 9, yFontSize: 10, yLabelWidth: 120,
            vmColor: this._palette.pink,
            tooltipFmt: p => `${topModels[p.value[1]]} + ${topRegions[p.value[0]]}: ${p.value[2] === '-' ? 0 : p.value[2]}`,
            onClick: params => {
                if (params.value[2] === '-' || params.value[2] === 0) return;
                const model = topModels[params.value[1]];
                const region = topRegions[params.value[0]];
                const filtered = papers.filter(p => p.lm && p.lm.includes(model) && p.cu && p.cu.includes(region));
                this._showIxDrilldown(`${model} + ${region}`, filtered);
            },
        });

        // === 3. Venue x Dimension ===
        const venueCounts = {};
        papers.forEach(p => { if (p.cc) venueCounts[p.cc] = (venueCounts[p.cc] || 0) + 1; });
        const topVenues = topN(venueCounts, 15);
        const dimCols = ['Ethics', 'Cultural', 'Religious', 'Moral Psych', 'Benchmark'];
        const vdMatrix = topVenues.map(v => {
            const vPapers = papers.filter(p => p.cc === v);
            return [
                vPapers.filter(p => p.eo).length,
                vPapers.filter(p => p.cu && p.cu.length).length,
                vPapers.filter(p => p.rv && p.rv.length).length,
                vPapers.filter(p => p.mp).length,
                vPapers.filter(p => p.ib).length,
            ];
        });
        this._heatmap('chart-ix-venue-dim', {
            xLabels: dimCols, yLabels: topVenues, matrix: vdMatrix,
            grid: { left: 160, right: 60, top: 10, bottom: 40 },
            yFontSize: 10, yLabelWidth: 150, vmColor: this._palette.teal,
            tooltipFmt: p => `${topVenues[p.value[1]]} + ${dimCols[p.value[0]]}: ${p.value[2] === '-' ? 0 : p.value[2]}`,
            onClick: params => {
                if (params.value[2] === '-' || params.value[2] === 0) return;
                const venue = topVenues[params.value[1]];
                const dimIdx = params.value[0];
                const filtered = papers.filter(p => {
                    if (p.cc !== venue) return false;
                    if (dimIdx === 0) return p.eo;
                    if (dimIdx === 1) return p.cu && p.cu.length;
                    if (dimIdx === 2) return p.rv && p.rv.length;
                    if (dimIdx === 3) return p.mp;
                    return p.ib;
                });
                this._showIxDrilldown(`${venue} + ${dimCols[dimIdx]}`, filtered);
            },
        });

        // === 4. Framework x Religion ===
        const fwRows = ['Virtue Ethics', 'Deontological', 'Consequentialism', 'MFT', 'Schwartz', 'Kohlberg', 'Trolley'];
        const relCols = ['Islamic', 'Christianity', 'Judaism', 'Buddhism', 'Hinduism', 'Confucian', 'Ubuntu', 'Indigenous', 'Shinto'];
        const frMatrix = fwRows.map(fw => {
            const fwPapers = papers.filter(p => {
                if (fw === 'Virtue Ethics') return p.ve;
                if (fw === 'Deontological') return p.de;
                if (fw === 'Consequentialism') return p.ue;
                if (fw === 'MFT') return p.mp && p.mp.includes('Moral Foundations');
                if (fw === 'Schwartz') return p.mp && p.mp.includes('Schwartz');
                if (fw === 'Kohlberg') return p.mp && (p.mp.includes('Kohlberg') || p.mp.includes('Reasoning'));
                if (fw === 'Trolley') return p.mp && (p.mp.includes('Trolley') || p.mp.includes('Dilemma'));
                return false;
            });
            return relCols.map(r => fwPapers.filter(p => p.rv && p.rv.some(rv => rv.toLowerCase().includes(r.toLowerCase()))).length);
        });
        this._heatmap('chart-ix-fw-religion', {
            xLabels: relCols, yLabels: fwRows, matrix: frMatrix,
            grid: { left: 130, right: 60, top: 10, bottom: 80 },
            xRotate: 30, xFontSize: 9, yFontSize: 10, yLabelWidth: 120,
            vmColor: this._palette.orange,
            tooltipFmt: p => `${fwRows[p.value[1]]} + ${relCols[p.value[0]]}: ${p.value[2] === '-' ? 0 : p.value[2]}`,
            onClick: params => {
                if (params.value[2] === '-' || params.value[2] === 0) return;
                const fw = fwRows[params.value[1]];
                const rel = relCols[params.value[0]];
                const filtered = papers.filter(p => {
                    const hasFw = (fw === 'Virtue Ethics' && p.ve) || (fw === 'Deontological' && p.de) || (fw === 'Consequentialism' && p.ue) ||
                                  (fw === 'MFT' && p.mp && p.mp.includes('Moral Foundations')) || (fw === 'Schwartz' && p.mp && p.mp.includes('Schwartz')) ||
                                  (fw === 'Kohlberg' && p.mp && (p.mp.includes('Kohlberg') || p.mp.includes('Reasoning'))) ||
                                  (fw === 'Trolley' && p.mp && (p.mp.includes('Trolley') || p.mp.includes('Dilemma')));
                    const hasRel = p.rv && p.rv.some(rv => rv.toLowerCase().includes(rel.toLowerCase()));
                    return hasFw && hasRel;
                });
                this._showIxDrilldown(`${fw} + ${rel}`, filtered);
            },
        });

        // Drilldown close handler
        const closeBtn = document.getElementById('ix-drilldown-close');
        if (closeBtn) closeBtn.addEventListener('click', () => {
            document.getElementById('ix-drilldown').style.display = 'none';
        });
    },

    _showIxDrilldown(title, papers) {
        const container = document.getElementById('ix-drilldown');
        if (!container) return;
        document.getElementById('ix-drilldown-title').textContent = `${title} \u2014 ${papers.length} paper${papers.length !== 1 ? 's' : ''}`;
        renderPaperList('ix-drilldown-papers', papers.map(p => ({ fn: p.fn })), 50);
        container.style.display = 'block';
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    // ═══════════════════════════════════════════════════════════════════════
    // v7: BENCHMARK DEEP-DIVE (Step 5) — extends _initTaxonomy
    // ═══════════════════════════════════════════════════════════════════════

    _initBenchmarks() {
        const papers = DATA.papers;
        const benchPapers = papers.filter(p => p.ib);
        const total = benchPapers.length;

        // KPIs
        const _s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
        _s('kpi-bench-total', total);
        _s('bench-total', total);
        _s('kpi-bench-ethics', benchPapers.filter(p => p.eo).length);
        _s('kpi-bench-cultural', benchPapers.filter(p => p.cu && p.cu.length).length);
        _s('kpi-bench-religious', benchPapers.filter(p => p.rv && p.rv.length).length);
        _s('bench-list-count', total);

        // Benchmark x Tradition heatmap
        const traditions = [...new Set(papers.flatMap(p => p.rv || []))].sort();
        const topTrad = traditions.slice(0, 12);
        const benchYN = ['Benchmark', 'Non-Benchmark'];
        const btMatrix = benchYN.map(yn => {
            const subset = yn === 'Benchmark' ? benchPapers : papers.filter(p => !p.ib);
            return topTrad.map(t => subset.filter(p => p.rv && p.rv.includes(t)).length);
        });
        this._heatmap('chart-bench-tradition', {
            xLabels: topTrad, yLabels: benchYN, matrix: btMatrix,
            grid: { left: 120, right: 60, top: 10, bottom: 80 },
            xRotate: 30, xFontSize: 9, vmColor: this._palette.yellow,
        });

        // Benchmark language coverage
        const langCounts = {};
        benchPapers.forEach(p => (p.ln || []).forEach(l => { langCounts[l] = (langCounts[l] || 0) + 1; }));
        const langItems = Object.entries(langCounts).sort((a,b) => b[1] - a[1]).slice(0, 20).map(([n, c]) => ({ n, c }));
        this._horizontalBar('chart-bench-lang', langItems, { maxItems: 20, gridLeft: 120, color: this._palette.cyan });

        // Benchmark timeline
        const yearCount = {};
        benchPapers.forEach(p => { if (p.y > 0) yearCount[p.y] = (yearCount[p.y] || 0) + 1; });
        const years = Object.keys(yearCount).sort();
        this._stackedTimeline('chart-bench-timeline', {
            years,
            series: [{ name: 'Benchmarks', type: 'bar', data: years.map(y => yearCount[y]), color: this._palette.yellow, smooth: false }],
        });

        // Benchmark venue type donut
        const vtCount = {};
        benchPapers.forEach(p => { vtCount[p.vt] = (vtCount[p.vt] || 0) + 1; });
        const vtData = Object.entries(vtCount).map(([n, v]) => ({ name: n, value: v, itemStyle: { color: this._vtColors[n] || this._palette.slate } }));
        this._donut('chart-bench-venue', vtData);

        // Paper list
        renderPaperList('bench-papers', benchPapers.map(p => ({ fn: p.fn })), 50);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // v7: MODEL DEPTH ANALYSIS (Step 4) — extends _initModels
    // ═══════════════════════════════════════════════════════════════════════

    _initModelDepth() {
        const papers = DATA.papers;

        // Model x Ethical Framework heatmap (like intersection but with more detail)
        const modelCounts = {};
        papers.forEach(p => (p.lm || []).forEach(m => { modelCounts[m] = (modelCounts[m] || 0) + 1; }));
        const topModels = Object.entries(modelCounts).sort((a,b) => b[1] - a[1]).slice(0, 15).map(e => e[0]);
        const fwCols = ['VE', 'DE', 'CU', 'MFT', 'Schwartz', 'Kohlberg', 'Trolley'];
        const mdMatrix = topModels.map(m => {
            const mPapers = papers.filter(p => p.lm && p.lm.includes(m));
            return [
                mPapers.filter(p => p.ve).length,
                mPapers.filter(p => p.de).length,
                mPapers.filter(p => p.ue).length,
                mPapers.filter(p => p.mp && p.mp.includes('Moral Foundations')).length,
                mPapers.filter(p => p.mp && p.mp.includes('Schwartz')).length,
                mPapers.filter(p => p.mp && (p.mp.includes('Kohlberg') || p.mp.includes('Reasoning'))).length,
                mPapers.filter(p => p.mp && (p.mp.includes('Trolley') || p.mp.includes('Dilemma'))).length,
            ];
        });
        this._heatmap('chart-md-model-fw', {
            xLabels: fwCols, yLabels: topModels, matrix: mdMatrix,
            grid: { left: 130, right: 60, top: 10, bottom: 40 },
            yFontSize: 10, yLabelWidth: 120, vmColor: this._palette.violet,
            tooltipFmt: p => `${topModels[p.value[1]]} + ${fwCols[p.value[0]]}: ${p.value[2] === '-' ? 0 : p.value[2]}`,
        });

        // Model cultural exposure bar — distinct cultures per model
        const cultureCounts = topModels.map(m => {
            const cultures = new Set();
            papers.forEach(p => {
                if (p.lm && p.lm.includes(m) && p.cu) p.cu.forEach(c => cultures.add(c));
            });
            return { n: m, c: cultures.size };
        }).sort((a, b) => b.c - a.c);
        this._horizontalBar('chart-md-model-culture', cultureCounts, { maxItems: 15, gridLeft: 130, labelWidth: 120, color: this._palette.pink });

        // Open vs. Closed source donut — mutually exclusive paper partition
        const LM_LICENSE = {
            'Llama': 'open', 'Mistral/Mixtral': 'open', 'Falcon': 'open', 'BLOOM': 'open',
            'Vicuna': 'open', 'Alpaca': 'open', 'Qwen': 'open', 'ChatGLM': 'open',
            'Baichuan': 'open', 'DeepSeek': 'open', 'Yi': 'open', 'Gemma': 'open',
            'Phi': 'open', 'Zephyr': 'open', 'StableLM': 'open', 'MPT': 'open',
            'WizardLM': 'open', 'OLMo': 'open',
            'GPT-4': 'closed', 'GPT-3.5': 'closed', 'GPT-3': 'closed', 'Claude': 'closed',
            'Gemini': 'closed', 'PaLM': 'closed', 'Cohere': 'closed',
        };
        let openOnly = 0, closedOnly = 0, bothOC = 0, otherLic = 0;
        const depthWithLm = papers.filter(p => p.lm && p.lm.length);
        depthWithLm.forEach(p => {
            let hasOpen = false, hasClosed = false;
            for (const m of p.lm) {
                const lic = LM_LICENSE[m];
                if (lic === 'open') hasOpen = true;
                else if (lic === 'closed') hasClosed = true;
            }
            if (hasOpen && hasClosed) bothOC++;
            else if (hasOpen) openOnly++;
            else if (hasClosed) closedOnly++;
            else otherLic++;
        });
        this._donut('chart-md-open-closed', [
            { name: 'Open Source Only', value: openOnly, itemStyle: { color: this._palette.green } },
            { name: 'Closed Source Only', value: closedOnly, itemStyle: { color: this._palette.red } },
            { name: 'Both Open & Closed', value: bothOC, itemStyle: { color: this._palette.yellow } },
            { name: 'Other/Unknown', value: otherLic, itemStyle: { color: this._palette.slate } },
        ]);

        // Model coverage breadth — frameworks tested per model
        const breadthData = topModels.map(m => {
            const mPapers = papers.filter(p => p.lm && p.lm.includes(m));
            let dims = 0;
            if (mPapers.some(p => p.ve)) dims++;
            if (mPapers.some(p => p.de)) dims++;
            if (mPapers.some(p => p.ue)) dims++;
            if (mPapers.some(p => p.mp)) dims++;
            if (mPapers.some(p => p.rv && p.rv.length)) dims++;
            if (mPapers.some(p => p.cu && p.cu.length)) dims++;
            return { n: m, c: dims };
        }).sort((a, b) => b.c - a.c);
        this._horizontalBar('chart-md-breadth', breadthData, {
            maxItems: 15, gridLeft: 130, labelWidth: 120, color: this._palette.accent,
            tooltipFmt: p => `${p[0].name}: ${p[0].value} dimensions tested`,
        });

        // --- Paper list + click-to-filter (Model Depth) ---
        const depthPapers = papers.filter(p => p.lm && p.lm.length);

        this._attachModelFilter('models-depth', depthPapers, [
            {
                chartId: 'chart-md-model-fw',
                dim: 'model\u00d7fw',
                resolveName: (params) => {
                    const rowIdx = params.value[1];
                    const colIdx = params.value[0];
                    return `${topModels[rowIdx]} + ${fwCols[colIdx]}`;
                },
                filterFn: (p, val) => {
                    const [model, fw] = val.split(' + ');
                    if (!(p.lm || []).includes(model)) return false;
                    if (fw === 'VE') return !!p.ve;
                    if (fw === 'DE') return !!p.de;
                    if (fw === 'CU') return !!p.ue;
                    if (fw === 'MFT') return p.mp && p.mp.includes('Moral Foundations');
                    if (fw === 'Schwartz') return p.mp && p.mp.includes('Schwartz');
                    if (fw === 'Kohlberg') return p.mp && (p.mp.includes('Kohlberg') || p.mp.includes('Reasoning'));
                    if (fw === 'Trolley') return p.mp && (p.mp.includes('Trolley') || p.mp.includes('Dilemma'));
                    return false;
                },
            },
            {
                chartId: 'chart-md-model-culture',
                dim: 'model',
                filterFn: (p, val) => (p.lm || []).includes(val) && p.cu && p.cu.length > 0,
            },
            {
                chartId: 'chart-md-open-closed',
                dim: 'license',
                filterFn: (p, val) => {
                    let hasOpen = false, hasClosed = false;
                    for (const m of (p.lm || [])) {
                        const lic = LM_LICENSE[m];
                        if (lic === 'open') hasOpen = true;
                        else if (lic === 'closed') hasClosed = true;
                    }
                    if (val === 'Open Source Only') return hasOpen && !hasClosed;
                    if (val === 'Closed Source Only') return hasClosed && !hasOpen;
                    if (val === 'Both Open & Closed') return hasOpen && hasClosed;
                    return !hasOpen && !hasClosed; // Other/Unknown
                },
            },
            {
                chartId: 'chart-md-breadth',
                dim: 'model',
                filterFn: (p, val) => (p.lm || []).includes(val),
            },
        ]);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // v7b: AUTHORS & COLLABORATION TAB
    // ═══════════════════════════════════════════════════════════════════════

    _initAuthors() {
        const A = DATA.authors;
        if (!A) { console.warn('[Charts] No authors data in DATA'); return; }
        const ov = A.overview;
        const pr = A.prolific;
        const co = A.collab;
        const dv = A.diversity;
        const qu = A.quality;
        const fmt = n => typeof n === 'number' ? n.toLocaleString() : n;

        // ── Sub-tab 1: Overview KPIs ─────────────────────────────────────
        const _s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
        _s('kpi-auth-unique', ov.uniqueAuthors);
        _s('kpi-auth-median', ov.medianTeam);
        _s('kpi-auth-solo', ov.singleAuthor);
        _s('kpi-auth-prolific3', ov.prolific3);
        _s('kpi-auth-profiles', ov.profileCount);

        // Team size distribution
        this._horizontalBar('chart-auth-team-dist', ov.teamDist, {
            color: this._palette.accent, gridLeft: 60, maxItems: 15,
        });

        // Lotka's Law (author productivity)
        this._horizontalBar('chart-auth-lotka', ov.lotka, {
            color: this._palette.green, gridLeft: 110, maxItems: 10,
        });

        // New vs Returning authors per year (stacked bar)
        this._stackedTimeline('chart-auth-new-year', {
            years: ov.years,
            series: [
                { name: 'New Authors', data: ov.newPerYear, color: this._palette.accent, type: 'bar', stack: 'auth' },
                { name: 'Returning', data: ov.returningPerYear, color: this._palette.slate, type: 'bar', stack: 'auth' },
            ],
        });

        // Median team size over time (line)
        this._stackedTimeline('chart-auth-team-time', {
            years: ov.years,
            series: [
                { name: 'Median Team Size', data: ov.medianTeamByYear, color: this._palette.teal, smooth: true },
            ],
        });

        // ── Sub-tab 2: Key Voices ────────────────────────────────────────
        // Top 30 — stacked horizontal bar (first / last / middle)
        const top30Chart = this._get('chart-auth-top30');
        if (top30Chart && pr.top30 && pr.top30.length) {
            const names = pr.top30.map(d => d.n).reverse();
            top30Chart.setOption({
                ...this._theme,
                grid: { left: 180, right: 30, top: 30, bottom: 20 },
                legend: { ...this._theme.legend, top: 0, data: ['First Author', 'Last Author', 'Middle'] },
                xAxis: { type: 'value', axisLabel: { color: this._tc.textSec }, splitLine: { lineStyle: { color: this._tc.bgPrimary } } },
                yAxis: { type: 'category', data: names, axisLabel: { color: this._tc.textSec, fontSize: 10, width: 170, overflow: 'truncate' } },
                tooltip: { ...this._theme.tooltip, trigger: 'axis' },
                series: [
                    { name: 'First Author', type: 'bar', stack: 'pos', data: pr.top30.map(d => d.first).reverse(), itemStyle: { color: this._palette.accent } },
                    { name: 'Last Author', type: 'bar', stack: 'pos', data: pr.top30.map(d => d.last).reverse(), itemStyle: { color: this._palette.green } },
                    { name: 'Middle', type: 'bar', stack: 'pos', data: pr.top30.map(d => d.mid).reverse(), itemStyle: { color: this._palette.slate } },
                ],
            }, true);

            // Click handler: show papers by selected author
            top30Chart.off('click');
            top30Chart.on('click', params => {
                if (!params.name) return;
                const authorName = params.name;
                // Extract surname: "Last, First" → "Last", "First Last" → "Last"
                const surname = authorName.includes(',')
                    ? authorName.split(',')[0].trim()
                    : authorName.split(/\s+/).pop();
                // Toggle behavior
                const fk = 'auth-top30';
                const cur = this._subFilter[fk];
                if (cur && cur.val === authorName) {
                    delete this._subFilter[fk];
                    renderPaperList('auth-top30-papers', [], 50);
                    const hdr = document.getElementById('auth-top30-list-header');
                    if (hdr) { hdr.querySelector('h3').textContent = 'Author Papers'; hdr.querySelector('.badge').textContent = '0'; }
                    return;
                }
                // Filter papers by surname in fa or la
                const filtered = DATA.papers
                    .filter(p => (p.fa && p.fa.includes(surname)) || (p.la && p.la.includes(surname)))
                    .map(p => ({ fn: p.fn }));
                this._subFilter[fk] = { val: authorName };
                renderPaperList('auth-top30-papers', filtered, 50);
                const hdr = document.getElementById('auth-top30-list-header');
                if (hdr) { hdr.querySelector('h3').textContent = `Papers by ${authorName}`; hdr.querySelector('.badge').textContent = filtered.length; }
                // Scroll to paper list
                const el = document.getElementById('auth-top30-papers');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        // Radar — top 10 authors × 6 dimensions
        if (pr.radarData && pr.radarData.length) {
            const maxVals = pr.radarDimLabels.map((_, di) =>
                Math.max(...pr.radarData.map(r => r.values[di]), 1));
            this._radar('chart-auth-radar', {
                indicators: pr.radarDimLabels.map((name, i) => ({ name, max: maxVals[i] })),
                series: pr.radarData.slice(0, 5).map((r, i) => ({
                    name: r.name,
                    values: r.values,
                    color: this._colors[i % this._colors.length],
                })),
            });
        }

        // Heatmap — top 15 × years
        if (pr.hmMatrix && pr.hmMatrix.length) {
            this._heatmap('chart-auth-heatmap', {
                xLabels: pr.hmYears,
                yLabels: pr.hmAuthors,
                matrix: pr.hmMatrix,
                yInverse: true,
                yFontSize: 9,
                yLabelWidth: 140,
                grid: { left: 150, right: 60, top: 10, bottom: 40 },
                vmColor: this._palette.accent,
            });
        }

        // ── Sub-tab 3: Collaboration ─────────────────────────────────────
        // Co-author pairs
        if (co.coauthorPairs && co.coauthorPairs.length) {
            const pairItems = co.coauthorPairs.map(p => ({
                n: p.a + ' ↔ ' + p.b,
                c: p.c,
            }));
            this._horizontalBar('chart-auth-pairs', pairItems, {
                gridLeft: 280, labelWidth: 270, fontSize: 10,
                color: this._palette.pink, maxItems: 20,
            });
        }

        // Team composition donut
        if (co.teamComp) {
            this._donut('chart-auth-team-comp', co.teamComp.map((d, i) => ({
                name: d.name, value: d.value,
                itemStyle: { color: [this._palette.slate, this._palette.accent, this._palette.green, this._palette.yellow, this._palette.pink][i] || this._palette.slate },
            })), { useColors: false });
        }

        // Force-directed network graph with color-mode selector
        const netChart = this._get('chart-auth-network');
        if (netChart && co.networkNodes && co.networkNodes.length) {
            // ── Color maps ──
            const dimColors = {
                ethics: this._palette.accent, benchmark: this._palette.yellow,
                cultural: this._palette.pink, moral_psych: this._palette.cyan,
                religious: this._palette.orange, llm: this._palette.green,
            };
            const dimLabels = {
                ethics: 'Ethics', benchmark: 'Benchmark', cultural: 'Cultural',
                moral_psych: 'Moral Psych', religious: 'Religious', llm: 'LLM',
            };
            const roleColors = {
                first: this._palette.green, last: this._palette.yellow, middle: this._palette.slate,
            };
            const roleLabels = { first: 'First Author', last: 'Last Author', middle: 'Middle' };
            const vtColors = this._vtColors;
            const slate = this._palette.slate;
            const accent = this._palette.accent;

            // Precompute max coauthors for normalization
            const maxCoauthors = Math.max(...co.networkNodes.map(n => n.coauthors || 0), 1);

            // Hex color interpolation helper
            function hexToRgb(hex) {
                const v = parseInt(hex.slice(1), 16);
                return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
            }
            function rgbToHex(r, g, b) {
                return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            }
            function lerpColor(t, colors) {
                t = Math.max(0, Math.min(1, t));
                if (colors.length === 2) {
                    const [r1, g1, b1] = hexToRgb(colors[0]);
                    const [r2, g2, b2] = hexToRgb(colors[1]);
                    return rgbToHex(
                        Math.round(r1 + (r2 - r1) * t),
                        Math.round(g1 + (g2 - g1) * t),
                        Math.round(b1 + (b2 - b1) * t)
                    );
                }
                // 3 colors: first half maps [0, 0.5] → colors[0..1], second half → colors[1..2]
                if (t <= 0.5) {
                    return lerpColor(t * 2, [colors[0], colors[1]]);
                }
                return lerpColor((t - 0.5) * 2, [colors[1], colors[2]]);
            }

            // ── Color resolver ──
            function resolveColor(node, mode) {
                if (mode === 'dimension') return dimColors[node.dim] || slate;
                if (mode === 'role')      return roleColors[node.role] || slate;
                if (mode === 'venue')     return vtColors[node.vt] || slate;
                if (mode === 'era') {
                    const t = (node.avgY - 2016) / 8;  // 2016→0, 2024→1
                    return lerpColor(t, ['#6366f1', '#22d3ee', '#f59e0b']);
                }
                if (mode === 'collab') {
                    const t = (node.coauthors || 0) / maxCoauthors;
                    return lerpColor(t, ['#64748b', '#6366f1']);
                }
                return accent;
            }

            // ── Tooltip formatter by mode ──
            const self = this;
            function tooltipFormatter(mode) {
                return function(p) {
                    if (p.dataType === 'edge') {
                        return p.data.source + ' \u2194 ' + p.data.target + ': ' + p.data.value + ' papers';
                    }
                    const n = p.data;
                    let detail = '';
                    if (mode === 'dimension') detail = ' (' + (dimLabels[n.dim] || 'N/A') + ')';
                    else if (mode === 'role')  detail = ' (' + (roleLabels[n.role] || 'N/A') + ': ' + (n.roleCt || '') + ')';
                    else if (mode === 'venue') detail = ' (' + (n.vt || 'N/A') + ')';
                    else if (mode === 'era')   detail = ' (avg. ' + (n.avgY || '?') + ')';
                    else if (mode === 'collab') detail = ' (' + (n.coauthors || 0) + ' co-authors)';
                    return n.name + ': ' + n.value + ' papers' + detail;
                };
            }

            // ── Build legend/visualMap by mode ──
            function buildLegend(mode) {
                if (mode === 'dimension') {
                    return {
                        legend: {
                            ...self._theme.legend, show: true, bottom: 0, left: 'center',
                            data: Object.values(dimLabels),
                            textStyle: { ...self._theme.legend.textStyle, fontSize: 10 },
                        },
                        visualMap: undefined,
                    };
                }
                if (mode === 'role') {
                    return {
                        legend: {
                            ...self._theme.legend, show: true, bottom: 0, left: 'center',
                            data: Object.values(roleLabels),
                            textStyle: { ...self._theme.legend.textStyle, fontSize: 10 },
                        },
                        visualMap: undefined,
                    };
                }
                if (mode === 'venue') {
                    const vtNames = [...new Set(co.networkNodes.map(n => n.vt))].filter(Boolean);
                    return {
                        legend: {
                            ...self._theme.legend, show: true, bottom: 0, left: 'center',
                            data: vtNames,
                            textStyle: { ...self._theme.legend.textStyle, fontSize: 10 },
                        },
                        visualMap: undefined,
                    };
                }
                if (mode === 'era') {
                    return { legend: { show: false }, visualMap: undefined };
                }
                if (mode === 'collab') {
                    return { legend: { show: false }, visualMap: undefined };
                }
                return { legend: { show: false }, visualMap: undefined };
            }

            // ── Build category legend items for categorical modes ──
            function buildCategories(mode) {
                if (mode === 'dimension') {
                    return Object.entries(dimLabels).map(([k, label]) => ({
                        name: label, itemStyle: { color: dimColors[k] },
                    }));
                }
                if (mode === 'role') {
                    return Object.entries(roleLabels).map(([k, label]) => ({
                        name: label, itemStyle: { color: roleColors[k] },
                    }));
                }
                if (mode === 'venue') {
                    const vtNames = [...new Set(co.networkNodes.map(n => n.vt))].filter(Boolean);
                    return vtNames.map(vt => ({
                        name: vt, itemStyle: { color: vtColors[vt] || slate },
                    }));
                }
                return [];
            }

            // Category label resolver (maps node field to legend name)
            function categoryName(node, mode) {
                if (mode === 'dimension') return dimLabels[node.dim] || 'N/A';
                if (mode === 'role')      return roleLabels[node.role] || 'N/A';
                if (mode === 'venue')     return node.vt || 'N/A';
                return undefined;
            }

            // Precompute edges (static across mode switches)
            const edgesData = co.networkEdges.map(e => ({
                source: e.source, target: e.target, value: e.value,
                lineStyle: {
                    width: Math.min(1 + e.value, 6),
                    color: this._palette.slate, opacity: 0.5,
                },
            }));

            // ── Render function ──
            let currentMode = 'dimension';
            let isFirstRender = true;
            const renderNetwork = (mode) => {
                currentMode = mode;
                const cats = buildCategories(mode);
                const hasCats = cats.length > 0;
                const legendVis = buildLegend(mode);

                // Build name→index map for category lookup
                const catIndex = {};
                cats.forEach((c, i) => { catIndex[c.name] = i; });

                const nodeData = co.networkNodes.map(n => {
                    const base = {
                        name: n.name, value: n.value, symbolSize: n.symbolSize,
                        dim: n.dim, role: n.role, vt: n.vt, avgY: n.avgY, coauthors: n.coauthors,
                        itemStyle: { color: resolveColor(n, mode) },
                        label: {
                            show: n.symbolSize >= 15, position: 'right',
                            fontSize: 9, color: self._tc.textSec,
                        },
                    };
                    if (hasCats) {
                        const catName = categoryName(n, mode);
                        base.category = catIndex[catName] !== undefined ? catIndex[catName] : 0;
                    }
                    return base;
                });

                const option = {
                    ...self._theme,
                    tooltip: { ...self._theme.tooltip, formatter: tooltipFormatter(mode) },
                    series: [{
                        type: 'graph', layout: 'force', roam: true, draggable: true,
                        force: { repulsion: 120, gravity: 0.1, edgeLength: [60, 200], layoutAnimation: true },
                        data: nodeData,
                        edges: edgesData,
                        categories: hasCats ? cats : undefined,
                        emphasis: {
                            focus: 'adjacency',
                            lineStyle: { width: 4, opacity: 1 },
                            label: { show: true, fontSize: 11 },
                        },
                    }],
                };
                // Merge legend/visualMap
                if (legendVis.legend) option.legend = legendVis.legend;
                if (legendVis.visualMap) {
                    option.visualMap = legendVis.visualMap;
                } else {
                    option.visualMap = { show: false };
                }
                netChart.setOption(option, isFirstRender);
                isFirstRender = false;

                // Drive HTML gradient legend for continuous modes
                const gradEl = document.getElementById('net-gradient-legend');
                if (gradEl) {
                    if (mode === 'era') {
                        gradEl.style.display = 'flex';
                        gradEl.innerHTML = '<span class="grad-label">2016</span>'
                            + '<div class="grad-bar" style="background:linear-gradient(to right,#6366f1,#22d3ee,#f59e0b)"></div>'
                            + '<span class="grad-label">2024</span>';
                    } else if (mode === 'collab') {
                        gradEl.style.display = 'flex';
                        gradEl.innerHTML = '<span class="grad-label">0</span>'
                            + '<div class="grad-bar" style="background:linear-gradient(to right,#64748b,#6366f1)"></div>'
                            + '<span class="grad-label">' + maxCoauthors + '</span>';
                    } else {
                        gradEl.style.display = 'none';
                    }
                }
            };

            // Initial render
            renderNetwork('dimension');

            // Wire button clicks
            const colorBar = document.getElementById('net-color-bar');
            if (colorBar) {
                colorBar.addEventListener('click', (e) => {
                    const btn = e.target.closest('.net-color-btn');
                    if (!btn) return;
                    colorBar.querySelectorAll('.net-color-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderNetwork(btn.dataset.color);
                });
            }
        }

        // Chord diagram using ECharts sankey (chord not built-in; sankey is close)
        // We'll render it as a circular graph layout instead
        const chordChart = this._get('chart-auth-chord');
        if (chordChart && co.chordNames && co.chordMatrix) {
            // Build circular graph from adjacency matrix
            const chordNodes = co.chordNames.map((name, i) => ({
                name,
                itemStyle: { color: this._colors[i % this._colors.length] },
                label: { show: true, fontSize: 9, color: this._tc.textSec },
            }));
            const chordEdges = [];
            for (let i = 0; i < co.chordMatrix.length; i++) {
                for (let j = i + 1; j < co.chordMatrix[i].length; j++) {
                    if (co.chordMatrix[i][j] > 0) {
                        chordEdges.push({
                            source: co.chordNames[i],
                            target: co.chordNames[j],
                            value: co.chordMatrix[i][j],
                            lineStyle: {
                                width: Math.min(1 + co.chordMatrix[i][j], 8),
                                color: this._colors[i % this._colors.length],
                                opacity: 0.4,
                            },
                        });
                    }
                }
            }
            chordChart.setOption({
                ...this._theme,
                tooltip: {
                    ...this._theme.tooltip,
                    formatter: function(p) {
                        if (p.dataType === 'edge') return p.data.source + ' ↔ ' + p.data.target + ': ' + p.data.value + ' co-authored';
                        return p.data.name;
                    },
                },
                series: [{
                    type: 'graph',
                    layout: 'circular',
                    circular: { rotateLabel: true },
                    roam: true,
                    data: chordNodes,
                    edges: chordEdges,
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: { width: 5, opacity: 1 },
                    },
                }],
            }, true);
        }

        // ── Sub-tab 4: Diversity & Representation ────────────────────────
        // AI Lab contributions
        if (dv.aiLabs && dv.aiLabs.length) {
            this._horizontalBar('chart-auth-labs', dv.aiLabs, {
                gridLeft: 170, labelWidth: 160, fontSize: 11,
                color: this._palette.orange, maxItems: 14,
            });
        }

        // Lorenz curve
        const lorenzChart = this._get('chart-auth-lorenz');
        if (lorenzChart && dv.lorenzX && dv.lorenzY) {
            lorenzChart.setOption({
                ...this._theme,
                grid: { left: 60, right: 30, top: 40, bottom: 50 },
                title: {
                    text: 'Gini = ' + dv.gini,
                    right: 20, top: 10,
                    textStyle: { color: this._tc.textSec, fontSize: 13, fontWeight: 'normal' },
                },
                xAxis: {
                    type: 'value', name: 'Cumulative % of Authors', nameLocation: 'center', nameGap: 30,
                    min: 0, max: 1,
                    axisLabel: { color: this._tc.textSec, formatter: v => Math.round(v * 100) + '%' },
                    splitLine: { lineStyle: { color: this._tc.bgPrimary } },
                },
                yAxis: {
                    type: 'value', name: 'Cumulative % of Papers', nameLocation: 'center', nameGap: 40,
                    min: 0, max: 1,
                    axisLabel: { color: this._tc.textSec, formatter: v => Math.round(v * 100) + '%' },
                    splitLine: { lineStyle: { color: this._tc.bgPrimary } },
                },
                tooltip: { ...this._theme.tooltip, trigger: 'axis' },
                series: [
                    {
                        name: 'Equality Line', type: 'line',
                        data: [[0, 0], [1, 1]],
                        lineStyle: { color: this._palette.slate, type: 'dashed', width: 1 },
                        symbol: 'none', silent: true,
                    },
                    {
                        name: 'Lorenz Curve', type: 'line',
                        data: dv.lorenzX.map((x, i) => [x, dv.lorenzY[i]]),
                        lineStyle: { color: this._palette.accent, width: 2 },
                        areaStyle: { color: this._palette.accent, opacity: 0.15 },
                        symbol: 'none', smooth: true,
                    },
                ],
            }, true);
        }

        // ── Sub-tab 5: Data Quality ──────────────────────────────────────
        _s('kpi-authq-total', qu.totalPapers);
        _s('kpi-authq-full', qu.hasFullAuthors);
        _s('kpi-authq-abbrev', qu.abbreviatedNames);
        _s('kpi-authq-profiles', qu.profileCount);
        _s('kpi-authq-enriched', qu.enrichedCount);

        // Completeness donut
        this._donut('chart-authq-completeness', [
            { name: 'Full Author List', value: qu.hasFullAuthors, itemStyle: { color: this._palette.green } },
            { name: 'Missing Authors', value: qu.missingAuthors, itemStyle: { color: this._palette.red } },
            { name: 'et al. Unresolved', value: Math.max(0, qu.etAlOriginal - qu.etAlResolved), itemStyle: { color: this._palette.yellow } },
        ]);

        // Profile enrichment donut
        this._donut('chart-authq-enrichment', [
            { name: 'Enriched Profiles', value: qu.enrichedCount, itemStyle: { color: this._palette.accent } },
            { name: 'Basic Profiles', value: qu.profileCount - qu.enrichedCount, itemStyle: { color: this._palette.slate } },
            { name: 'No Profile', value: Math.max(0, qu.uniqueAuthors - qu.profileCount), itemStyle: { color: this._palette.zinc } },
        ]);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // v7: TIMELINE ENHANCEMENTS (Step 3)
    // ═══════════════════════════════════════════════════════════════════════

    _timelineYoYLabels(chart, yearCount, years) {
        // Add YoY growth labels as markPoints
        if (!chart || years.length < 2) return;
        const markData = [];
        for (let i = 1; i < years.length; i++) {
            const prev = yearCount[years[i-1]] || 0;
            const cur = yearCount[years[i]] || 0;
            if (prev > 0) {
                const pct = Math.round((cur - prev) / prev * 100);
                if (Math.abs(pct) >= 10) {
                    markData.push({
                        xAxis: years[i], yAxis: cur,
                        value: (pct >= 0 ? '+' : '') + pct + '%',
                        symbol: 'none',
                        label: {
                            show: true, position: 'top', fontSize: 9,
                            color: pct >= 0 ? '#22c55e' : '#ef4444',
                            formatter: '{c}',
                        },
                    });
                }
            }
        }
        if (markData.length) {
            chart.setOption({
                series: [{ markPoint: { data: markData, silent: true } }],
            });
        }
    },

};

// Global resize handler (debounced 150ms)
let _resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => Charts.resizeAll(), 150);
});
