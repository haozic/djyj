'use strict';

/* ===== 状态管理 ===== */
const state = {
    meta: [],              // 文章元数据
    yearData: {},          // {2020: {url: {b, bm}}, ...}
    loadedYears: new Set(),
    loadingYears: new Set(),
    favorites: [],         // 收藏的URL列表
    currentMode: 'search',
    currentArticleUrl: null,
    searchTimer: null,
    fullTextReady: false,
};

const CN = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
const FAV_KEY = 'djyj_favorites';

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

async function loadYearData(year) {
    year = String(year);
    if (state.loadedYears.has(year) || state.loadingYears.has(year)) return;
    state.loadingYears.add(year);
    try {
        const resp = await fetch(`data/years/${year}.json`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        state.yearData[year] = await resp.json();
        state.loadedYears.add(year);
    } catch (e) {
        console.error(`加载 ${year} 年数据失败:`, e);
    } finally {
        state.loadingYears.delete(year);
    }
}

async function loadAllYearsBackground() {
    const years = [...new Set(state.meta.map(a => a.y))].sort((a, b) => b - a);
    const status = document.getElementById('searchStatus');
    status.className = 'search-status loading';
    status.textContent = '全文搜索加载中...';

    // 并行加载所有年份
    await Promise.all(years.map(y => loadYearData(y)));

    state.fullTextReady = true;
    status.className = 'search-status ready';
    status.textContent = '全文搜索就绪';

    // 重新搜索（如果有查询）
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
        state.favorites.unshift(url); // 最新的在前
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
function performSearch() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    const fy = document.getElementById('filterYear').value;
    const fs = document.getElementById('filterSection').value;
    const bo = document.getElementById('bodyOnly').checked;
    const container = document.getElementById('searchResults');
    const info = document.getElementById('resultInfo');

    let results = state.meta.filter(a => {
        if (fy && a.y != fy) return false;
        if (fs && a.s !== fs) return false;
        if (bo && !a.h) return false;
        if (query) {
            let matched = false;
            // 搜索标题、作者、板块
            const metaData = (a.t + ' ' + a.a + ' ' + a.s).toLowerCase();
            if (metaData.includes(query)) matched = true;
            // 搜索正文（如果已加载）
            if (!matched && a.h && state.fullTextReady) {
                const yd = state.yearData[String(a.y)];
                if (yd && yd[a.u] && yd[a.u].b) {
                    if (yd[a.u].b.toLowerCase().includes(query)) matched = true;
                }
            }
            if (!matched) return false;
        }
        return true;
    });

    const qDisplay = document.getElementById('searchInput').value.trim();
    let infoText = `共 ${results.length} 篇文章`;
    if (qDisplay) infoText += `（关键词："${qDisplay}"）`;
    if (!state.fullTextReady && query) infoText += ' · 全文搜索加载中，当前仅搜索标题/作者';
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
            if (a.h) {
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
            if (!snippet) snippet = '<span style="color:#ccc;">无正文</span>';
        } else {
            snippet = a.h ? '点击查看全文' : '<span style="color:#ccc;">无全文</span>';
        }

        const ci = a.i <= 12 ? CN[a.i - 1] : a.i;
        const favClass = isFavorite(a.u) ? 'active' : '';
        const favIcon = isFavorite(a.u) ? '★' : '☆';
        const noBodyTag = a.h ? '' : '<span class="rc-tag no-body">无全文</span>';

        html += `<div class="result-card" onclick="showArticle('${encodeURIComponent(a.u)}')">
            <button class="rc-fav-btn ${favClass}" onclick="event.stopPropagation(); toggleFavFromCard(this, '${encodeURIComponent(a.u)}')">${favIcon}</button>
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
    btn.textContent = active ? '★' : '☆';
}

/* ===== 文章详情 ===== */
async function showArticle(encUrl) {
    const url = decodeURIComponent(encUrl);
    const a = state.meta.find(x => x.u === url);
    if (!a) return;

    state.currentArticleUrl = url;
    const ci = a.i <= 12 ? CN[a.i - 1] : a.i;

    document.getElementById('modalTitle').textContent = a.t;
    document.getElementById('modalMeta').innerHTML =
        `${a.y}年第${ci}期 ｜ ${escHtml(a.s)}${a.a ? ' ｜ ' + escHtml(a.a) : ''}`;

    // 收藏按钮状态
    const favBtn = document.getElementById('modalFavBtn');
    const isFav = isFavorite(url);
    favBtn.classList.toggle('active', isFav);
    favBtn.textContent = isFav ? '★' : '☆';

    const bodyEl = document.getElementById('modalBody');

    if (!a.h) {
        bodyEl.innerHTML = '<div class="no-body">该文章无全文内容<br><small>可能为新闻汇总条目或专刊文献</small></div>';
    } else {
        bodyEl.innerHTML = '<div class="article-loading"><div class="spinner"></div><div>加载正文...</div></div>';

        // 确保年份数据已加载
        if (!state.loadedYears.has(String(a.y))) {
            await loadYearData(a.y);
        }

        const yd = state.yearData[String(a.y)];
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
            bodyEl.innerHTML = '<div class="no-body">无法加载正文</div>';
        }
    }

    // 底部链接
    const footer = document.getElementById('modalFooter');
    footer.innerHTML = a.u
        ? `<a href="${a.u}" target="_blank" rel="noopener">查看原文 ↗</a>`
        : '';

    document.getElementById('articleModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function toggleModalFav() {
    if (!state.currentArticleUrl) return;
    const url = state.currentArticleUrl;
    toggleFavorite(url);
    const isFav = isFavorite(url);
    const btn = document.getElementById('modalFavBtn');
    btn.classList.toggle('active', isFav);
    btn.textContent = isFav ? '★' : '☆';
    // 如果在收藏视图，刷新列表
    if (state.currentMode === 'favorites') renderFavorites();
    // 刷新搜索结果中的收藏状态
    if (state.currentMode === 'search') performSearch();
}

function closeModal() {
    document.getElementById('articleModal').classList.remove('active');
    document.body.style.overflow = '';
    state.currentArticleUrl = null;
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
            // 加粗
            processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            // 整段加粗 → 小标题样式
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
        html += `<div class="section-card" onclick="showSectionArticles('${encodeURIComponent(name)}')">
            <div class="sc-name">${escHtml(name)}</div>
            <div class="sc-bar"><div class="sc-bar-fill" style="width:${pct}%;"></div></div>
            <div class="sc-count">${count} 篇</div>
        </div>`;
    });
    container.innerHTML = html;
}

/* ===== 板块文章弹窗 ===== */
function showSectionArticles(encName) {
    const name = decodeURIComponent(encName);
    const articles = state.meta
        .filter(a => a.s === name)
        .sort((a, b) => b.y - a.y || a.i - b.i);

    document.getElementById('sectionModalName').textContent = name;
    document.getElementById('sectionModalCount').textContent = `${articles.length} 篇文章`;
    document.getElementById('sectionModalSearch').value = '';
    renderSectionModalBody(articles, '');
    document.getElementById('sectionModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function renderSectionModalBody(articles, query) {
    const body = document.getElementById('sectionModalBody');
    body.innerHTML = '';

    let filtered = articles;
    if (query) {
        const lq = query.toLowerCase();
        filtered = articles.filter(a =>
            (a.t + ' ' + a.a).toLowerCase().includes(lq)
        );
    }

    if (filtered.length === 0) {
        body.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">未找到匹配文章</div>';
        return;
    }

    // 按年份分组
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

        html += `<div class="modal-year-group"><div class="modal-year-header">${year}年 (${ya.length}篇)</div>`;
        issues.forEach(iss => {
            const ia = ig[iss];
            const cin = parseInt(iss) <= 12 ? CN[parseInt(iss) - 1] : iss;
            html += `<div class="modal-issue-group"><div class="modal-issue-label">${cin}期</div>`;
            ia.forEach(a => {
                const author = a.a ? `<span class="author">｜${escHtml(a.a)}</span>` : '';
                const encUrl = encodeURIComponent(a.u);
                html += `<div class="modal-article" onclick="closeSectionModal(); showArticle('${encUrl}')">${escHtml(a.t)}${author}</div>`;
            });
            html += `</div>`;
        });
        html += `</div>`;
    });

    body.innerHTML = html;
}

function filterSectionModal() {
    const q = document.getElementById('sectionModalSearch').value.trim();
    const name = document.getElementById('sectionModalName').textContent;
    const articles = state.meta
        .filter(a => a.s === name)
        .sort((a, b) => b.y - a.y || a.i - b.i);
    renderSectionModalBody(articles, q);
}

function closeSectionModal() {
    document.getElementById('sectionModal').classList.remove('active');
    document.body.style.overflow = '';
}

/* ===== 目录视图 ===== */
function renderCatalog() {
    const container = document.getElementById('catalogContent');
    if (container.children.length > 0) return; // 已渲染

    // 构建目录结构
    const catalog = {};
    state.meta.forEach(a => {
        if (!catalog[a.y]) catalog[a.y] = {};
        if (!catalog[a.y][a.i]) catalog[a.y][a.i] = {};
        if (!catalog[a.y][a.i][a.s]) catalog[a.y][a.i][a.s] = [];
        catalog[a.y][a.i][a.s].push(a);
    });

    const years = Object.keys(catalog).sort((a, b) => parseInt(b) - parseInt(a));
    let html = '';

    years.forEach(year => {
        const issues = Object.keys(catalog[year]).sort((a, b) => parseInt(a) - parseInt(b));
        let total = 0;
        issues.forEach(ik => total += Object.values(catalog[year][ik]).reduce((s, arr) => s + arr.length, 0));

        html += `<div class="year-block collapsed" id="yb-${year}">
            <div class="yb-header" onclick="toggleEl('yb-${year}')">
                <h3>${year}年</h3>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span class="yb-info">${issues.length}期 ｜ ${total}篇</span>
                    <span class="yb-toggle">▼</span>
                </div>
            </div>
            <div class="yb-body">`;

        issues.forEach(ik => {
            const secs = catalog[year][ik];
            const secNames = Object.keys(secs);
            let issueTotal = secNames.reduce((s, sn) => s + secs[sn].length, 0);
            const cin = parseInt(ik) <= 12 ? CN[parseInt(ik) - 1] : ik;

            html += `<div class="issue-row collapsed" id="ir-${year}-${ik}">
                <div class="ir-header" onclick="toggleEl('ir-${year}-${ik}')">
                    <span class="ir-title">${year}年第${cin}期</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="ir-count">${issueTotal}篇</span>
                        <span class="ir-toggle">▼</span>
                    </div>
                </div>
                <div class="ir-body">`;

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

            html += `</div></div>`;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;
    // 默认展开第一年
    const first = container.querySelector('.year-block');
    if (first) first.classList.remove('collapsed');
}

/* ===== 收藏视图 ===== */
function renderFavorites() {
    const container = document.getElementById('favoritesContent');

    if (state.favorites.length === 0) {
        container.innerHTML = `<div class="fav-empty">
            <div class="icon">⭐</div>
            <div>还没有收藏文章</div>
            <div style="font-size:13px;margin-top:8px;">在文章详情中点击 ☆ 即可收藏</div>
        </div>`;
        return;
    }

    // 获取收藏文章的元数据
    const favArticles = state.favorites
        .map(url => state.meta.find(a => a.u === url))
        .filter(a => a); // 过滤掉已不存在的文章

    let html = `<div class="fav-header">
        <div class="fh-count">⭐ 已收藏 ${favArticles.length} 篇</div>
        <div class="fh-actions">
            <button onclick="exportFavorites()">导出</button>
            <button onclick="clearFavorites()">清空</button>
        </div>
    </div>`;

    favArticles.forEach(a => {
        const ci = a.i <= 12 ? CN[a.i - 1] : a.i;
        const encUrl = encodeURIComponent(a.u);
        html += `<div class="result-card" onclick="showArticle('${encUrl}')">
            <button class="rc-fav-btn active" onclick="event.stopPropagation(); toggleFavFromCard(this, '${encUrl}')">★</button>
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

/* ===== 导航 ===== */
function switchMode(mode) {
    state.currentMode = mode;

    // 更新导航按钮
    document.querySelectorAll('.nav-tab, .bn-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // 切换视图
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewMap = { search: 'searchView', section: 'sectionView', catalog: 'catalogView', favorites: 'favoritesView' };
    const view = document.getElementById(viewMap[mode]);
    if (view) view.classList.add('active');

    // 搜索区只在搜索模式显示
    document.getElementById('searchSection').style.display = mode === 'search' ? '' : 'none';

    // 渲染对应视图
    if (mode === 'search') performSearch();
    else if (mode === 'section') renderSections();
    else if (mode === 'catalog') renderCatalog();
    else if (mode === 'favorites') renderFavorites();

    // 滚动到顶部
    window.scrollTo(0, 0);
}

/* ===== 工具函数 ===== */
function toggleEl(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}

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

function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/* ===== 初始化 ===== */
async function init() {
    // 加载收藏
    loadFavorites();
    updateFavBadges();

    // 绑定导航事件
    document.querySelectorAll('.nav-tab, .bn-item').forEach(btn => {
        btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });

    // 搜索输入（防抖）
    const debouncedSearch = debounce(performSearch, 250);
    document.getElementById('searchInput').addEventListener('input', e => {
        document.getElementById('searchClear').style.display = e.target.value ? 'flex' : 'none';
        debouncedSearch();
    });

    // 清除搜索
    document.getElementById('searchClear').addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        document.getElementById('searchClear').style.display = 'none';
        performSearch();
    });

    // 筛选器
    document.getElementById('filterYear').addEventListener('change', performSearch);
    document.getElementById('filterSection').addEventListener('change', performSearch);
    document.getElementById('bodyOnly').addEventListener('change', performSearch);

    // 弹窗背景关闭
    document.getElementById('articleModal').addEventListener('click', e => {
        if (e.target.id === 'articleModal') closeModal();
    });
    document.getElementById('sectionModal').addEventListener('click', e => {
        if (e.target.id === 'sectionModal') closeSectionModal();
    });

    // ESC 关闭弹窗
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal();
            closeSectionModal();
        }
    });

    // 加载元数据
    const ok = await loadMeta();
    if (!ok) {
        document.getElementById('searchResults').innerHTML =
            '<div class="loading"><div>数据加载失败，请刷新重试</div></div>';
        return;
    }

    // 填充筛选器
    const yearCounter = {};
    const sectionCounter = {};
    state.meta.forEach(a => {
        yearCounter[a.y] = (yearCounter[a.y] || 0) + 1;
        sectionCounter[a.s] = (sectionCounter[a.s] || 0) + 1;
    });

    const fy = document.getElementById('filterYear');
    Object.keys(yearCounter).sort((a, b) => b - a).forEach(y => {
        fy.innerHTML += `<option value="${y}">${y}年 (${yearCounter[y]}篇)</option>`;
    });

    const fs = document.getElementById('filterSection');
    Object.entries(sectionCounter)
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, count]) => {
            fs.innerHTML += `<option value="${escHtml(name)}">${escHtml(name)} (${count}篇)</option>`;
        });

    // 初始搜索（显示全部）
    performSearch();

    // 后台加载全文数据
    loadAllYearsBackground();
}

// 启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
