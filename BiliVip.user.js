// ==UserScript==
// @name              Bilibili.tv VIP Video Bypass & Playback Optimizer (iOS Pro)
// @namespace         video_vip_bilibili_ios_pro
// @version           1.0.4
// @description       Mở khóa liên kết luồng phát đám mây và xử lý chạm cảm ứng cho Bilibili.tv trên Safari iOS
// @license           GPL-3.0 License
// @match             *://*.bilibili.tv/*
// @match             *://bilibili.tv/*
// @match             *://*.m.bilibili.tv/*
// @match             *://m.bilibili.tv/*
// @run-at            document-end
// @grant             unsafeWindow
// @grant             GM_addStyle
// @grant             GM_openInTab
// @grant             GM_getValue
// @grant             GM_setValue
// @grant             GM_xmlhttpRequest
// @charset		      UTF-8
// ==/UserScript==

const util = (function () {
    let mediaCleanerStarted = false;
    let mediaPlayBlocked = false;

    function stopMedia(media) {
        if (!media) return;
        try { media.pause(); } catch (e) {}
        try {
            media.autoplay = false;
            media.loop = false;
            media.muted = true;
            media.defaultMuted = true;
            media.volume = 0;
            media.playbackRate = 1;
            media.removeAttribute("autoplay");
            media.removeAttribute("src");
            media.srcObject = null;
            media.querySelectorAll("source").forEach((node) => node.remove());
            if (media.currentSrc || media.srcObject || media.querySelector("source")) {
                media.load();
            }
        } catch (e) {}
    }

    function mutePageMedia(root = document) {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll("video, audio").forEach((media) => stopMedia(media));
    }

    function blockNativeMediaPlayback() {
        if (mediaPlayBlocked || !window.HTMLMediaElement) return;
        mediaPlayBlocked = true;
        const rawPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
            stopMedia(this);
            return Promise.resolve();
        };
        document.addEventListener("play", (event) => {
            if (event.target instanceof HTMLMediaElement) stopMedia(event.target);
        }, true);
        document.addEventListener("playing", (event) => {
            if (event.target instanceof HTMLMediaElement) stopMedia(event.target);
        }, true);
        HTMLMediaElement.prototype.play.toString = () => rawPlay.toString();
    }

    function reomveVideo() {
        if (mediaCleanerStarted) {
            mutePageMedia();
            return;
        }
        mediaCleanerStarted = true;
        blockNativeMediaPlayback();
        mutePageMedia();
        setInterval(() => { mutePageMedia(); }, 500);
        const target = document.documentElement || document.body;
        if (!target || !window.MutationObserver) return;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "attributes" && mutation.target instanceof Element) {
                    if (mutation.target.matches("video, audio")) {
                        stopMedia(mutation.target);
                        return;
                    }
                }
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return;
                    if (node.matches && node.matches("video, audio")) {
                        stopMedia(node);
                        return;
                    }
                    mutePageMedia(node);
                });
            });
        });
        observer.observe(target, {childList: true, subtree: true, attributes: true, attributeFilter: ["src", "autoplay"]});
    }

    return {
        findTargetEle(selector) {
            return new Promise((resolve, reject) => {
                const el = document.querySelector(selector);
                if (el) { resolve(el); return; }
                let tryTime = 0;
                const maxTryTime = 120;
                const timer = setInterval(() => {
                    const el = document.querySelector(selector);
                    if (el) { clearInterval(timer); resolve(el); return; }
                    if ((++tryTime) === maxTryTime) {
                        clearInterval(timer);
                        reject(new Error('Không tìm thấy phân vùng phát video gốc.'));
                    }
                }, 500);
            });
        },
        reomveVideo: () => reomveVideo(),
        urlChangeReload() {
            let oldHref = window.location.href;
            let interval = setInterval(() => {
                let newHref = window.location.href;
                if (oldHref !== newHref) {
                    oldHref = newHref;
                    clearInterval(interval);
                    window.location.reload();
                }
            }, 1000);
        }
    };
})();

const superVip = (function () {
    const CONFIG = {
        isMobile: true,
        currentPlayerNode: null,
        vipBoxId: 'vip_jx_box' + Math.ceil(Math.random() * 100000000),
        iframeWrapperClass: 'vip_jx_iframe_wrapper',
        flag: "flag_vip",
        autoPlayerKey: "auto_player_key" + window.location.host,
        autoPlayerVal: "auto_player_value_" + window.location.host,
        directMode: false,
        manualPicked: false,
        cleanupTimer: null,
        wsyzyFsbBound: false,
        fullscreenCleanupBound: false,
        videoParseList: [
            {"name": "默认解析", "type": "1", "wsyzy": true},
            {"name": "TXNQ解析", "type": "1,3", "url": "https://txnp.cn"},
            {"name": "虾米解析", "type": "1,3", "url": "https://xmflv.com"},
            {"name": "剖元解析", "type": "1,3", "url": "https://pouyun.com"}
        ],
        playerContainers: [
            {
                host: "bilibili.tv", 
                container: ".bstar-video-wrap, .bstar-player-area, #bstar-player, .player-section, .video-container, .player-mobile, .m-video-player, .m-player, .video-wrap", 
                name: "Default", 
                displayNodes: [".bstar-cookie-info", ".vip-guide-container", ".ad-floor", ".m-video-sheet", ".open-app-float"],
                cleanupNodes: []
            }
        ]
    };

    function buildPlayerFrameLayout({isMobile, containerRect = {}, containerStyle = {}, viewportHeight = 0}) {
        const parsePixelValue = (value) => {
            const parsedValue = Number.parseFloat(value);
            return Number.isFinite(parsedValue) ? parsedValue : 0;
        };

        const width = parsePixelValue(containerRect.width) || window.innerWidth;
        const height = parsePixelValue(containerRect.height) || Math.round(width * 9 / 16);
        const resolvedHeight = Math.max(180, Math.min(height, window.innerHeight * 0.5));

        return {
            containerStyles: {
                overflow: "hidden", height: "auto", minHeight: `${resolvedHeight}px`
            },
            wrapperStyles: {
                position: "relative", display: "block", width: "100%", minHeight: `${resolvedHeight}px`,
                aspectRatio: "16 / 9", background: "#000", overflow: "hidden", zIndex: "2147483646"
            },
            iframeStyles: { position: "absolute", inset: "0", width: "100%", height: "100%", border: "none", display: "block", background: "#000" }
        };
    }

    function applyInlineStyles(element, styles) {
        Object.entries(styles || {}).forEach(([propertyName, propertyValue]) => {
            if (propertyValue === undefined || propertyValue === null || propertyValue === "") return;
            element.style[propertyName] = propertyValue;
        });
    }

    const _SITE_NAMES = '哔哩哔哩|bilibili|B站|Bilibili|Bstar';
    const _SITE_NAME_RE = new RegExp('(?:^|[\\s\\-_：:|｜，,。·]+)(?:' + _SITE_NAMES + ')(?=$|[\\s\\-_：:|｜，,。·]+)', 'gi');
    const _SITE_LEAD_RE = new RegExp('^(?:' + _SITE_NAMES + ')+', 'i');
    const _SITE_TAIL_RE = new RegExp('(?:[\\s\\-_：:|｜]+|^)(?:' + _SITE_NAMES + ')$', 'i');
    const _SITE_WORD_RE = new RegExp('^(?:' + _SITE_NAMES + ')$', 'i');

    function wsyzyCleanTitle(t) {
        t = (t || '').replace(/[《》【】「」]/g, '')
            .replace(_SITE_NAME_RE, ' ')
            .replace(_SITE_LEAD_RE, '')
            .replace(_SITE_TAIL_RE, '')
            .replace(/在线观看|高清正版|免费观看|完整版|正片|预告|全集/g, '');
        const parts = t.split(/[-_\s（(|｜]/)
            .map(s => s.replace(/第.+[集季部]/, '').trim())
            .filter(Boolean);
        return parts.find(p => p.length >= 2 && !_SITE_WORD_RE.test(p) && !/第\d{1,8}[集期话季]/.test(p)) || parts || '';
    }

    function readVideoTitle() {
        const PRECISE = {
            'bilibili.tv': '.bstar-video-title, h1.video-title, .ep-title, h1, title, .m-video-title'
        };
        const hn = location.hostname;
        for (const key of Object.keys(PRECISE)) {
            if (!hn.includes(key)) continue;
            for (const sel of PRECISE[key].split(',')) {
                const el = document.querySelector(sel.trim());
                if (!el) continue;
                const t = (el.getAttribute('title') || el.getAttribute('content') || el.textContent || '').trim();
                if (t && wsyzyCleanTitle(t)) return {title: wsyzyCleanTitle(t), trusted: true};
            }
        }
        const og = document.querySelector('meta[property="og:title"]');
        if (og) {
            const t = (og.getAttribute('content') || og.textContent || '').trim();
            if (t && wsyzyCleanTitle(t)) return {title: wsyzyCleanTitle(t), trusted: true};
        }
        return {title: wsyzyCleanTitle(document.title), trusted: false};
    }

    const wsyzyDirect = (function () {
        const SITE = 'https://wsyzy.cc';
        const API = 'https://wsyzy.net';
        const PLAYER = 'https://wsyzy.vip';

        function req(url) {
return new Promise((resolve, reject) => {GM_xmlhttpRequest({method: 'GET', url, timeout: 8000,onload: res => { if (res.status === 200 && res.responseText) resolve(res.responseText); else reject(new Error('Lỗi phản hồi hệ thống đám mây.')); },onerror: () => reject(new Error('Lỗi kết nối mạng iOS.')),ontimeout: () => reject(new Error('Hết thời gian chờ kết nối.'))});});}async function searchList(title) {const t = await req(${SITE}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(title)});const j = JSON.parse(t);return (j.list || []).filter(x => x.id && x.name);}async function searchCandidates(title) {let list = [];try { list = await searchList(title); } catch (e) {}if (!list.length) {await new Promise(r => setTimeout(r, 600));if (_aborted) return [];try { list = await searchList(title); } catch (e) {}}return list;}function rankCandidates(list, title) {const score = (x) => {if (x.name === title) return 4;if (x.name.startsWith(title)) return 3;if (x.name.includes(title)) return 2;if (title.length >= 2 && title.includes(x.name)) return 1;return 0;};const sorted = list.slice().sort((a, b) => score(b) - score(a));sorted.forEach(x => { x._score = score(x); });return sorted;}async function searchWithRetry(title) {let list = await searchCandidates(title);let usedTitle = title;if (!list.length && !aborted) {const alt = wsyzyCleanTitle(title);if (alt && alt !== title && alt.length >= 2) {toast(Thử tìm kiếm theo từ khóa [${alt}]..., false);usedTitle = alt;list = await searchCandidates(alt);}}return rankCandidates(list, usedTitle);}function isCleanTitle(t) {if (!t || t.length < 2) return false;const reSite = new RegExp('(?:^|[\s\-：:|｜，,。·])(?:' + SITE_NAMES + ')(?:$|[\s\-：:|｜，,。·])', 'i');const reLead = new RegExp('^(?:' + _SITE_NAMES + ')', 'i');if (reSite.test(t) || reLead.test(t)) return false;if (/在线观看|高清正版|免费观看|完整版|正片|预告/.test(t)) return false;return true;}async function waitStableTitle(onTick, maxWait = 10000, interval = 500) {const start = Date.now();let cur = readVideoTitle();if (cur.trusted && cur.title) return cur.title;let last = cur.title;let stableSince = Date.now();while (Date.now() - start < maxWait) {await new Promise(r => setTimeout(r, interval));if (_aborted) return last;cur = readVideoTitle();const elapsed = Math.round((Date.now() - start) / 1000);if (cur.trusted && cur.title) {onTick && onTick(elapsed, cur.title);return cur.title;}if (cur.title !== last) {last = cur.title;stableSince = Date.now();} else {const stableFor = Date.now() - stableSince;if ((stableFor >= 1500 && isCleanTitle(last)) || (stableFor >= 5000 && last)) {onTick && onTick(elapsed, last);return last;}}onTick && onTick(elapsed, last);}return last;}function parseEps(pu) {if (!pu) return [];return pu.split('$$$')[0].split('#').map(s => {const i = s.indexOf('$');return i > 0 ? { name: s.slice(0, i), url: s.slice(i + 1) } : { name: '', url: s };}).filter(e => /^https?:///.test(e.url));}async function getEpisodes(id) {const t = await req(${API}?ac=detail&ids=${id});const j = JSON.parse(t);const v = j.list && j.list[0];return parseEps(v && v.vod_play_url);}function curEpNum() {const text = document.title + ' ' + location.href;let m = text.match(/第?\s*(\d{1,8})\s*[集期话分]/);if (m) return parseInt(m, 10);m = location.href.match(/[?&]e=(\d{1,5})(?!\d)/i);if (m) return parseInt(m, 10);m = location.href.match(//ep(\d{1,5})(?!\d)/i);if (m) return parseInt(m, 10);return 0;}let _stopSuppressor = null;function startAdSoundSuppressor() {if (_stopSuppressor) return;const inOurs = (el) => el.closest && el.closest('.' + CONFIG.iframeWrapperClass);const silence = (m) => { try { if (!m.muted) m.muted = true; if (m.volume !== 0) m.volume = 0; } catch (e) {} };const handler = (ev) => {const m = ev.target;if (!m || !m.tagName || !/^(video|audio)$/i.test(m.tagName)) return;if (inOurs(m)) return;silence(m);};document.addEventListener('play', handler, true);document.addEventListener('playing', handler, true);document.addEventListener('volumechange', handler, true);const timer = setInterval(() => {const wrap = document.querySelector('.' + CONFIG.iframeWrapperClass);if (!wrap || !document.contains(wrap)) { stopAdSoundSuppressor(); return; }const scan = (doc) => doc.querySelectorAll('video,audio').forEach((m) => { if (!inOurs(m)) silence(m); });scan(document);document.querySelectorAll('iframe').forEach((f) => {if (inOurs(f)) return;let doc = null;try { doc = f.contentDocument; } catch (e) { return; }if (doc) { try { scan(doc); } catch (e) {} }});}, 400);_stopSuppressor = () => {clearInterval(timer);document.removeEventListener('play', handler, true);document.removeEventListener('playing', handler, true);document.removeEventListener('volumechange', handler, true);_stopSuppressor = null;};}function stopAdSoundSuppressor() { if (_stopSuppressor) _stopSuppressor(); }function takeover() {return new Promise((resolve, reject) => {util.findTargetEle(CONFIG.currentPlayerNode.container).then((container) => {if (_aborted) { reject(new Error('已取消')); return; }const cleanupSelectors = [...new Set(((CONFIG.currentPlayerNode.displayNodes || []).concat(CONFIG.currentPlayerNode.cleanupNodes || [])).filter(Boolean))];const cleanup = () => {cleanupSelectors.forEach((selector) => {document.querySelectorAll(selector).forEach((node) => {node.style.setProperty("display", "none", "important");});});};cleanup();if (CONFIG.cleanupTimer) clearInterval(CONFIG.cleanupTimer);CONFIG.cleanupTimer = setInterval(cleanup, 500);if (!CONFIG.wsyzyFsbBound) {document.addEventListener("fullscreenchange", cleanup);CONFIG.wsyzyFsbBound = true;}const frameLayout = buildPlayerFrameLayout({isMobile: true,containerRect: container.getBoundingClientRect(),containerStyle: { paddingTop: window.getComputedStyle(container).paddingTop },viewportHeight: window.innerHeight || document.documentElement.clientHeight || 0});container.innerHTML = '';util.reomveVideo();if (window.getComputedStyle(container).position === "static") container.style.position = "relative";applyInlineStyles(container, frameLayout.containerStyles);const wrapper = document.createElement("div");wrapper.className = CONFIG.iframeWrapperClass;applyInlineStyles(wrapper, frameLayout.wrapperStyles);const epBar = document.createElement("div");applyInlineStyles(epBar, {position: "absolute", top: "0", right: "0", bottom: "0", width: "170px",overflowX: "hidden", overflowY: "auto", zIndex: "2147483647", display: "none",background: "rgba(7,24,39,.94)", padding: "8px 6px", boxSizing: "border-box",borderRadius: "10px 0 0 10px", border: "1px solid rgba(14,165,233,.25)",borderRight: "none", boxShadow: "-6px 0 16px rgba(0,0,0,.45)"});const iframe = document.createElement("iframe");iframe.frameBorder = "0";iframe.allow = "autoplay; encrypted-media; fullscreen";iframe.allowFullscreen = true;iframe.referrerPolicy = "no-referrer";applyInlineStyles(iframe, frameLayout.iframeStyles);const placeholder = document.createElement("div");applyInlineStyles(placeholder, {position: "absolute", inset: "0", zIndex: "2147483646",display: "flex", alignItems: "center", justifyContent: "center",background: "#000", color: "#7dd3fc", fontSize: "15px",textAlign: "center", padding: "0 16px", lineHeight: "1.8",flexDirection: "column", gap: "6px"});placeholder.textContent = "Đang kết nối...";const askChoice = (candidates, detailMap) => new Promise((resolveChoice, rejectChoice) => {let settled = false;let watch = null;const finish = (fn, val) => {if (settled) return;settled = true;if (watch) clearInterval(watch);placeholder.style.position = 'absolute';placeholder.style.inset = '0';if (placeholder.parentNode && placeholder.parentNode !== wrapper) wrapper.appendChild(placeholder);fn(val);};placeholder.innerHTML = '';const head = document.createElement('div');head.textContent = 'Phát hiện nhiều phiên bản, vui lòng chọn nguồn phát:';applyInlineStyles(head, { fontSize: '13px', fontWeight: '600', color: '#7dd3fc', padding: '0 10px', lineHeight: '1.6' });const box = document.createElement('div');box.classList.add('wsyzy-no-scrollbar');applyInlineStyles(box, { width: 'min(440px, 94%)', maxHeight: '74%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' });candidates.forEach((c, i) => {const btn = document.createElement('button');btn.type = 'button';applyInlineStyles(btn, { display: 'block', width: '100%', padding: '8px 24px', borderRadius: '999px', background: 'rgba(255,255,255,.07)', color: '#fff', border: '1px solid rgba(255,255,255,.16)' });btn.textContent = c.name;btn.addEventListener('click', (ev) => { ev.stopPropagation(); finish(resolveChoice, c); });box.appendChild(btn);});placeholder.appendChild(head);placeholder.appendChild(box);if (placeholder.parentNode !== document.body) document.body.appendChild(placeholder);const ir = iframe.getBoundingClientRect();applyInlineStyles(placeholder, { position: 'fixed', left: ir.left+'px', top: ir.top+'px', width: ir.width+'px', height: ir.height+'px', display: 'flex' });watch = setInterval(() => { if (_aborted) finish(rejectChoice, new Error('已取消')); }, 300);});wrapper.appendChild(iframe);wrapper.appendChild(epBar);wrapper.appendChild(placeholder);container.appendChild(wrapper);resolve({iframe, epBar, wrapper, container,setStatus: (t) => { placeholder.textContent = t; placeholder.style.display = "flex"; },hidePlaceholder: () => { placeholder.style.display = "none"; },askChoice});}).catch((err) => {const bContainer = document.body;const frameLayout = buildPlayerFrameLayout({ isMobile: true });const wrapper = document.createElement("div");wrapper.className = CONFIG.iframeWrapperClass;applyInlineStyles(wrapper, { position: "fixed", top: "0", left: "0", width: "100vw", height: "56.25vw", zIndex: "99999" });const iframe = document.createElement("iframe");iframe.frameBorder = "0"; iframe.allowFullscreen = true;applyInlineStyles(iframe, frameLayout.iframeStyles);wrapper.appendChild(iframe);bContainer.appendChild(wrapper);resolve({ iframe, epBar: document.createElement("div"), wrapper, container: bContainer, setStatus:()=>{}, hidePlaceholder:()=>{}, askChoice:()=>Promise.resolve(candidates[0]) });});});}function mountEpBar(epBar, wrapper, load, eps, curIdx) {epBar.innerHTML = '';let current = curIdx;eps.forEach((ep, idx) => {const btn = document.createElement('span');btn.textContent = ep.name || ('Tập ' + (idx + 1));applyInlineStyles(btn, {display: 'block', margin: '4px 0', padding: '5px 10px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', textAlign: 'center',color: idx === current ? '#ffffff' : '#bae6fd', background: idx === current ? '#0369a1' : '#0b2942', border: '1px solid ' + (idx === current ? '#38bdf8' : '#155e75')});btn.addEventListener('click', (ev) => {ev.stopPropagation(); load(ep);[...epBar.children].forEach(c => { c.style.background = '#0b2942'; c.style.color = '#bae6fd'; });btn.style.background = '#0369a1'; btn.style.color = '#ffffff'; current = idx;});epBar.appendChild(btn);});}function toast(msg, autoHide) {let el = document.getElementById('wsyzy_toast');if (!el) {el = document.createElement('div'); el.id = 'wsyzy_toast';applyInlineStyles(el, { position: 'fixed', top: '12%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: '2147483647', background: 'rgba(7,24,39,.95)', color: '#bae6fd', padding: '10px 20px', borderRadius: '10px', fontSize: '13px' });document.body.appendChild(el);}el.textContent = msg; el.style.display = 'block';clearTimeout(el._timer);if (autoHide !== false) el._timer = setTimeout(() => { el.style.display = 'none'; }, 2500);}let _running = false, _aborted = false, _takeoverTimeout = false;function abort() { _aborted = true; stopAdSoundSuppressor(); if (CONFIG.cleanupTimer) { clearInterval(CONFIG.cleanupTimer); CONFIG.cleanupTimer = null; } }async function play() {if (_running) { toast('Đang tìm kiếm, vui lòng đợi...'); return; }_running = true; _aborted = false; _takeoverTimeout = false;let ui = null;try {startAdSoundSuppressor();const takeoverP = takeover(); takeoverP.catch(() => {});let raceTimer = setTimeout(() => { _takeoverTimeout = true; _aborted = true; }, 10000);ui = await takeoverP; clearTimeout(raceTimer);if (_aborted) throw new Error('已取消');const title = await waitStableTitle((sec, cur) => { ui.setStatus(cur ? Nhận diện phim: [${cur}] (${sec}s)... : Đang tải luồng dữ liệu (${sec}s)...); });if (_aborted) throw new Error('已取消');let checkTitle = title || "Anime";ui.setStatus(Đang tìm máy chủ đám mây cho [${checkTitle}]...);const candidates = await searchWithRetry(checkTitle);if (_aborted) throw new Error('已取消');if (!candidates.length) throw new Error(Dữ liệu chưa cập nhật phim này.);let hit = candidates[0];if (candidates.length > 1) {try { hit = await ui.askChoice(candidates, {}); } catch(e) { hit = candidates[0]; }}if (_aborted) throw new Error('已取消');ui.setStatus(Đang kết nối luồng phát...);const eps = await getEpisodes(hit.id);if (_aborted) throw new Error('已取消');if (!eps.length) throw new Error('Nguồn cấp rỗng, thử lại sau.');let idx = 0; const num = curEpNum();if (num > 0) { const f = eps.findIndex(e => { const m = e.name.match(/\d+/); return m && parseInt(m,10) === num; }); if (f >= 0) idx = f; }const load = (ep) => { if (!_aborted) ui.iframe.src = PLAYER + encodeURIComponent(ep.url); };load(eps[idx]); ui.hidePlaceholder(); mountEpBar(ui.epBar, ui.wrapper, load, eps, idx);toast('✓ Đồng bộ luồng phát thành công!');} catch (e) {toast('✗ ' + e.message); if (ui) ui.setStatus('✗ ' + e.message);if (!_aborted && CONFIG.cleanupTimer) { clearInterval(CONFIG.cleanupTimer); CONFIG.cleanupTimer = null; }stopAdSoundSuppressor();} finally { _running = false; }}return { play, stop: abort };})();class BaseConsumer {constructor() {this.parse = () => {util.findTargetEle('body').then((container) => this.preHandle(container)).then((container) => this.generateElement(container)).then((container) => this.bindEvent(container)).then((container) => this.autoPlay(container)).then((container) => this.postHandle(container));};}preHandle(container) {let matches = CONFIG.playerContainers.filter(value => location.hostname.includes(value.host));if (matches.length > 0) {CONFIG.currentPlayerNode = matches[0];} else {CONFIG.currentPlayerNode = CONFIG.playerContainers[0];}[...new Set(((CONFIG.currentPlayerNode.displayNodes || []).concat(CONFIG.currentPlayerNode.cleanupNodes || [])).filter(Boolean))].forEach((selector) => {document.querySelectorAll(selector).forEach((obj) => {obj.style.setProperty("display", "none", "important");});});return new Promise((resolve) => resolve(container));}generateElement(container) {GM_addStyle(#${CONFIG.vipBoxId} {cursor:pointer; position:fixed; top:140px; left:0px; z-index:2147483647; font-family:sans-serif;}  #${CONFIG.vipBoxId} .img_box{width:36px; height:36px; line-height:36px; text-align:center; color:#fff !important; background:#1e293b; margin:4px 0px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); font-size:11px; font-weight:bold;}  #${CONFIG.vipBoxId} .vip_icon > .img_box{background:#4f46e5; border-color:#818cf8;}  #${CONFIG.vipBoxId} #vip_auto{background:#0284c7;}  #${CONFIG.vipBoxId} #vip_reload{background:#dc2626;}  #${CONFIG.vipBoxId} .vip_list {display:none; position:absolute; border-radius:10px; left:40px; top:-10px; background:#0f172a; border:1px solid #38bdf8; padding:10px; width:200px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);}  #${CONFIG.vipBoxId} .vip_list li{border-radius:6px; font-size:12px; color:#f1f5f9; padding:8px; margin:6px 0; background:#1e293b; list-style:none; text-align:center; border:1px solid transparent;}  #${CONFIG.vipBoxId} .vip_list li:active{background:#0369a1; color:#fff; border-color:#0ea5e9;});let type_1_str = "";CONFIG.videoParseList.forEach((item, index) => {type_1_str += <li class="nq-li" data-index="${index}">${item.name}</li>;});let autoPlay = !!GM_getValue(CONFIG.autoPlayerKey, null) ? "MỞ" : "TẮT";const vipBoxNode = document.createElement('div');vipBoxNode.id = CONFIG.vipBoxId;vipBoxNode.innerHTML = <div class="vip_icon">  <div class="img_box">VIP</div>  <div class="vip_list">  <h4 style="color:#38bdf8; text-align:center; margin:0 0 8px 0; font-size:12px;">SERVER BSTAR iOS</h4>  <ul style="padding:0; margin:0;">${type_1_str}</ul>  </div>  </div>  <div class="img_box" id="vip_auto">${autoPlay}</div>  <div class="img_box" id="vip_reload">F5</div>;container.appendChild(vipBoxNode);return new Promise((resolve) => resolve(container));}bindEvent(container) {const vipBox = document.getElementById(CONFIG.vipBoxId);const vipIcon = vipBox.querySelector(".vip_icon");const vipList = vipBox.querySelector(".vip_list");const toggleList = (e) => {e.preventDefault(); e.stopPropagation();vipList.style.display = (vipList.style.display === "block") ? "none" : "block";};vipIcon.addEventListener("click", toggleList);vipIcon.addEventListener("touchstart", toggleList);const hideList = () => { vipList.style.display = "none"; };document.addEventListener("click", hideList);document.addEventListener("touchstart", hideList);const reloadBtn = vipBox.querySelector("#vip_reload");const doReload = (e) => {e.preventDefault(); e.stopPropagation();const iframe = document.querySelector(.${CONFIG.iframeWrapperClass} iframe);if (iframe) iframe.src = iframe.src;};reloadBtn.addEventListener("click", doReload);reloadBtn.addEventListener("touchstart", doReload);let _this = this;vipBox.querySelectorAll(".vip_list .nq-li").forEach(li => {const selectServer = function(e) {e.preventDefault(); e.stopPropagation();const index = parseInt(this.getAttribute("data-index"));CONFIG.manualPicked = true;GM_setValue(CONFIG.autoPlayerVal, index);_this.showPlayerWindow(CONFIG.videoParseList[index]);vipBox.querySelectorAll(".vip_list li").forEach(el => el.classList.remove("selected"));this.classList.add("selected");vipList.style.display = "none";};li.addEventListener("click", selectServer);li.addEventListener("touchstart", selectServer);});return new Promise((resolve) => resolve(container));}autoPlay(container) {const vipBox = document.getElementById(CONFIG.vipBoxId);const autoBtn = vipBox.querySelector("#vip_auto");const toggleAuto = function (e) {e.preventDefault(); e.stopPropagation();if (!!GM_getValue(CONFIG.autoPlayerKey, null)) {GM_setValue(CONFIG.autoPlayerKey, null); this.innerHTML = "TẮT";} else {GM_setValue(CONFIG.autoPlayerKey, "true"); this.innerHTML = "MỞ";}setTimeout(() => window.location.reload(), 200);};autoBtn.addEventListener("click", toggleAuto);autoBtn.addEventListener("touchstart", toggleAuto);if (!!GM_getValue(CONFIG.autoPlayerKey, null)) {let index = GM_getValue(CONFIG.autoPlayerVal, 0);setTimeout(() => {if (CONFIG.directMode || CONFIG.manualPicked) return;this.showPlayerWindow(CONFIG.videoParseList[index]);const activeLi = vipBox.querySelector(.vip_list [data-index="${index}"]);if (activeLi) activeLi.classList.add("selected");}, 1500);}return new Promise((resolve) => resolve(container));}showPlayerWindow(videoObj) {if (videoObj.wsyzy) { CONFIG.directMode = true; wsyzyDirect.play().catch(e => console.warn(e.message)); return; }CONFIG.directMode = false; wsyzyDirect.stop();util.findTargetEle(CONFIG.currentPlayerNode.container).then((container) => {const cleanupSelectors = [...new Set(((CONFIG.currentPlayerNode.displayNodes || []).concat(CONFIG.currentPlayerNode.cleanupNodes || [])).filter(Boolean))];const cleanup = () => {cleanupSelectors.forEach((selector) => {document.querySelectorAll(selector).forEach((node) => {node.style.setProperty("display", "none", "important");});});};cleanup(); if (CONFIG.cleanupTimer) clearInterval(CONFIG.cleanupTimer); CONFIG.cleanupTimer = setInterval(cleanup, 500);const frameLayout = buildPlayerFrameLayout({ isMobile: true, containerRect: container.getBoundingClientRect(), containerStyle: { paddingTop: window.getComputedStyle(container).paddingTop }, viewportHeight: window.innerHeight });container.innerHTML = '';util.reomveVideo();if (window.getComputedStyle(container).position === "static") container.style.position = "relative";applyInlineStyles(container, frameLayout.containerStyles);const iframeWrapper = document.createElement("div"); iframeWrapper.className = CONFIG.iframeWrapperClass;applyInlineStyles(iframeWrapper, frameLayout.wrapperStyles);const iframe = document.createElement("iframe"); iframe.src = videoObj.url + window.location.href; iframe.frameBorder = "0"; iframe.allow = "autoplay; encrypted-media; fullscreen"; iframe.allowFullscreen = true; iframe.referrerPolicy = "no-referrer";applyInlineStyles(iframe, frameLayout.iframeStyles);iframeWrapper.appendChild(iframe); container.appendChild(iframeWrapper);}).catch(() => {});}postHandle(container) { if (!!GM_getValue(CONFIG.autoPlayerKey, null)) { util.urlChangeReload(); } }}class DefaultConsumer extends BaseConsumer {}return {start: () => {GM_setValue(CONFIG.flag, null);const targetConsumer = new DefaultConsumer();targetConsumer.parse();}};})();(function () { superVip.start(); })();
