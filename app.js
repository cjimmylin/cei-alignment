/**
 * CEI Dashboard v9 — Application Logic (v6.1 Extensibility Refactor)
 * FilterState singleton, tab switching, Paper Explorer, filter bar rendering
 * Phase 1: FILTER_DIMS registry — single source of truth for all filterable dimensions.
 * Adding a new filter = 1 registry entry (~8 lines) + 1 HTML <div>.
 */

// ═══════════════════════════════════════════════════════════════════════════
// FILTER DIMENSION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Each entry declares: key, label, mselId (null if no dropdown),
 * options() (lazy, called after DATA loads), match(paper, value),
 * and optional parseValue(str).
 */
const FILTER_DIMS = [
    { key: 'year', label: 'Year', mselId: 'msel-year',
      options: () => [...new Set(DATA.papers.map(p => p.y).filter(Boolean))].sort((a,b) => b-a).map(y => ({value:y, label:String(y)})),
      match: (p, v) => p.y === v,
      parseValue: str => +str },
    { key: 'venueType', label: 'Venue Type', mselId: 'msel-venue-type',
      options: () => Object.keys(DATA.agg.vtDist || {}).map(n => ({value:n, label:n})),
      match: (p, v) => p.vt === v },
    { key: 'venue', label: 'Venue', mselId: null,
      match: (p, v) => p.cc === v },
    { key: 'confFamily', label: 'Family', mselId: null,
      match: (p, v) => p.cf === v },
    { key: 'ethics', label: 'Ethics', mselId: 'msel-ethics',
      options: () => [
          { value: 'Yes', label: 'Ethics: Yes' },
          { value: 'No', label: 'Ethics: No' },
          { value: 'VE', label: 'Virtue Ethics (VE)' },
          { value: 'DE', label: 'Deontological (DE)' },
          { value: 'CU', label: 'Consequentialist (CU)' },
          { value: 'CE', label: 'Care Ethics (CE)' },
          { value: 'CO', label: 'Contractarian (CO)' },
      ],
      match: (p, v) => {
          switch (v) {
              case 'Yes': return !!p.eo;
              case 'No': return !p.eo;
              case 'VE': return !!p.ve;
              case 'DE': return !!p.de;
              case 'CU': return !!p.ue;
              case 'CE': return !!p.ce;
              case 'CO': return !!p.co;
              default: return false;
          }
      }},
    { key: 'isBenchmark', label: 'Benchmark', mselId: null,
      match: (p, v) => {
          if (v === 'Yes') return !!p.ib;
          if (v === 'No') return !p.ib;
          return false;
      }},
    { key: 'culture', label: 'Culture', mselId: null,
      match: (p, v) => p.cu && p.cu.includes(v) },
    { key: 'language', label: 'Language', mselId: null,
      match: (p, v) => p.ln && p.ln.includes(v) },
    { key: 'religion', label: 'Religion', mselId: 'msel-religion',
      options: () => {
          const religions = [...new Set(DATA.papers.flatMap(p => p.rv || []))].sort();
          return [
              { value: 'Yes', label: 'Has Religion' },
              { value: 'No', label: 'No Religion' },
              ...religions.map(r => ({ value: r, label: r })),
          ];
      },
      match: (p, v) => {
          if (v === 'Yes') return !!(p.rv && p.rv.length);
          if (v === 'No') return !p.rv || !p.rv.length;
          return p.rv && p.rv.includes(v);
      }},
    { key: 'moralPsych', label: 'Moral Psych', mselId: 'msel-moral-psych',
      options: () => [
          { value: 'Yes', label: 'Has Framework' },
          { value: 'No', label: 'No Framework' },
          { value: 'MFT', label: 'MFT (Moral Foundations)' },
          { value: 'Schwartz', label: 'Schwartz Values' },
          { value: 'Reasoning', label: 'Reasoning (Kohlberg)' },
          { value: 'Dilemmas', label: 'Dilemmas (Trolley)' },
      ],
      match: (p, v) => {
          switch (v) {
              case 'Yes': return !!p.mp;
              case 'No': return !p.mp;
              case 'MFT': return p.mp && p.mp.includes('Moral Foundations');
              case 'Schwartz': return p.mp && p.mp.includes('Schwartz');
              case 'Reasoning': return p.mp && (p.mp.includes('Kohlberg') || p.mp.includes('Reasoning'));
              case 'Dilemmas': return p.mp && (p.mp.includes('Trolley') || p.mp.includes('Dilemma'));
              default: return false;
          }
      }},
    { key: 'llmModel', label: 'Model', mselId: 'msel-model',
      options: () => {
          const models = [...new Set(DATA.papers.flatMap(p => p.lm || []))].sort();
          return [
              { value: 'Yes', label: 'Has Models' },
              { value: 'No', label: 'No Models' },
              ...models.map(m => ({ value: m, label: m })),
          ];
      },
      match: (p, v) => {
          if (v === 'Yes') return !!(p.lm && p.lm.length);
          if (v === 'No') return !p.lm || !p.lm.length;
          return p.lm && p.lm.includes(v);
      }},
    { key: 'category', label: 'Category', mselId: 'msel-category',
      options: () => (DATA.agg.categories || []).map(c => ({ value: c, label: c })),
      match: (p, v) => p.cs && p.cs.includes(v) },
    { key: 'flag', label: 'Flag', mselId: 'msel-flag',
      options: () => [
          { value: 'B', label: 'Benchmark (B)' },
          { value: 'E', label: 'Eval (E)' },
          { value: 'D', label: 'Dataset (D)' },
          { value: 'C', label: 'Cultural (C)' },
          { value: 'R', label: 'Religious (R)' },
      ],
      match: (p, v) => {
          switch (v) {
              case 'B': return !!p.ib;
              case 'E': return !!p.ie;
              case 'D': return !!p.id;
              case 'C': return !!(p.cu && p.cu.length);
              case 'R': return !!(p.rv && p.rv.length);
              default: return false;
          }
      }},
];


// ═══════════════════════════════════════════════════════════════════════════
// FILTER STATE
// ═══════════════════════════════════════════════════════════════════════════

const FilterState = {
    _filters: Object.fromEntries(FILTER_DIMS.map(d => [d.key, new Set()])),
    searchQuery: '',
    _listeners: [],
    _papers: null,        // cached reference to DATA.papers
    _searchIndex: null,   // pre-built search text

    init(papers) {
        this._papers = papers;
        this._buildSearchIndex();
    },

    /** Build/rebuild search index. Includes detail fields if available. */
    _buildSearchIndex() {
        this._searchIndex = this._papers.map(p => {
            const d = (DATA._detail && DATA._detail[p.i]) || {};
            return [p.t, p.fa, p.la, p.cc, d.ab || p.ab || '', d.bn || p.bn || '', d.wm || p.wm || '',
                (p.cu||[]).join(' '), (p.ln||[]).join(' '),
                (p.rv||[]).join(' '), (p.lm||[]).join(' '),
                (p.cs||[]).join(' '), p.mp || ''
            ].join(' ').toLowerCase();
        });
    },

    _notifyPending: false,
    _crossCache: null,

    subscribe(fn) { this._listeners.push(fn); },

    notify() {
        if (this._notifyPending) return;
        this._notifyPending = true;
        this._crossCache = null; // invalidate cross-filter cache
        queueMicrotask(() => {
            this._notifyPending = false;
            const filtered = this.getFilteredPapers();
            this._listeners.forEach(fn => fn(filtered));
        });
    },

    /** Pre-computed cross-filtered results for all dimensions (used by MultiSelect) */
    getCrossFiltered(dim) {
        if (!this._crossCache) this._crossCache = {};
        if (!this._crossCache[dim]) this._crossCache[dim] = this.getFilteredPapers(dim);
        return this._crossCache[dim];
    },

    /** Accessor for filter Sets — use instead of direct _filters access */
    getFilters(dim) {
        return this._filters[dim];
    },

    toggle(dimension, value) {
        const set = this._filters[dimension];
        if (!set) return;
        if (set.has(value)) set.delete(value);
        else set.add(value);
        this.notify();
    },

    setSearch(query) {
        this.searchQuery = query.toLowerCase().trim();
        this.notify();
    },

    clear() {
        Object.values(this._filters).forEach(s => s.clear());
        this.searchQuery = '';
        this.notify();
    },

    clearDimension(dimension) {
        const set = this._filters[dimension];
        if (set) set.clear();
        this.notify();
    },

    isActive() {
        return this.searchQuery !== '' ||
            Object.values(this._filters).some(s => s.size > 0);
    },

    getActiveFilters() {
        const active = [];
        for (const [dim, set] of Object.entries(this._filters)) {
            for (const val of set) {
                active.push({ dim, val });
            }
        }
        return active;
    },

    /** Registry-driven filter: AND across dimensions, OR within each dimension */
    getFilteredPapers(excludeDim) {
        if (!this._papers) return [];
        let result = this._papers;
        for (const dim of FILTER_DIMS) {
            if (dim.key === excludeDim || !this._filters[dim.key].size) continue;
            const active = this._filters[dim.key];
            result = result.filter(p => {
                for (const v of active) { if (dim.match(p, v)) return true; }
                return false;
            });
        }
        if (this.searchQuery) {
            const q = this.searchQuery;
            result = result.filter(p => this._searchIndex[p.i].includes(q));
        }
        return result;
    }
};


// ═══════════════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════════════════

const TabManager = {
    _initialized: new Set(),

    init() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });
        // Keyboard navigation: ArrowLeft/Right, Home/End
        document.getElementById('tab-nav').addEventListener('keydown', (e) => {
            const tabs = [...document.querySelectorAll('.tab-btn')];
            const idx = tabs.indexOf(document.activeElement);
            if (idx === -1) return;
            let target = null;
            if (e.key === 'ArrowRight') target = tabs[(idx + 1) % tabs.length];
            else if (e.key === 'ArrowLeft') target = tabs[(idx - 1 + tabs.length) % tabs.length];
            else if (e.key === 'Home') target = tabs[0];
            else if (e.key === 'End') target = tabs[tabs.length - 1];
            if (target) { e.preventDefault(); target.focus(); this.switchTab(target.dataset.tab); }
        });
        // Sub-nav pills
        document.querySelectorAll('.sub-nav').forEach(nav => {
            nav.querySelectorAll('.sub-btn').forEach(btn => {
                btn.addEventListener('click', () => this.switchSub(nav, btn));
            });
        });
    },

    switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        const pane = document.getElementById(`pane-${tabId}`);
        if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
        if (pane) pane.classList.add('active');

        // Show preset bar only on Explorer tab
        const presetBar = document.getElementById('preset-bar');
        if (presetBar) presetBar.style.display = tabId === 'explorer' ? '' : 'none';

        // Lazy init charts for this tab
        if (!this._initialized.has(tabId) && typeof Charts !== 'undefined') {
            Charts.initTab(tabId);
            this._initialized.add(tabId);
        }
        // Resize charts in tab
        if (typeof Charts !== 'undefined') Charts.resizeAll();
        // Update URL state
        if (typeof URLState !== 'undefined') URLState._push();
    },

    switchSub(nav, btn) {
        const parent = nav.parentElement;
        nav.querySelectorAll('.sub-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        parent.querySelectorAll('.sub-pane').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`sub-${btn.dataset.sub}`);
        if (target) target.classList.add('active');
        if (typeof Charts !== 'undefined') Charts.resizeAll();
    },

    markInitialized(tabId) { this._initialized.add(tabId); }
};


// ═══════════════════════════════════════════════════════════════════════════
// THEME MANAGER
// ═══════════════════════════════════════════════════════════════════════════

const ThemeManager = {
    _key: 'cei-dashboard-theme',

    init() {
        const saved = localStorage.getItem(this._key);
        if (saved) document.body.setAttribute('data-theme', saved);
        this._updateIcon();
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggle());
    },

    toggle() {
        const current = document.body.getAttribute('data-theme');
        const next = current === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', next);
        localStorage.setItem(this._key, next);
        this._updateIcon();
        if (typeof Charts !== 'undefined') {
            Charts._resolveThemeColors();
            Charts.resizeAll();
        }
    },

    _updateIcon() {
        const btn = document.getElementById('theme-toggle');
        const isLight = document.body.getAttribute('data-theme') === 'light';
        btn.textContent = isLight ? '\u2600' : '\u263D'; // ☀ or ☽
        btn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    },
};


// ═══════════════════════════════════════════════════════════════════════════
// FILTER BAR
// ═══════════════════════════════════════════════════════════════════════════

const FilterBar = {
    init() {
        document.getElementById('btn-clear-filters').addEventListener('click', () => {
            FilterState.clear();
            document.getElementById('explorer-search').value = '';
        });
        // Delegated click handler for chip remove buttons (set up once, never re-bound)
        document.getElementById('filter-chips').addEventListener('click', (e) => {
            const el = e.target.closest('.chip-remove');
            if (!el) return;
            if (el.dataset.action === 'clear-search') {
                FilterState.searchQuery = '';
                document.getElementById('explorer-search').value = '';
                FilterState.notify();
            } else {
                FilterState.toggle(el.dataset.dim, isNaN(el.dataset.val) ? el.dataset.val : +el.dataset.val);
            }
        });
        FilterState.subscribe(() => this.render());
    },

    /** Derived from FILTER_DIMS registry — no manual sync needed */
    _dimLabels: Object.fromEntries(FILTER_DIMS.map(d => [d.key, d.label])),

    render() {
        const bar = document.getElementById('filter-bar');
        const chips = document.getElementById('filter-chips');
        const count = document.getElementById('filter-count');
        if (!FilterState.isActive()) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        const active = FilterState.getActiveFilters();
        const filtered = FilterState.getFilteredPapers();
        let html = '';
        if (FilterState.searchQuery) {
            html += `<span class="filter-chip" data-dim="search">Search: "${FilterState.searchQuery}" <button class="chip-remove" data-action="clear-search" aria-label="Remove search filter">&times;</button></span>`;
        }
        for (const {dim, val} of active) {
            html += `<span class="filter-chip" data-dim="${dim}">${this._dimLabels[dim] || dim}: ${val} <button class="chip-remove" data-dim="${dim}" data-val="${val}" aria-label="Remove ${this._dimLabels[dim] || dim} filter">&times;</button></span>`;
        }
        chips.innerHTML = html;
        count.textContent = `${filtered.length} of ${DATA.agg.total} papers`;
    }
};


// ═══════════════════════════════════════════════════════════════════════════
// PAPER EXPLORER
// ═══════════════════════════════════════════════════════════════════════════

const Explorer = {
    _page: 1,
    _pageSize: 50,
    _sortKey: 'y',
    _sortDir: -1,  // -1 = desc
    _papers: [],
    _expandedIdx: null,
    _totalPages: 1,

    init() {
        // Delegated pagination handler (Phase 4A: set up once, never re-bound)
        document.getElementById('explorer-pagination').addEventListener('click', (e) => {
            const btn = e.target.closest('.page-btn[data-page]');
            if (!btn || btn.disabled) return;
            const pg = +btn.dataset.page;
            if (pg >= 1 && pg <= this._totalPages) {
                this._page = pg;
                this._expandedIdx = null;
                this.render(this._papers);
                document.getElementById('pane-explorer').scrollIntoView({ behavior: 'smooth' });
            }
        });

        // Search
        const searchEl = document.getElementById('explorer-search');
        let debounce = null;
        searchEl.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => FilterState.setSearch(searchEl.value), 200);
        });

        // Page size
        document.getElementById('explorer-page-size').addEventListener('change', (e) => {
            this._pageSize = +e.target.value;
            this._page = 1;
            this.render(FilterState.getFilteredPapers());
        });

        // Sort headers
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                if (this._sortKey === key) this._sortDir *= -1;
                else { this._sortKey = key; this._sortDir = -1; }
                this.render(this._papers);
            });
        });

        // Delegated click handler for paper rows (set up once, never re-bound)
        document.getElementById('explorer-tbody').addEventListener('click', (e) => {
            const row = e.target.closest('.paper-row');
            if (!row) return;
            const idx = +row.dataset.idx;
            this._expandedIdx = this._expandedIdx === idx ? null : idx;
            this.render(this._papers);
        });

        // Subscribe to filter changes
        FilterState.subscribe(papers => {
            this._page = 1;
            this._expandedIdx = null;
            this.render(papers);
        });
    },

    render(papers) {
        this._papers = papers || [];
        const sorted = [...this._papers].sort((a, b) => {
            const va = a[this._sortKey], vb = b[this._sortKey];
            if (typeof va === 'string') return va.localeCompare(vb) * this._sortDir;
            return (va - vb) * this._sortDir;
        });

        const total = sorted.length;
        const totalPages = Math.max(1, Math.ceil(total / this._pageSize));
        if (this._page > totalPages) this._page = totalPages;
        const start = (this._page - 1) * this._pageSize;
        const pageItems = sorted.slice(start, start + this._pageSize);

        const countEl = document.getElementById('explorer-count');
        if (FilterState.isActive()) {
            countEl.textContent = `${fmt(total)} of ${fmt(DATA.agg.total)} papers`;
            countEl.classList.add('count-filtered');
        } else {
            countEl.textContent = `${fmt(total)} papers`;
            countEl.classList.remove('count-filtered');
        }

        // Update sort arrows
        document.querySelectorAll('.sortable .sort-arrow').forEach(el => el.textContent = '');
        const activeHeader = document.querySelector(`.sortable[data-sort="${this._sortKey}"] .sort-arrow`);
        if (activeHeader) activeHeader.textContent = this._sortDir > 0 ? ' \u25B2' : ' \u25BC';

        // Render table body using shared renderPaperRow / renderPaperDetail
        const tbody = document.getElementById('explorer-tbody');
        let html = '';
        for (const p of pageItems) {
            html += renderPaperRow(p);
            if (this._expandedIdx === p.i) html += renderPaperDetail(p);
        }
        tbody.innerHTML = html;

        // Pagination
        this._renderPagination(totalPages);
    },

    _renderPagination(totalPages) {
        this._totalPages = totalPages;
        const container = document.getElementById('explorer-pagination');
        if (totalPages <= 1) { container.innerHTML = ''; return; }

        let html = '';
        html += `<button class="page-btn" data-page="${this._page - 1}" ${this._page <= 1 ? 'disabled' : ''}>Prev</button>`;

        const pages = getPaginationRange(this._page, totalPages);
        for (const pg of pages) {
            if (pg === '...') {
                html += `<span class="page-btn" style="border:none;cursor:default;">...</span>`;
            } else {
                html += `<button class="page-btn ${pg === this._page ? 'active' : ''}" data-page="${pg}">${pg}</button>`;
            }
        }
        html += `<button class="page-btn" data-page="${this._page + 1}" ${this._page >= totalPages ? 'disabled' : ''}>Next</button>`;

        container.innerHTML = html;
    }
};


// ═══════════════════════════════════════════════════════════════════════════
// PAPER LIST RENDERER (Explorer-style tables for deep-dive sub-tabs)
// ═══════════════════════════════════════════════════════════════════════════

const _ptState = {};      // containerId → { papers, maxItems, expandedFn }
const _ptDelegated = new Set(); // track which containers have delegated click handlers

function renderPaperList(containerId, papers, maxItems) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!papers) { el.innerHTML = '<div style="color:var(--text-muted);padding:12px;">No papers in this section.</div>'; return; }
    if (!_ptState[containerId]) _ptState[containerId] = { expandedFn: null };
    const state = _ptState[containerId];
    state.papers = papers;
    state.maxItems = maxItems;

    // Set up delegated click handler once per container
    if (!_ptDelegated.has(containerId)) {
        _ptDelegated.add(containerId);
        el.addEventListener('click', (e) => {
            const row = e.target.closest('.paper-row');
            if (!row) return;
            const fn = row.dataset.fn;
            const st = _ptState[containerId];
            if (!st) return;
            st.expandedFn = st.expandedFn === fn ? null : fn;
            renderPaperList(containerId, st.papers, st.maxItems);
        });
    }

    const items = papers.slice(0, maxItems || 100);
    if (!items.length) {
        el.innerHTML = '<div style="color:var(--text-muted);padding:12px;">No papers in this section.</div>';
        return;
    }
    let html = `<div class="explorer-table-wrap"><table class="explorer-table">
        <thead><tr><th class="col-year">Year</th><th class="col-paper">Paper</th><th class="col-venue">Venue</th><th class="col-ethics">Ethics</th><th class="col-moral-psych">Moral Psych</th><th class="col-religion">Religion</th><th class="col-models">Model</th><th class="col-flags">Flags</th></tr></thead><tbody>`;
    for (const sp of items) {
        const p = DATA._paperByFn[sp.fn] || sp;
        html += renderPaperRow(p, sp.fn);
        if (state.expandedFn === sp.fn) html += renderPaperDetail(p);
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
}


// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

const _escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const _escRe = /[&<>"]/g;
function esc(str) {
    if (!str) return '';
    return String(str).replace(_escRe, c => _escMap[c]);
}

function getPaginationRange(current, total) {
    if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push('...');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
}

function fmt(n) { return n >= 1000 ? n.toLocaleString() : String(n); }

function _ethicsBadges(p) {
    if (!p.eo) return '<span class="eth-badge eth-no">No</span>';
    const tags = [];
    if (p.ve) tags.push('<span class="eth-badge eth-ve" title="Virtue Ethics">VE</span>');
    if (p.de) tags.push('<span class="eth-badge eth-de" title="Deontological">DE</span>');
    if (p.ue) tags.push('<span class="eth-badge eth-cu" title="Consequentialism">CU</span>');
    if (p.ce) tags.push('<span class="eth-badge eth-ce" title="Care Ethics">CE</span>');
    if (p.co) tags.push('<span class="eth-badge eth-co" title="Contractarian">CO</span>');
    return tags.length ? tags.join('') : '<span class="eth-badge eth-yes">Yes</span>';
}

function _flagBadges(p) {
    const flags = [];
    if (p.ib) flags.push('<span class="flag-badge fb-B" title="Benchmark">B</span>');
    if (p.ie) flags.push('<span class="flag-badge fb-E" title="Eval">E</span>');
    if (p.id) flags.push('<span class="flag-badge fb-D" title="Dataset">D</span>');
    if (p.cu && p.cu.length) flags.push('<span class="flag-badge fb-C" title="Cultural">C</span>');
    if (p.rv && p.rv.length) flags.push('<span class="flag-badge fb-R" title="Religious">R</span>');
    return flags.join('');
}

/** Moral Psychology badge abbreviation map */
const _mpAbbrev = {
    'Moral Foundations': 'MFT',
    'Schwartz': 'Schwartz',
    'Kohlberg': 'Kohlberg',
    'Reasoning': 'Reasoning',
    'Developmental': 'Dev',
    'Trolley': 'Trolley',
    'Dilemma': 'Dilemma',
    'Dual Process': 'Dual',
};

function _moralPsychBadges(p) {
    if (!p.mp) return '<span class="mp-badge" style="color:var(--text-muted);">\u2014</span>';
    const label = _mpAbbrev[p.mp] || p.mp;
    return `<span class="mp-badge" title="${esc(p.mp)}">${esc(label)}</span>`;
}

function _religionBadges(p) {
    if (!p.rv || !p.rv.length) return '<span class="rel-badge" style="color:var(--text-muted);">\u2014</span>';
    const shown = p.rv.slice(0, 2).map(r => `<span class="rel-badge" title="${esc(r)}">${esc(r)}</span>`);
    if (p.rv.length > 2) shown.push(`<span class="badge-overflow" title="${esc(p.rv.slice(2).join(', '))}">+${p.rv.length - 2}</span>`);
    return shown.join('');
}

function _modelBadges(p) {
    if (!p.lm || !p.lm.length) return '<span class="model-badge" style="color:var(--text-muted);">\u2014</span>';
    const shown = p.lm.slice(0, 2).map(m => `<span class="model-badge" title="${esc(m)}">${esc(m)}</span>`);
    if (p.lm.length > 2) shown.push(`<span class="badge-overflow" title="${esc(p.lm.slice(2).join(', '))}">+${p.lm.length - 2}</span>`);
    return shown.join('');
}

/**
 * Shared paper row renderer. Used by Explorer, renderPaperList, and Charts heatmap drilldown.
 */
function renderPaperRow(p, fn) {
    const vtClass = `vt-${(p.vt || 'N/A') === 'N/A' ? 'NA' : p.vt}`;
    const title = p.t || (fn ? fn.replace('.md', '') : '\u2014');
    const authors = p.fa ? `${esc(p.fa)}${p.la ? ', ' + esc(p.la) : ''}` : '';
    return `<tr class="paper-row"${p.i !== undefined ? ` data-idx="${p.i}"` : ''}${fn ? ` data-fn="${esc(fn)}"` : ''}>
        <td class="col-year">${p.y || '\u2014'}</td>
        <td class="col-paper">
            <div class="paper-title">${esc(title)}</div>
            ${authors ? `<div class="paper-authors">${authors}</div>` : ''}
        </td>
        <td class="col-venue"><span class="venue-badge ${vtClass}" title="${esc(p.cc || '')}">${esc(p.cc || '\u2014')}</span></td>
        <td class="col-ethics"><div class="eth-badges">${_ethicsBadges(p)}</div></td>
        <td class="col-moral-psych"><div class="mp-badges">${_moralPsychBadges(p)}</div></td>
        <td class="col-religion"><div class="rel-badges">${_religionBadges(p)}</div></td>
        <td class="col-models"><div class="model-badges">${_modelBadges(p)}</div></td>
        <td class="col-flags"><div class="flag-badges">${_flagBadges(p)}</div></td>
    </tr>`;
}

/**
 * Shared paper detail row renderer.
 * Merges detail fields (ab, bn, wm, url, doi, du) from DATA._detail when available.
 */
function renderPaperDetail(p) {
    const d = (DATA._detail && DATA._detail[p.i]) || {};
    const bn = d.bn || p.bn || '';
    const wm = d.wm || p.wm || '';
    const url = d.url || p.url || '';
    const doi = d.doi || p.doi || '';
    const du = d.du || p.du || '';
    const ab = d.ab || p.ab || '';

    const links = [];
    if (url) links.push(`<a href="${esc(url)}" target="_blank">Paper URL</a>`);
    if (doi) links.push(`<a href="https://doi.org/${esc(doi)}" target="_blank">DOI</a>`);
    if (du) links.push(`<a href="${esc(du)}" target="_blank">Data/Code</a>`);
    const ethDetail = [];
    if (p.eo) ethDetail.push('Ethics: Yes');
    if (p.ve) ethDetail.push('Virtue Ethics');
    if (p.de) ethDetail.push('Deontological');
    if (p.ue) ethDetail.push('Consequentialism/Utilitarianism');
    if (p.ce) ethDetail.push('Care Ethics');
    if (p.co) ethDetail.push('Contractarian Ethics');
    if (p.mp) ethDetail.push('Moral Psych: ' + p.mp);
    return `<tr class="detail-row"><td colspan="8">
        <div class="paper-detail">
            <div class="detail-grid">
                <div class="detail-field"><span class="detail-label">Venue</span><span class="detail-value">${esc(p.cc || '')} ${p.vt ? '(' + p.vt + ')' : ''}</span></div>
                <div class="detail-field"><span class="detail-label">Year</span><span class="detail-value">${p.y || '\u2014'}</span></div>
                <div class="detail-field"><span class="detail-label">Ethics</span><span class="detail-value">${ethDetail.join(', ') || '\u2014'}</span></div>
                <div class="detail-field"><span class="detail-label">Benchmark</span><span class="detail-value">${esc(bn) || '\u2014'}</span></div>
                <div class="detail-field"><span class="detail-label">Measures</span><span class="detail-value">${esc(wm) || '\u2014'}</span></div>
                <div class="detail-field"><span class="detail-label">Cultures</span><span class="detail-value">${(p.cu||[]).join(', ') || '\u2014'}</span></div>
                <div class="detail-field"><span class="detail-label">Languages</span><span class="detail-value">${(p.ln||[]).join(', ') || '\u2014'}</span></div>
                <div class="detail-field"><span class="detail-label">Religion</span><span class="detail-value">${(p.rv||[]).join(', ') || '\u2014'}</span></div>
                <div class="detail-field"><span class="detail-label">Models</span><span class="detail-value">${(p.lm||[]).join(', ') || '\u2014'}</span></div>
                <div class="detail-field"><span class="detail-label">Links</span><span class="detail-value">${links.join(' | ') || '\u2014'}</span></div>
                <div class="detail-field"><span class="detail-label">File</span><span class="detail-value">${esc(p.fn)}</span></div>
            </div>
            ${ab ? `<div class="abstract-text"><strong>Abstract:</strong> ${esc(ab)}</div>` : ''}
        </div>
    </td></tr>`;
}


// ═══════════════════════════════════════════════════════════════════════════
// MULTI-SELECT DROPDOWN
// ═══════════════════════════════════════════════════════════════════════════

class MultiSelect {
    static _instances = [];

    /**
     * @param {string} containerId - DOM id of the container div
     * @param {object} config
     * @param {string} config.dimension - FilterState dimension key
     * @param {string} config.label - Display label
     * @param {Array<{value:*, label:string}>} config.options - Available options
     * @param {function(paper, value):boolean} config.matchFn - Does paper match this option value?
     * @param {function(string):*} [config.parseValue] - Convert string to typed value (e.g., year → number)
     */
    constructor(containerId, config) {
        this.el = document.getElementById(containerId);
        if (!this.el) return;
        this.dim = config.dimension;
        this.label = config.label;
        this.allOptions = config.options;
        this.matchFn = config.matchFn;
        this._parseFn = config.parseValue || null;
        this.el.setAttribute('data-dim', this.dim);
        this.isOpen = false;

        MultiSelect._instances.push(this);
        this._build();
        this._update(); // initial state

        FilterState.subscribe(() => this._update());

        document.addEventListener('click', (e) => {
            if (!this.el.contains(e.target)) this._close();
        });
    }

    _build() {
        const optsHtml = this.allOptions.map(opt =>
            `<label class="msel-option" data-value="${esc(String(opt.value))}">
                <input type="checkbox" value="${esc(String(opt.value))}">
                <span class="msel-opt-label">${esc(opt.label)}</span>
                <span class="msel-opt-count">0</span>
            </label>`
        ).join('');

        this.el.innerHTML =
            `<button class="msel-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
                <span class="msel-label">${esc(this.label)}</span>
                <span class="msel-chevron">&#9662;</span>
            </button>
            <div class="msel-panel" role="listbox" style="display:none;">${optsHtml}</div>`;

        this.el.querySelector('.msel-trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            this.isOpen ? this._close() : this._open();
        });

        this.el.querySelectorAll('.msel-option input').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                FilterState.toggle(this.dim, this._parseValue(cb.value));
            });
        });
    }

    /** Config-driven parseValue — defaults to identity, year uses +str */
    _parseValue(str) {
        if (this._parseFn) return this._parseFn(str);
        return str;
    }

    _open() {
        MultiSelect._instances.forEach(ms => { if (ms !== this) ms._close(); });
        this.isOpen = true;
        this.el.querySelector('.msel-panel').style.display = '';
        this.el.querySelector('.msel-trigger').setAttribute('aria-expanded', 'true');
        this.el.classList.add('msel-open');
    }

    _close() {
        this.isOpen = false;
        const panel = this.el.querySelector('.msel-panel');
        if (panel) panel.style.display = 'none';
        const trigger = this.el.querySelector('.msel-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        this.el.classList.remove('msel-open');
    }

    _update() {
        const activeSet = FilterState.getFilters(this.dim);
        const crossFiltered = FilterState.getCrossFiltered(this.dim);

        // Update trigger label
        const trigger = this.el.querySelector('.msel-label');
        if (activeSet.size === 0) {
            trigger.textContent = this.label;
            this.el.classList.remove('msel-active');
        } else if (activeSet.size === 1) {
            const val = [...activeSet][0];
            const opt = this.allOptions.find(o => String(o.value) === String(val));
            trigger.textContent = `${this.label}: ${opt ? opt.label : val}`;
            this.el.classList.add('msel-active');
        } else {
            trigger.textContent = `${this.label} (${activeSet.size})`;
            this.el.classList.add('msel-active');
        }

        // Pre-compute counts in single pass (O(papers) instead of O(options × papers))
        const countMap = new Map();
        for (const opt of this.allOptions) countMap.set(String(opt.value), 0);
        for (const p of crossFiltered) {
            for (const opt of this.allOptions) {
                if (this.matchFn(p, opt.value)) countMap.set(String(opt.value), countMap.get(String(opt.value)) + 1);
            }
        }

        // Update each option: checked state + count
        this.el.querySelectorAll('.msel-option').forEach(el => {
            const val = this._parseValue(el.dataset.value);
            const cb = el.querySelector('input');
            const countEl = el.querySelector('.msel-opt-count');

            cb.checked = activeSet.has(val);

            const count = countMap.get(String(val)) || 0;
            countEl.textContent = count;

            if (count === 0 && !activeSet.has(val)) {
                el.classList.add('msel-opt-zero');
            } else {
                el.classList.remove('msel-opt-zero');
            }
        });
    }

    static resetAll() {
        // No-op: FilterState.clear() handles state, _update() handles UI via subscription
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// URL STATE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

const URLState = {
    _pushing: false,

    init() {
        window.addEventListener('popstate', () => this._restore());
        FilterState.subscribe(() => this._push());
    },

    _push() {
        if (this._pushing) return;
        const state = {};
        // Active tab
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab !== 'overview') state.tab = activeTab.dataset.tab;
        // Search
        if (FilterState.searchQuery) state.q = FilterState.searchQuery;
        // Filters
        for (const dim of FILTER_DIMS) {
            const set = FilterState.getFilters(dim.key);
            if (set.size > 0) state[dim.key] = [...set];
        }
        const hash = Object.keys(state).length ? '#' + encodeURIComponent(JSON.stringify(state)) : '';
        if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname);
    },

    _restore() {
        if (!location.hash || location.hash.length < 2) return;
        this._pushing = true;
        try {
            const state = JSON.parse(decodeURIComponent(location.hash.slice(1)));
            // Clear existing filters
            Object.values(FilterState._filters).forEach(s => s.clear());
            FilterState.searchQuery = '';
            // Restore filters
            for (const dim of FILTER_DIMS) {
                const vals = state[dim.key];
                if (!vals || !Array.isArray(vals)) continue;
                for (const v of vals) {
                    const parsed = dim.parseValue ? dim.parseValue(String(v)) : v;
                    FilterState._filters[dim.key].add(parsed);
                }
            }
            // Restore search
            if (state.q) {
                FilterState.searchQuery = state.q;
                const searchEl = document.getElementById('explorer-search');
                if (searchEl) searchEl.value = state.q;
            }
            // Restore tab
            if (state.tab) TabManager.switchTab(state.tab);
            FilterState.notify();
        } catch (e) {
            // Invalid hash — ignore silently
        }
        this._pushing = false;
    },
};


// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Called when data-detail.js finishes loading (async).
 * Merges detail data into DATA and rebuilds search index.
 * Guards against being called before FilterState.init().
 */
function _onDetailLoaded() {
    if (typeof DATA_DETAIL !== 'undefined' && typeof DATA !== 'undefined') {
        DATA._detail = DATA_DETAIL;
        if (FilterState._papers) FilterState._buildSearchIndex();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof DATA === 'undefined') {
        document.body.innerHTML = '<div style="padding:40px;color:#ef4444;">Error: data.js not found. Run generate_vault_dashboard_4.py first.</div>';
        return;
    }

    // Init detail data reference (may already be loaded if cached, or will be set by _onDetailLoaded)
    DATA._detail = (typeof DATA_DETAIL !== 'undefined') ? DATA_DETAIL : null;

    // Init FilterState
    FilterState.init(DATA.papers);

    // Build filename → full paper lookup for sub-tab paper tables
    DATA._paperByFn = {};
    DATA.papers.forEach(p => { DATA._paperByFn[p.fn] = p; });

    // Init managers
    ThemeManager.init();
    TabManager.init();
    FilterBar.init();
    Explorer.init();

    // Populate header KPIs
    document.getElementById('kpi-total').textContent = fmt(DATA.agg.total);
    document.getElementById('kpi-date').textContent = DATA.generated;

    // Init overview tab (default active)
    if (typeof Charts !== 'undefined') {
        Charts.initTab('overview');
        TabManager.markInitialized('overview');
    }

    // ── Multi-Select Dropdowns (loop-wired from FILTER_DIMS registry) ──
    for (const dim of FILTER_DIMS) {
        if (!dim.mselId) continue;
        new MultiSelect(dim.mselId, {
            dimension: dim.key,
            label: dim.label,
            options: dim.options(),
            matchFn: dim.match,
            parseValue: dim.parseValue,
        });
    }

    // Initial render of explorer
    Explorer.render(DATA.papers);

    // Back to Top
    const bttBtn = document.getElementById('back-to-top');
    window.addEventListener('scroll', () => {
        bttBtn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
    bttBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // URL state (after explorer render so restore can apply filters)
    URLState.init();
    URLState._restore();


    // ── Overview Digest (v9) ──
    _populateOverviewDigest();

    // ── Filter Presets (v7) ──
    _initFilterPresets();

    // Dismiss loading splash
    requestAnimationFrame(() => {
        const splash = document.getElementById('loading-splash');
        if (splash) splash.classList.add('hidden');
    });
});


// ═══════════════════════════════════════════════════════════════════════════
// OVERVIEW DIGEST (v9)
// ═══════════════════════════════════════════════════════════════════════════

function _populateOverviewDigest() {
    const papers = DATA.papers;
    const total = papers.length;
    const D = DATA.agg;
    const N = DATA.normative;
    const M = DATA.moralPsych;
    const R = DATA.religious;
    const A = DATA.authors;
    const C = DATA.conf;
    const _s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = typeof v === 'number' ? v.toLocaleString() : v; };

    // ── WEIRD % computation ─────────────────────────────────────────────
    const weirdRegions = ['United States', 'United Kingdom', 'Germany', 'France', 'Canada', 'Australia', 'Netherlands', 'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Belgium', 'Austria', 'New Zealand', 'Western', 'Europe', 'North America'];
    const withCulture = papers.filter(p => p.cu && p.cu.length);
    const weirdPapers = withCulture.filter(p => p.cu.some(c => weirdRegions.some(w => c.toLowerCase().includes(w.toLowerCase()))));
    const weirdPct = withCulture.length ? Math.round(weirdPapers.length / withCulture.length * 100) : 0;

    // ── Peer-reviewed % ─────────────────────────────────────────────────
    const vt = D.vtDist || {};
    const peerReviewed = (vt.Conference || 0) + (vt.Journal || 0) + (vt.Findings || 0) + (vt.Workshop || 0);
    const peerPct = total ? Math.round(peerReviewed / total * 100) : 0;

    // ── Model stats ─────────────────────────────────────────────────────
    const modelCounts = {};
    papers.forEach(p => (p.lm || []).forEach(m => { modelCounts[m] = (modelCounts[m] || 0) + 1; }));
    const topModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0];
    const modelFamilies = Object.keys(modelCounts).length;

    // ── Benchmark % ─────────────────────────────────────────────────────
    const benchPct = total ? Math.round(D.candidates / total * 100) : 0;

    // ── Ethics % ────────────────────────────────────────────────────────
    const ethicsPct = total ? Math.round(D.ethicsYes / total * 100) : 0;

    // ── Theory count ────────────────────────────────────────────────────
    const theoryCount = M.theoryDist ? M.theoryDist.filter(t => t.c > 0).length : 0;

    // ── Religious paper total ───────────────────────────────────────────
    const relPaperCount = R.paperCount || R.traditionDist.reduce((a, t) => a + t.c, 0);
    const tradCount = R.traditionDist.length;

    // ── Year span ───────────────────────────────────────────────────────
    const yearRange = D.yearRange || [2010, 2026];

    // ══════════════════════════════════════════════════════════════════════
    // 1. NARRATIVE DIGEST
    // ══════════════════════════════════════════════════════════════════════
    const leadEl = document.getElementById('digest-lead');
    if (leadEl) {
        leadEl.innerHTML =
            `This corpus comprises <strong>${total.toLocaleString()} papers</strong> published between ${yearRange[0]} and ${yearRange[1]}, ` +
            `contributed by <strong>${(A && A.overview ? A.overview.uniqueAuthors : D.authorCount).toLocaleString()} unique authors</strong> across ${C.uniqueVenues.toLocaleString()} distinct venues. ` +
            `${ethicsPct}% engage directly with ethical dimensions of AI systems, and <strong>${benchPct}% are benchmark candidates</strong> suitable for empirical values-alignment research. ` +
            `Every paper carries multi-dimensional classification: normative framework, moral-psychological theory, cultural provenance, religious engagement, and model coverage.`;
    }

    const subEl = document.getElementById('digest-sub');
    if (subEl) {
        subEl.innerHTML =
            `Among papers with cultural metadata, ${weirdPct}% focus on WEIRD populations\u2014a concentration that shapes which value systems receive empirical scrutiny and which remain invisible to the field. ` +
            `The corpus spans ${tradCount} religious traditions, ${theoryCount} active moral-psychological frameworks, and ${D.cultureCount.toLocaleString()} distinct cultural contexts across ${D.languageCount} languages. ` +
            `The dimension cards below preview each analytical axis; click any card to explore the full analysis.`;
    }

    // ══════════════════════════════════════════════════════════════════════
    // 2. KPI STRIP (8 items)
    // ══════════════════════════════════════════════════════════════════════
    _s('kpi-papers', D.total);
    _s('kpi-authors', A && A.overview ? A.overview.uniqueAuthors : D.authorCount);
    _s('kpi-venues', C.uniqueVenues);
    _s('kpi-ethics', D.ethicsYes);
    _s('kpi-candidates', D.candidates);
    _s('kpi-llm', D.llmAssessed);
    _s('kpi-traditions', tradCount);
    _s('kpi-cultures', D.cultureCount);

    // ══════════════════════════════════════════════════════════════════════
    // 3. DIMENSION CARDS
    // ══════════════════════════════════════════════════════════════════════

    // Normative Ethics
    _s('dim-body-normative',
        `Three canonical frameworks\u2014virtue ethics, deontological reasoning, and consequentialism\u2014structure how the field evaluates AI behavior. ` +
        `Classification reveals which ethical traditions dominate empirical testing and where philosophical blind spots persist.`);
    _s('dim-stats-normative',
        `${N.ve.count} VE \u00B7 ${N.de.count} DE \u00B7 ${N.cu.count} CU papers`);

    // Moral Psychology
    _s('dim-body-moralpsych',
        `Moral Foundations Theory, Schwartz values, Kohlberg\u2019s stages, and trolley-style dilemmas each operationalize moral cognition differently. ` +
        `This tab traces which frameworks dominate LLM evaluation and how methodological choices shape alignment conclusions.`);
    _s('dim-stats-moralpsych',
        `${M.paperCount} papers \u00B7 ${theoryCount} active frameworks`);

    // Religious Values
    _s('dim-body-religious',
        `From Islamic jurisprudence to Ubuntu philosophy, religious and wisdom traditions encode value systems rarely represented in standard AI benchmarks. ` +
        `Per-tradition deep dives reveal coverage gaps, benchmark availability, and cross-tradition overlap.`);
    _s('dim-stats-religious',
        `${relPaperCount} papers \u00B7 ${tradCount} traditions`);

    // Cultural Values
    _s('dim-body-cultural',
        `Cultural context determines which values are salient, yet ${weirdPct}% of culturally-tagged papers study WEIRD populations. ` +
        `This axis maps geographic coverage, language diversity, and the structural underrepresentation of non-Western value systems.`);
    _s('dim-stats-cultural',
        `${D.cultureCount} cultures \u00B7 ${D.languageCount} languages \u00B7 ${weirdPct}% WEIRD`);

    // Models & LLMs
    const topModelName = topModel ? topModel[0] : '\u2014';
    const topModelCount = topModel ? topModel[1] : 0;
    _s('dim-body-models',
        `${modelFamilies} model families appear in the corpus, with ${topModelName} tested most frequently (${topModelCount} papers). ` +
        `Coverage analysis reveals which architectures receive sustained ethical scrutiny and which remain understudied.`);
    _s('dim-stats-models',
        `${modelFamilies} families \u00B7 ${topModelName} leads (${topModelCount})`);

    // Conference & Venue
    _s('dim-body-conference',
        `${peerPct}% of papers appear in peer-reviewed venues (conferences, journals, workshops, findings tracks). ` +
        `Venue-type distribution, top-30 rankings, and publication timeline reveal the field\u2019s institutional geography.`);
    _s('dim-stats-conference',
        `${C.uniqueVenues} venues \u00B7 ${peerPct}% peer-reviewed`);

    // Benchmarks & Taxonomy
    _s('dim-body-taxonomy',
        `${D.candidates.toLocaleString()} papers (${benchPct}% of corpus) qualify as benchmark candidates across ${(D.categories || []).length} research categories. ` +
        `Taxonomy breakdowns and method-type distributions map the empirical infrastructure of values-alignment research.`);
    _s('dim-stats-taxonomy',
        `${D.candidates.toLocaleString()} candidates \u00B7 ${benchPct}% of corpus`);

    // Authors & Collaboration
    const ov = A && A.overview ? A.overview : {};
    _s('dim-body-authors',
        `${(ov.uniqueAuthors || D.authorCount).toLocaleString()} unique contributors with a median team size of ${ov.medianTeam || '\u2014'}. ` +
        `Lotka\u2019s law analysis, prolific-author networks, and institutional diversity metrics characterize the research community\u2019s structure.`);
    _s('dim-stats-authors',
        `${(ov.uniqueAuthors || D.authorCount).toLocaleString()} authors \u00B7 median team ${ov.medianTeam || '\u2014'}`);

    // ══════════════════════════════════════════════════════════════════════
    // 4. CLICK-TO-NAVIGATE
    // ══════════════════════════════════════════════════════════════════════
    document.querySelectorAll('.dim-card[data-tab-link]').forEach(card => {
        card.addEventListener('click', () => {
            const target = card.dataset.tabLink;
            const btn = document.querySelector(`.tab-btn[data-tab="${target}"]`);
            if (btn) btn.click();
        });
    });
}


// ═══════════════════════════════════════════════════════════════════════════
// FILTER PRESETS (v7)
// ═══════════════════════════════════════════════════════════════════════════

const OPEN_MODELS = ['LLaMA', 'Llama', 'Llama 2', 'Llama 3', 'Mistral', 'Mixtral', 'Falcon', 'BLOOM', 'Vicuna', 'Alpaca', 'Qwen', 'ChatGLM', 'Baichuan', 'DeepSeek', 'Yi', 'OLMo', 'Gemma', 'Phi', 'StableLM', 'MPT', 'RedPajama', 'OpenLLaMA'];

const FILTER_PRESETS = {
    benchmarks: { dim: 'flag', values: ['B'] },
    'non-weird': { dim: 'culture', custom: true },
    religious: { dim: 'religion', values: ['Yes'] },
    'cross-cultural': { dim: 'flag', values: ['C'] },
    'open-models': { dim: 'llmModel', custom: true },
};

function _initFilterPresets() {
    let activePreset = null;

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            const wasActive = btn.classList.contains('active');

            // Clear all presets
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));

            if (wasActive) {
                // Deactivate — clear filters
                activePreset = null;
                FilterState.clear();
                document.getElementById('explorer-search').value = '';
                return;
            }

            // Activate preset
            activePreset = preset;
            btn.classList.add('active');
            FilterState.clear();
            document.getElementById('explorer-search').value = '';

            const config = FILTER_PRESETS[preset];
            if (!config) return;

            if (preset === 'non-weird') {
                // Toggle flag C (Cultural) — papers with cultural data
                FilterState.toggle('flag', 'C');
            } else if (preset === 'open-models') {
                // Find open models that exist in data
                const allModels = new Set(DATA.papers.flatMap(p => p.lm || []));
                const openInData = OPEN_MODELS.filter(m => allModels.has(m));
                if (openInData.length) {
                    openInData.forEach(m => FilterState.toggle('llmModel', m));
                } else {
                    FilterState.toggle('llmModel', 'Yes');
                }
            } else if (config.values) {
                config.values.forEach(v => FilterState.toggle(config.dim, v));
            }

            // Switch to Explorer tab to show results
            TabManager.switchTab('explorer');
        });
    });

    // Clear preset active state when filters change manually
    FilterState.subscribe(() => {
        if (activePreset) {
            // Check if manual filter change happened
            const btn = document.querySelector(`.preset-btn[data-preset="${activePreset}"]`);
            // Don't auto-deactivate — let the user clear manually
        }
    });
}
