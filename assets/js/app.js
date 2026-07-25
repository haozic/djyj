'use strict';

/* ===== 状态管理 ===== */
const state = {
    meta: [],              // 文章元数据
    yearData: {},          // {2020: {url: {b, bm}}, ...}
    loadedYears: new Set(),
    loadingYears: new Set(),
    favorites: [],         // 收藏的URL列表
    currentMode: 'section', // 当前标签：section/catalog/favorites
    currentArticleUrl: null,
    searchTimer: null,
    fullTextReady: false,
    catalogRendered: false,
    catalogExpanded: new Set(),
    isSearching: false,    // 是否正在显示搜索结果
};

const CN = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
const FAV_KEY = 'djyj_favorites';

/* ===== SVG 图标辅助 ===== */
function svgStar(filled) {
    const id = filled ? 'i-star-fill' : 'i-star';
    return `<svg class="icon"><use href="#${id}"/></svg>`;
}

function svgIcon(name) {
    return `<svg class="icon"><use href="#${name}"/></svg>`;
}

/* ===== 数据加载 ===== */
async function loadMeta() {
    try {
        const resp = await fetch('data/meta.json');
        state.meta = await resp.json();
        document.getElementById('totalCount').textContent = state.meta.length;
        return true;
    } catch (e) {
        console.error('加载元数据失败:', e);
        return false;
    }
}

async function loadYearData(year, retry = 2) {
    year = String(year);
    if (state.loadedYears.has(year) || state.loadingYears.has(year)) return state.loadedYears.has(year);
    state.loadingYears.add(year);
    try {
        const resp = await fetch(`data/years/${year}.json`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        state.yearData[year] = await resp.json();
        state.loadedYears.add(year);
        return true;
    } catch (e) {
        console.error(`加载 ${year} 年数据失败:`, e);
        if (retry > 0) {
            await new Promise(r => setTimeout(r, 800));
            state.loadingYears.delete(year);
            return loadYearData(year, retry - 1);
        }
        return false;
    } finally {
        state.loadingYears.delete(year);
    }
}

async function loadAllYearsBackground() {
    const years = [...new Set(state.meta.map(a => a.y))].sort((a, b) => b - a);
    const status = document.getElementById('searchStatus');
    status.className = 'search-status loading';
    status.textContent = '全文搜索加载中...';

    for (const y of years) {
        await loadYearData(y);
    }

    state.fullTextReady = true;
    status.className = 'search-status ready';
    status.textContent = '全文搜索就绪';

    const q = document.getElementById('searchInput').value.trim();
    if (q) performSearch();
}

/* ===== 收藏管理 ===== */
function loadFavorites() {
    try {
        const data = localStorage.getItem(FAV_KEY);
        state.favorites = data ? JSON.parse(data) : [];
    } catch (e) {
        state.favorites = [];
    }
}

function saveFavorites() {
    try {
        localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites));
    } catch (e) {
        console.error('保存收藏失败:', e);
    }
    updateFavBadges();
}

function isFavorite(url) {
    return state.favorites.includes(url);
}

function toggleFavorite(url) {
    const idx = state.favorites.indexOf(url);
    if (idx >= 0) {
        state.favorites.splice(idx, 1);
    } else {
        state.favorites.unshift(url);
    }
    saveFavorites();
}

function updateFavBadges() {
    const count = state.favorites.length;
    const badges = document.querySelectorAll('.fav-badge');
    badges.forEach(b => {
        b.textContent = count;
        b.setAttribute('data-count', count);
    });
}

/* ===== 搜索 ===== */
function getSearchScope() {
    const checked = document.querySelector('input[name="searchScope"]:checked');
    return checked ? checked.value : 'all';
}

function performSearch() {
    const input = document.getElementById('searchInput');
    const query = input.value.trim().toLowerCase();
    const hasQuery = query.length > 0;

    // 有搜索词时切换到搜索视图
    if (hasQuery && !state.isSearching) {
        state.isSearching = true;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('searchView').classList.add('active');
    } else if (!hasQuery && state.isSearching) {
        // 清空搜索时返回当前标签
        state.isSearching = false;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const viewMap = { section: 'sectionView', catalog: 'catalogView', favorites: 'favoritesView' };
        const view = document.getElementById(viewMap[state.currentMode]);
        if (view) view.classList.add('active');
        document.getElementById('resultInfo').textContent = '';
        document.getElementById('searchResults').innerHTML = '';
        return;
    }

    if (!hasQuery) return;

    const scope = getSearchScope(); // all / title / body
    const fs = document.getElementById('filterSection').value;
    const bo = document.getElementById('bodyOnly').checked;
    const container = document.getElementById('searchResults');
    const info = document.getElementById('resultInfo');

    let results = state.meta.filter(a => {
        if (fs && a.s !== fs) return false;
        if (bo && !a.h) return false;
        if (query) {
            let matched = false;
            // 标题搜索（包含标题、作者、板块名）
            if (scope === 'title' || scope === 'all') {
                const metaData = (a.t + ' ' + a.a + ' ' + a.s).toLowerCase();
                if (metaData.includes(query)) matched = true;
            }
            // 正文搜索
            if (!matched && (scope === 'body' || scope === 'all') && a.h && state.fullTextReady) {
                const yd = state.yearData[String(a.y)];
                if (yd && yd[a.u] && yd[a.u].b) {
                    if (yd[a.u].b.toLowerCase().includes(query)) matched = true;
                }
            }
            if (!matched) return false;
        }
        return true;
    });

    const qDisplay = input.value.trim();
    const scopeLabel = scope === 'all' ? '标题+正文' : (scope === 'title' ? '仅标题' : '仅正文');
    let infoText = `共 ${results.length} 篇文章`;
    if (qDisplay) infoText += `（关键词："${qDisplay}" ｜ 范围：${scopeLabel}）`;
    if (scope !== 'title' && !state.fullTextReady) infoText += ' · 全文搜索加载中，当前仅搜索标题/作者';
    info.textContent = infoText;

    if (results.length === 0) {
        container.innerHTML = '<div class="loading"><div>未找到匹配文章</div></div>';
        return;
    }

    const limit = query ? 200 : 100;
    const display = results.slice(0, limit);
    let html = '';

    display.forEach(a => {
        let titleHtml = escHtml(a.t);
        let snippet = '';
        let authorHtml = a.a ? `<span class="rc-author">｜${escHtml(a.a)}</span>` : '';

        if (query) {
            titleHtml = highlightText(a.t, query);
            if (a.h && (scope === 'body' || scope === 'all')) {
                const yd = state.yearData[String(a.y)];
                const body = (yd && yd[a.u]) ? yd[a.u].b : '';
                if (body) {
                    const lb = body.toLowerCase();
                    const pos = lb.indexOf(query);
                    if (pos >= 0) {
                        const s = Math.max(0, pos - 40);
                        const e = Math.min(body.length, pos + query.length + 80);
                        snippet = (s > 0 ? '...' : '') + body.substring(s, e) + (e < body.length ? '...' : '');
                        snippet = highlightText(snippet, query);
                    } else {
                        snippet = escHtml(body.substring(0, 120)) + '...';
                    }
                }
            }
            if (!snippet) snippet = '<span style="color:var(--text-3);">无正文</span>';
        } else {
            snippet = a.h ? '点击查看全文' : '<span style="color:var(--text-3);">无全文</span>';
        }

        const ci = a.i <= 12 ? CN[a.i - 1] : a.i;
        const isFav = isFavorite(a.u);
        const favClass = isFav ? 'active' : '';
        const favIcon = svgStar(isFav);
        const noBodyTag = a.h ? '' : '<span class="rc-tag no-body">无全文</span>';
        const encUrl = encodeURIComponent(a.u);

        html += `<div class="result-card" onclick="showArticle('${encUrl}')">
            <button class="rc-fav-btn ${favClass}" onclick="event.stopPropagation(); toggleFavFromCard(this, '${encUrl}')">${favIcon}</button>
            <div class="rc-title">${titleHtml}</div>
            <div class="rc-meta">
                <span class="rc-tag">${a.y}年第${ci}期</span>
                <span class="rc-tag">${escHtml(a.s)}</span>
                ${authorHtml}
                ${noBodyTag}
            </div>
            <div class="rc-snippet">${snippet}</div>
        </div>`;
    });

    if (results.length > limit) {
        html += `<div class="loading"><div>仅显示前 ${limit} 篇，请缩小搜索范围</div></div>`;
    }

    container.innerHTML = html;
}

function toggleFavFromCard(btn, encUrl) {
    const url = decodeURIComponent(encUrl);
    toggleFavorite(url);
    const active = isFavorite(url);
    btn.classList.toggle('active', active);
    btn.innerHTML = svgStar(active);
}

/* ===== 文章详情（独立页面 + History API） ===== */
async function showArticle(encUrl) {
    const url = decodeURIComponent(encUrl);
    const a = state.meta.find(x => x.u === url);
    if (!a) {
        alert('未找到该文章');
        return;
    }

    state.currentArticleUrl = url;
    const ci = a.i <= 12 ? CN[a.i - 1] : a.i;

    // 填充文章页头
    document.getElementById('articleTitle').textContent = a.t;
    document.getElementById('articleMeta').innerHTML =
        `${a.y}年第${ci}期 ｜ ${escHtml(a.s)}${a.a ? ' ｜ ' + escHtml(a.a) : ''}`;

    // 原文链接
    const origLink = document.getElementById('articleOrigLink');
    if (a.u) {
        origLink.href = a.u;
        origLink.style.display = '';
    } else {
        origLink.style.display = 'none';
    }

    // 收藏按钮状态
    const favBtn = document.getElementById('articleFavBtn');
    const isFav = isFavorite(url);
    favBtn.classList.toggle('active', isFav);
    favBtn.innerHTML = svgStar(isFav);

    const bodyEl = document.getElementById('articleBody');

    // 切换到文章页面
    document.body.classList.add('article-active');
    window.scrollTo(0, 0);

    // History API：压入历史记录
    if (!history.state || history.state.article !== encUrl) {
        history.pushState({ article: encUrl }, '', `#a=${encUrl}`);
    }

    if (!a.h) {
        bodyEl.innerHTML = '<div class="no-body">该文章无全文内容<br><small>可能为新闻汇总条目或专刊文献</small></div>';
        return;
    }

    bodyEl.innerHTML = '<div class="article-loading"><div class="spinner"></div><div>加载正文...</div></div>';

    // 确保年份数据已加载（含重试）
    if (!state.loadedYears.has(String(a.y))) {
        const ok = await loadYearData(a.y);
        if (!ok) {
            bodyEl.innerHTML = `<div class="no-body">正文数据加载失败<br>
                <small>可能是网络不稳定，请重试</small><br>
                <button class="retry-btn" onclick="retryShowArticle('${encodeURIComponent(url)}')">重新加载</button></div>`;
            return;
        }
    }

    renderArticleBody(url, a.y, bodyEl);
}

function renderArticleBody(url, year, bodyEl) {
    const yd = state.yearData[String(year)];
    if (yd && yd[url]) {
        const bodyData = yd[url];
        if (bodyData.bm) {
            bodyEl.innerHTML = renderMarkdown(bodyData.bm);
        } else if (bodyData.b) {
            const paras = bodyData.b.split('\n\n');
            bodyEl.innerHTML = paras.map(p => '<p>' + escHtml(p) + '</p>').join('');
        } else {
            bodyEl.innerHTML = '<div class="no-body">正文内容为空</div>';
        }
    } else {
        bodyEl.innerHTML = `<div class="no-body">未找到该文章的正文数据<br>
            <small>URL: ${escHtml(url.substring(0, 60))}...</small></div>`;
    }
}

async function retryShowArticle(encUrl) {
    const url = decodeURIComponent(encUrl);
    const a = state.meta.find(x => x.u === url);
    if (!a) return;

    // 清除已加载状态强制重新加载
    state.loadedYears.delete(String(a.y));
    delete state.yearData[String(a.y)];

    const bodyEl = document.getElementById('articleBody');
    bodyEl.innerHTML = '<div class="article-loading"><div class="spinner"></div><div>重新加载中...</div></div>';

    const ok = await loadYearData(a.y);
    if (!ok) {
        bodyEl.innerHTML = `<div class="no-body">加载仍然失败<br>
            <small>请检查网络后重试，或访问原文链接</small><br>
            <button class="retry-btn" onclick="retryShowArticle('${encodeURIComponent(url)}')">再次重试</button>
            <a href="${a.u}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;color:var(--primary);">直接查看原文</a></div>`;
        return;
    }

    renderArticleBody(url, a.y, bodyEl);
}

function toggleArticleFav() {
    if (!state.currentArticleUrl) return;
    const url = state.currentArticleUrl;
    toggleFavorite(url);
    const isFav = isFavorite(url);
    const btn = document.getElementById('articleFavBtn');
    btn.classList.toggle('active', isFav);
    btn.innerHTML = svgStar(isFav);
    if (state.currentMode === 'favorites' && !state.isSearching) renderFavorites();
    if (state.isSearching) performSearch();
}

function goBack() {
    if (document.body.classList.contains('article-active') ||
        document.body.classList.contains('section-active') ||
        document.body.classList.contains('about-active')) {
        history.back();
    }
}

function closeArticlePage() {
    document.body.classList.remove('article-active');
    state.currentArticleUrl = null;
    document.getElementById('readingProgress').style.width = '0%';
}

/* ===== 关于页面（独立全屏页面 + History API） ===== */
function showAboutPage() {
    document.body.classList.add('about-active');
    window.scrollTo(0, 0);
    if (!history.state || !history.state.about) {
        history.pushState({ about: true }, '', '#about');
    }
}

function closeAboutPage() {
    document.body.classList.remove('about-active');
}

/* ===== 阅读进度条 ===== */
function updateReadingProgress() {
    if (!document.body.classList.contains('article-active')) return;
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    document.getElementById('readingProgress').style.width = pct + '%';
}

/* ===== Markdown 渲染 ===== */
function renderMarkdown(md) {
    if (!md) return '';
    const paras = md.split('\n\n');
    let html = '';
    paras.forEach(p => {
        p = p.trim();
        if (!p) return;
        if (p.startsWith('### ')) {
            html += '<p class="md-heading">' + escHtml(p.substring(4)) + '</p>';
        } else if (p.startsWith('## ')) {
            html += '<p class="md-heading" style="font-size:17px;">' + escHtml(p.substring(3)) + '</p>';
        } else if (p.startsWith('# ')) {
            html += '<p class="md-heading" style="font-size:18px;">' + escHtml(p.substring(2)) + '</p>';
        } else {
            let processed = escHtml(p);
            processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            if (processed.startsWith('<strong>') && processed.endsWith('</strong>') &&
                processed.indexOf('<strong>') === processed.lastIndexOf('<strong>')) {
                html += '<p class="md-bold">' + processed + '</p>';
            } else {
                html += '<p>' + processed + '</p>';
            }
        }
    });
    return html;
}

/* ===== 板块视图 ===== */
function renderSections() {
    const counter = {};
    state.meta.forEach(a => {
        counter[a.s] = (counter[a.s] || 0) + 1;
    });
    const sorted = Object.entries(counter).sort((a, b) => b[1] - a[1]);
    const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

    const container = document.getElementById('sectionContent');
    let html = '';
    sorted.forEach(([name, count]) => {
        const pct = (count / maxCount * 100).toFixed(0);
        html += `<div class="section-card" onclick="showSectionPage('${encodeURIComponent(name)}')">
            <div class="sc-name">${escHtml(name)}</div>
            <div class="sc-bar"><div class="sc-bar-fill" style="width:${pct}%;"></div></div>
            <div class="sc-count">${count} 篇</div>
        </div>`;
    });
    container.innerHTML = html;
}

/* ===== 板块文章页面（独立全屏页面 + History API） ===== */
function showSectionPage(encName) {
    const name = decodeURIComponent(encName);
    const articles = state.meta
        .filter(a => a.s === name)
        .sort((a, b) => b.y - a.y || a.i - b.i);

    document.getElementById('sectionPageName').textContent = name;
    document.getElementById('sectionPageCount').textContent = `${articles.length} 篇文章`;
    document.getElementById('sectionPageSearch').value = '';
    renderSectionPageBody(articles, '');

    document.body.classList.add('section-active');
    window.scrollTo(0, 0);

    if (!history.state || history.state.section !== encName) {
        history.pushState({ section: encName }, '', `#s=${encName}`);
    }
}

function renderSectionPageBody(articles, query) {
    const body = document.getElementById('sectionPageBody');
    body.innerHTML = '';

    let filtered = articles;
    if (query) {
        const lq = query.toLowerCase();
        filtered = articles.filter(a =>
            (a.t + ' ' + a.a).toLowerCase().includes(lq)
        );
    }

    if (filtered.length === 0) {
        body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);">未找到匹配文章</div>';
        return;
    }

    const yg = {};
    filtered.forEach(a => {
        if (!yg[a.y]) yg[a.y] = [];
        yg[a.y].push(a);
    });

    const years = Object.keys(yg).sort((a, b) => parseInt(b) - parseInt(a));
    let html = '';

    years.forEach(year => {
        const ya = yg[year];
        const ig = {};
        ya.forEach(a => {
            if (!ig[a.i]) ig[a.i] = [];
            ig[a.i].push(a);
        });
        const issues = Object.keys(ig).sort((a, b) => parseInt(a) - parseInt(b));

        html += `<div class="sp-year-group"><div class="sp-year-header">${year}年 (${ya.length}篇)</div>`;
        issues.forEach(iss => {
            const ia = ig[iss];
            const cin = parseInt(iss) <= 12 ? CN[parseInt(iss) - 1] : iss;
            html += `<div class="sp-issue-group"><div class="sp-issue-label">${cin}期</div>`;
            ia.forEach(a => {
                const author = a.a ? `<span class="author">｜${escHtml(a.a)}</span>` : '';
                const encUrl = encodeURIComponent(a.u);
                if (a.h) {
                    html += `<div class="sp-article" onclick="showArticle('${encUrl}')">${escHtml(a.t)}${author}</div>`;
                } else {
                    html += `<div class="sp-article no-body">${escHtml(a.t)}<span class="sp-no-body-tag">无全文</span>${author}</div>`;
                }
            });
            html += `</div>`;
        });
        html += `</div>`;
    });

    body.innerHTML = html;
}

function filterSectionPage() {
    const q = document.getElementById('sectionPageSearch').value.trim();
    const name = document.getElementById('sectionPageName').textContent;
    const articles = state.meta
        .filter(a => a.s === name)
        .sort((a, b) => b.y - a.y || a.i - b.i);
    renderSectionPageBody(articles, q);
}

function closeSectionPage() {
    document.body.classList.remove('section-active');
}

/* ===== 目录视图（懒加载） ===== */
function renderCatalog() {
    const container = document.getElementById('catalogContent');
    if (state.catalogRendered) return;

    const catalog = {};
    state.meta.forEach(a => {
        if (!catalog[a.y]) catalog[a.y] = {};
        if (!catalog[a.y][a.i]) catalog[a.y][a.i] = {};
        if (!catalog[a.y][a.i][a.s]) catalog[a.y][a.i][a.s] = [];
        catalog[a.y][a.i][a.s].push(a);
    });

    state.catalogData = catalog;

    const years = Object.keys(catalog).sort((a, b) => parseInt(b) - parseInt(a));
    const chevron = svgIcon('i-chevron');
    let html = '';

    years.forEach(year => {
        const issues = Object.keys(catalog[year]).sort((a, b) => parseInt(a) - parseInt(b));
        let total = 0;
        issues.forEach(ik => total += Object.values(catalog[year][ik]).reduce((s, arr) => s + arr.length, 0));

        html += `<div class="year-block collapsed" id="yb-${year}">
            <div class="yb-header" onclick="toggleYear('${year}')">
                <h3>${year}年</h3>
                <div class="yb-right">
                    <span class="yb-info">${issues.length}期 ｜ ${total}篇</span>
                    <span class="yb-toggle">${chevron}</span>
                </div>
            </div>
            <div class="yb-body" id="yb-body-${year}"></div>
        </div>`;
    });

    container.innerHTML = html;
    state.catalogRendered = true;
    if (years.length > 0) toggleYear(years[0]);
}

function toggleYear(year) {
    const block = document.getElementById(`yb-${year}`);
    if (!block) return;
    const body = document.getElementById(`yb-body-${year}`);
    const wasCollapsed = block.classList.contains('collapsed');

    block.classList.toggle('collapsed');

    if (wasCollapsed && !state.catalogExpanded.has(`y-${year}`)) {
        state.catalogExpanded.add(`y-${year}`);
        const catalog = state.catalogData;
        const issues = Object.keys(catalog[year]).sort((a, b) => parseInt(a) - parseInt(b));
        const chevron = svgIcon('i-chevron');
        let html = '';

        issues.forEach(ik => {
            const secs = catalog[year][ik];
            const secNames = Object.keys(secs);
            let issueTotal = secNames.reduce((s, sn) => s + secs[sn].length, 0);
            const cin = parseInt(ik) <= 12 ? CN[parseInt(ik) - 1] : ik;

            html += `<div class="issue-row collapsed" id="ir-${year}-${ik}">
                <div class="ir-header" onclick="toggleIssue('${year}','${ik}')">
                    <span class="ir-title">${year}年第${cin}期</span>
                    <div class="ir-right">
                        <span class="ir-count">${issueTotal}篇</span>
                        <span class="ir-toggle">${chevron}</span>
                    </div>
                </div>
                <div class="ir-body" id="ir-body-${year}-${ik}"></div>
            </div>`;
        });

        body.innerHTML = html;
    }
}

function toggleIssue(year, ik) {
    const row = document.getElementById(`ir-${year}-${ik}`);
    if (!row) return;
    const body = document.getElementById(`ir-body-${year}-${ik}`);
    const wasCollapsed = row.classList.contains('collapsed');

    row.classList.toggle('collapsed');

    if (wasCollapsed && !state.catalogExpanded.has(`i-${year}-${ik}`)) {
        state.catalogExpanded.add(`i-${year}-${ik}`);
        const catalog = state.catalogData;
        const secs = catalog[year][ik];
        const secNames = Object.keys(secs);
        let html = '';

        secNames.forEach(sn => {
            const arts = secs[sn];
            html += `<div class="sec-group"><div class="sg-title">${escHtml(sn)} <span class="count">(${arts.length}篇)</span></div>`;
            arts.forEach(a => {
                const au = a.a ? ` <span class="ai-author">｜${escHtml(a.a)}</span>` : '';
                const encUrl = encodeURIComponent(a.u);
                html += `<div class="art-item" onclick="showArticle('${encUrl}')">${escHtml(a.t)}${au}</div>`;
            });
            html += `</div>`;
        });

        body.innerHTML = html;

        if (!state.loadedYears.has(String(year))) {
            loadYearData(year);
        }
    }
}

/* ===== 收藏视图 ===== */
function renderFavorites() {
    const container = document.getElementById('favoritesContent');

    if (state.favorites.length === 0) {
        container.innerHTML = `<div class="fav-empty">
            <div class="fav-empty-icon">${svgIcon('i-bookmark')}</div>
            <div class="fav-empty-text">还没有收藏文章</div>
            <div class="fav-empty-hint">在文章详情中点击星标即可收藏</div>
        </div>`;
        return;
    }

    const favArticles = state.favorites
        .map(url => state.meta.find(a => a.u === url))
        .filter(a => a);

    let html = `<div class="fav-header">
        <div class="fh-count">${svgIcon('i-star-fill')} 已收藏 ${favArticles.length} 篇</div>
        <div class="fh-actions">
            <button onclick="exportFavorites()">导出</button>
            <button onclick="clearFavorites()">清空</button>
        </div>
    </div>`;

    favArticles.forEach(a => {
        const ci = a.i <= 12 ? CN[a.i - 1] : a.i;
        const encUrl = encodeURIComponent(a.u);
        html += `<div class="result-card" onclick="showArticle('${encUrl}')">
            <button class="rc-fav-btn active" onclick="event.stopPropagation(); toggleFavFromCard(this, '${encUrl}')">${svgStar(true)}</button>
            <div class="rc-title">${escHtml(a.t)}</div>
            <div class="rc-meta">
                <span class="rc-tag">${a.y}年第${ci}期</span>
                <span class="rc-tag">${escHtml(a.s)}</span>
                ${a.a ? `<span class="rc-author">｜${escHtml(a.a)}</span>` : ''}
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

function exportFavorites() {
    const data = JSON.stringify(state.favorites, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'djyj_favorites.json';
    a.click();
    URL.revokeObjectURL(url);
}

function clearFavorites() {
    if (!confirm('确定清空所有收藏吗？')) return;
    state.favorites = [];
    saveFavorites();
    renderFavorites();
}

/* ===== 导航（3标签 + 搜索自动切换） ===== */
function switchMode(mode) {
    state.currentMode = mode;
    state.isSearching = false;

    // 清空搜索框
    document.getElementById('searchInput').value = '';

    // 更新标签激活状态
    document.querySelectorAll('.nav-tab, .bn-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // 切换视图
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewMap = { section: 'sectionView', catalog: 'catalogView', favorites: 'favoritesView' };
    const view = document.getElementById(viewMap[mode]);
    if (view) view.classList.add('active');

    if (mode === 'section') renderSections();
    else if (mode === 'catalog') renderCatalog();
    else if (mode === 'favorites') renderFavorites();

    window.scrollTo(0, 0);
}

/* ===== 工具函数 ===== */
function escHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightText(text, query) {
    if (!text || !query) return escHtml(text);
    const lt = text.toLowerCase();
    const lq = query.toLowerCase();
    let result = '';
    let lastIdx = 0;
    let idx = lt.indexOf(lq);
    while (idx >= 0) {
        result += escHtml(text.substring(lastIdx, idx));
        result += '<span class="hl">' + escHtml(text.substring(idx, idx + query.length)) + '</span>';
        lastIdx = idx + query.length;
        idx = lt.indexOf(lq, lastIdx);
    }
    result += escHtml(text.substring(lastIdx));
    return result;
}

/* ===== 初始化 ===== */
async function init() {
    loadFavorites();
    updateFavBadges();

    // 标签导航
    document.querySelectorAll('.nav-tab, .bn-item').forEach(btn => {
        btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });

    // 搜索：点击按钮或回车触发
    const searchInput = document.getElementById('searchInput');
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') performSearch();
    });

    document.getElementById('filterSection').addEventListener('change', performSearch);
    document.getElementById('bodyOnly').addEventListener('change', performSearch);
    document.querySelectorAll('input[name="searchScope"]').forEach(r => {
        r.addEventListener('change', () => {
            if (searchInput.value.trim()) performSearch();
        });
    });

    // 键盘快捷键
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (document.body.classList.contains('article-active') ||
                document.body.classList.contains('section-active') ||
                document.body.classList.contains('about-active')) {
                goBack();
            }
        }
    });

    // History API：浏览器后退
    window.addEventListener('popstate', e => {
        if (document.body.classList.contains('article-active')) {
            closeArticlePage();
        } else if (document.body.classList.contains('section-active')) {
            closeSectionPage();
        } else if (document.body.classList.contains('about-active')) {
            closeAboutPage();
        }
    });

    // 阅读进度条
    window.addEventListener('scroll', updateReadingProgress, { passive: true });

    // 加载数据
    const ok = await loadMeta();
    if (!ok) {
        document.getElementById('sectionContent').innerHTML =
            '<div class="loading"><div>数据加载失败，请刷新重试</div></div>';
        return;
    }

    // 填充筛选器
    const sectionCounter = {};
    state.meta.forEach(a => {
        sectionCounter[a.s] = (sectionCounter[a.s] || 0) + 1;
    });

    const fs = document.getElementById('filterSection');
    Object.entries(sectionCounter)
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, count]) => {
            fs.innerHTML += `<option value="${escHtml(name)}">${escHtml(name)} (${count}篇)</option>`;
        });

    // 默认显示板块视图
    renderSections();
    loadAllYearsBackground();

    // 支持直接通过 URL 打开文章
    if (location.hash.startsWith('#a=')) {
        const encUrl = location.hash.substring(3);
        if (encUrl) {
            setTimeout(() => showArticle(encUrl), 300);
        }
    }

    // 支持直接通过 URL 打开板块页面
    if (location.hash.startsWith('#s=')) {
        const encName = location.hash.substring(3);
        if (encName) {
            setTimeout(() => showSectionPage(encName), 300);
        }
    }

    // 支持直接通过 URL 打开关于页面
    if (location.hash === '#about') {
        setTimeout(() => showAboutPage(), 300);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
