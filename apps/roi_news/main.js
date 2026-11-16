'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const mgu = require('./kit/mgu');
const { ScaledCanvas } = require('./kit/canvas');

const FEED = 'https://news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr';
const CACHE_FILE = 'news-cache.json';
const LIMIT = 20;

function decode(value) {
    return String(value || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([\da-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ').trim();
}

function field(xml, name) {
    const re = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i');
    const match = re.exec(xml);
    return match ? decode(match[1]) : '';
}

function parseFeed(xml) {
    const items = [], re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml)) && items.length < LIMIT) {
        const body = m[1];
        const title = field(body, 'title');
        if (!title) continue;
        let summary = field(body, 'description');
        const source = field(body, 'source');
        const link = field(body, 'link');
        summary = summary.replace(/\b(?:https?:\/\/\S+)/g, '').trim();
        if (summary.length > 420) summary = summary.slice(0, 417).replace(/\s+\S*$/, '') + '…';
        items.push({ title, summary, source, link, date: field(body, 'pubDate') });
    }
    return items;
}

function requestFeed(done) {
    let finished = false;
    const finish = (err, data) => { if (finished) return; finished = true; done(err, data); };
    const req = https.get(FEED, { headers: { 'User-Agent': 'roi-mgu-news/1.0 (BMW iDrive 7)' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            https.get(res.headers.location, { headers: { 'User-Agent': 'roi-mgu-news/1.0' } }, (next) => {
                let body = '';
                next.setEncoding('utf8');
                next.on('data', (chunk) => { body += chunk; if (body.length > 1500000) next.destroy(new Error('Feed is too large')); });
                next.on('end', () => finish(null, parseFeed(body)));
                next.on('error', (e) => finish(e));
            }).on('error', (e) => finish(e));
            return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return finish(new Error('Feed HTTP ' + res.statusCode)); }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; if (body.length > 1500000) req.destroy(new Error('Feed is too large')); });
        res.on('end', () => finish(null, parseFeed(body)));
        res.on('error', (e) => finish(e));
    });
    req.setTimeout(12000, () => req.destroy(new Error('Feed request timed out')));
    req.on('error', (e) => finish(e));
}

function fit(cv, value, size, width) {
    const source = String(value || '');
    if (cv.textWidth(source, size) <= width) return source;
    let s = source;
    while (s.length > 1 && cv.textWidth(s + '…', size) > width) s = s.slice(0, -1).trim();
    return s ? s + '…' : '';
}

mgu.run({
    async start(ctx) {
        const { ui, settings, log, widget } = ctx;
        const cachePath = path.join(ctx.dataDir, CACHE_FILE);
        let stories = [];
        let selected = 0;
        let updatedAt = 0;
        let retryAfter = 0;
        const smallWidgetText = Object.create(null);
        try {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (cached && Array.isArray(cached.stories)) {
                stories = cached.stories;
                updatedAt = cached.updatedAt || 0;
            }
        } catch (e) { /* first start or an incomplete cache */ }

        function refresh(force) {
            const interval = Number(settings.get('refreshMinutes') || 30) * 60000;
            if (!force && (Date.now() < retryAfter || Date.now() - updatedAt < interval)) return;
            requestFeed((err, result) => {
                if (err || !result || !result.length) {
                    retryAfter = Date.now() + 5 * 60000;
                    log.warn('news feed: ' + (err ? err.message : 'no stories'));
                    redraw();
                    return;
                }
                stories = result;
                retryAfter = 0;
                selected = Math.min(selected, stories.length - 1);
                updatedAt = Date.now();
                try { fs.writeFileSync(cachePath, JSON.stringify({ updatedAt, stories })); }
                catch (e) { log.warn('news cache: ' + e.message); }
                redraw();
            });
        }

        function draw(cv, width, height, index, compact) {
            const theme = ctx.theme();
            const bg = theme.bg || '#111820', text = theme.text || '#f4f6f8';
            const dim = theme.dim || '#9ba8b5', accent = theme.accent || '#2a8cff';
            const tile = width < 500;
            cv.clear(bg);
            cv.fillRect(0, 0, width, tile ? 4 : 8, accent);
            const story = stories.length ? stories[(index + stories.length) % stories.length] : null;
            const margin = tile ? 15 : 54;
            const titleSize = tile ? 19 : 42;
            const lineH = tile ? 24 : 58;
            const maxLines = tile ? 3 : 2;
            const title = story ? story.title : (updatedAt ? 'Haberler şu anda alınamıyor' : 'Haberler yükleniyor…');
            let lines = [];
            const words = String(title).split(/\s+/), limitW = width - margin * 2;
            let line = '';
            words.forEach((word) => {
                const candidate = line ? line + ' ' + word : word;
                if (line && cv.textWidth(candidate, titleSize, { font: 'bold' }) > limitW) {
                    lines.push(line); line = word;
                } else line = candidate;
            });
            if (line) lines.push(line);
            if (lines.length > maxLines) {
                lines = lines.slice(0, maxLines);
                lines[maxLines - 1] = fit(cv, lines[maxLines - 1], titleSize, limitW);
            }
            const startY = tile ? 29 : 76;
            lines.forEach((row, i) => cv.text(row, margin, startY + i * lineH, titleSize, text, { font: 'bold' }));
            if (story && !compact) {
                let summary = story.summary || 'Kaynağın sayfasını açmak için widget’a dokunun.';
                const descWords = summary.split(/\s+/), descLines = [];
                let current = '';
                const descSize = tile ? 14 : 24;
                const descLineH = tile ? 18 : 34;
                descWords.forEach((word) => {
                    const candidate = current ? current + ' ' + word : word;
                    if (current && cv.textWidth(candidate, descSize) > width - margin * 2) { descLines.push(current); current = word; }
                    else current = candidate;
                });
                if (current) descLines.push(current);
                descLines.slice(0, tile ? 3 : 3).forEach((row, i) => cv.text(fit(cv, row, descSize, width - margin * 2), margin, startY + lines.length * lineH + (tile ? 9 : 26) + i * descLineH, descSize, dim));
            }
            const footerY = height - (tile ? 14 : 20);
            const byline = story ? [story.source, story.date ? new Date(story.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''].filter(Boolean).join(' · ') : 'Google News RSS · Türkçe';
            cv.text(fit(cv, byline || 'Google News RSS · Türkçe', tile ? 11 : 19, width - margin * 2), margin, footerY, tile ? 11 : 19, dim);
            if (stories.length > 1) {
                const count = (index + 1) + '/' + stories.length;
                cv.text(count, width - margin, footerY, tile ? 11 : 19, dim, { align: 'right' });
            }
            return cv;
        }

        function redraw() {
            const cv = ctx.canvas(1600, 520);
            draw(cv, 1600, 520, selected, false);
            return ui.image('MAIN_GFX', cv);
        }

        ui.onClick('BTN_PREV', () => { if (stories.length) selected = (selected + stories.length - 1) % stories.length; redraw(); });
        ui.onClick('BTN_NEXT', () => { if (stories.length) selected = (selected + 1) % stories.length; redraw(); });
        ui.onClick('BTN_REFRESH', () => refresh(true));
        ctx.loop('MAIN', 1, redraw);

        if (widget) {
            widget.loop(1, (inst) => {
                if (!inst.visible) return null;
                if (!inst.big) {
                    const story = stories.length ? stories[selected % stories.length] : null;
                    const label = story ? story.title + (story.source ? ' · ' + story.source : '') : 'Haberler yükleniyor';
                    if (smallWidgetText[inst.spawnId] !== label) {
                        smallWidgetText[inst.spawnId] = label;
                        widget.set(inst.spawnId, 'TextRecordings', label, 'Text');
                    }
                    return null;
                }
                const spec = ctx.spec.startWidget || {}, size = spec.size || [384, 256];
                const scale = spec.scale || 1;
                const canvas = new ScaledCanvas(size[0], size[1], scale);
                draw(canvas, size[0], size[1], selected, false);
                return canvas.canvas;
            });
            widget.onTap(() => { selected = stories.length ? (selected + 1) % stories.length : 0; redraw(); });
        }

        refresh(false);
        const poll = setInterval(() => refresh(false), 60000);
        process.on('exit', () => clearInterval(poll));
        redraw();
        log.info('Haber Özeti hazır; kaynak Google News RSS (tr-TR).');
    }
});
