// ==UserScript==
// @name              Bilibili.tv VIP Video Bypass & Playback Optimizer (iOS Pro Fix)
// @namespace         video_vip_bilibili_ios_pro_fix
// @version           1.0.5
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
        setInterval(() => { mutePageMedia(); }, 1000);
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
                const maxTryTime = 60;
                const timer = setInterval(() => {
                    const el = document.querySelector(selector);
                    if (el) { clearInterval(timer); resolve(el); return; }
                    if ((++tryTime) === maxTryTime) {
                        clearInterval(timer);
                        reject(new Error('Không tìm thấy phân vùng phát video gốc.'));
                    }
                }, 1000);
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
        vipBoxId: 'vip_jx_box_ios_fix',
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
                displayNodes: [".bstar-cookie-info", ".vip-guide-container", ".ad-floor", ".m-video-sheet", ".open-app-float", ".m-video-player-error"],
                cleanupNodes: []
            }
        ]
    };

    function buildPlayerFrameLayout({isMobile, containerRect = {}, containerStyle = {}, viewportHeight = 0}) {
        const width = containerRect.width || window.innerWidth;
        const height = containerRect.height || Math.round(width * 9 / 16);
        const resolvedHeight = Math.max(200, Math.min(height, window.innerHeight * 0.5));

        return {
            containerStyles: { overflow: "hidden", height: `${resolvedHeight}px`, minHeight: `${resolvedHeight}px` },
            wrapperStyles: { position: "relative", display: "block", width: "100%", height: "100%", background: "#000", overflow: "hidden", zIndex: "2147483646" },
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
        return {title: wsyzyCleanTitle(document.title), trusted: false};
    }

    const wsyzyDirect = (function () {
        const SITE = 'https://wsyzy.cc';
        const API = 'https://wsyzy.net';
        const PLAYER = 'https://wsyzy.vip';

        function req(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET', url, timeout: 8000,
                    onload: res => { if (res.status === 200 && res.responseText) resolve(res.responseText); else reject(new Error('Lỗi máy chủ đám mây.')); },
                    onerror: () => reject(new Error('Lỗi mạng iOS.')),
                    ontimeout: () => reject(new Error('Hết thời gian chờ kết nối.'))
                });
            });
        }
        async function searchList(title) {
const t = await req(${SITE}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(title)});const j = JSON.parse(t);return (j.list || []).filter(x => x.id && x.name);}async function searchCandidates(title) {let list = [];try { list = await searchList(title); } catch (e) {}return list;}function rankCandidates(list, title) {return list.slice().sort((a, b) => b.name.includes(title) - a.name.includes(title));}async function searchWithRetry(title) {let list = await searchCandidates(title);if (!list.length) {const alt = wsyzyCleanTitle(title);if (alt && alt !== title) list = await searchCandidates(alt);}return rankCandidates(list, title);}async function waitStableTitle() {await new Promise(r => setTimeout(r, 1000));return readVideoTitle().title || "Anime";}function parseEps(pu) {if (!pu) return [];return pu.split('$$$')[0].split('#').map(s => {const i = s.indexOf('$');return i > 0 ? { name: s.slice(0, i), url: s.slice(i + 1) } : { name: '', url: s };}).filter(e => /^https?:///.test(e.url));}async function getEpisodes(id) {const t = await req(${API}?ac=detail&ids=${id});const j = JSON.parse(t);return parseEps(j.list && j.list[0] && j.list[0].vod_play_url);}function curEpNum() {const text = document.title + ' ' + location.href;let m = text.match(/第?\s*(\d{1,8})\s*[集期话分]/);if (m) return parseInt(m, 10);return 0;}function takeover() {return new Promise((resolve, reject) => {util.findTargetEle(CONFIG.currentPlayerNode.container).then((container) => {const cleanup = () => {CONFIG.currentPlayerNode.displayNodes.forEach((selector) => {document.querySelectorAll(selector).forEach((node) => { node.style.setProperty("display", "none", "important"); });});};cleanup();CONFIG.cleanupTimer = setInterval(cleanup, 1000);const frameLayout = buildPlayerFrameLayout({ isMobile: true, containerRect: container.getBoundingClientRect() });container.innerHTML = '';util.reomveVideo();applyInlineStyles(container, frameLayout.containerStyles);const wrapper = document.createElement("div");wrapper.className = CONFIG.iframeWrapperClass;applyInlineStyles(wrapper, frameLayout.wrapperStyles);const iframe = document.createElement("iframe");iframe.frameBorder = "0"; iframe.allowFullscreen = true;applyInlineStyles(iframe, frameLayout.iframeStyles);const placeholder = document.createElement("div");applyInlineStyles(placeholder, { position: "absolute", inset: "0", zIndex: "2147483646", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "#7dd3fc" });placeholder.textContent = "Đang đồng bộ luồng đám mây...";wrapper.appendChild(iframe); wrapper.appendChild(placeholder); container.appendChild(wrapper);resolve({ iframe, wrapper, container, setStatus: (t) => { placeholder.textContent = t; }, hidePlaceholder: () => { placeholder.style.display = "none"; } });}).catch(reject);});}async function play() {let ui = null;try {ui = await takeover();const title = await waitStableTitle();ui.setStatus(Đang quét tập phim: ${title}...);const candidates = await searchWithRetry(title);if (!candidates.length) throw new Error("Hệ thống chưa cập nhật tập này.");const eps = await getEpisodes(candidates[0].id);if (!eps.length) throw new Error("Luồng rỗng.");let idx = 0; const num = curEpNum();if (num > 0) { const f = eps.findIndex(e => e.name.includes(num)); if (f >= 0) idx = f; }ui.iframe.src = PLAYER + encodeURIComponent(eps[idx].url);ui.hidePlaceholder();toast('✓ Đồng bộ thành công!');} catch (e) {if (ui) ui.setStatus('✗ ' + e.message);toast('✗ ' + e.message);}}return { play, stop: () => {} };})();class BaseConsumer {constructor() {this.parse = () => {util.findTargetEle('body').then((container) => {this.generateElement(container);this.bindEvent(container);this.autoPlay(container);});};}generateElement(container) {GM_addStyle(#${CONFIG.vipBoxId} {position: fixed; top: 35%; left: 10px; z-index: 999999; font-family: sans-serif;} #${CONFIG.vipBoxId} .btn_vip {width: 44px; height: 44px; line-height: 44px; text-align: center; color: #fff; background: #4f46e5; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.3); font-weight: bold; font-size: 13px;} #${CONFIG.vipBoxId} .vip_list {display: none; position: absolute; left: 50px; top: 0; background: #0f172a; border: 1px solid #38bdf8; border-radius: 8px; padding: 6px; width: 140px;} #${CONFIG.vipBoxId} .vip_list li {padding: 8px; color: #fff; font-size: 12px; text-align: center; list-style: none; background: #1e293b; margin: 4px 0; border-radius: 4px;});const box = document.createElement('div');box.id = CONFIG.vipBoxId;box.innerHTML = <div class="btn_vip">VIP</div> <div class="vip_list"> <ul style="padding:0; margin:0;"> <li class="nq-li" data-index="0">Bstar Đám Mây</li> <li class="nq-li" data-index="1">Server Dự Phòng 1</li> <li class="nq-li" data-index="2">Server Dự Phòng 2</li> </ul> </div>;container.appendChild(box);}bindEvent(container) {const box = document.getElementById(CONFIG.vipBoxId);const btn = box.querySelector(".btn_vip");const list = box.querySelector(".vip_list");const toggle = (e) => { e.preventDefault(); e.stopPropagation(); list.style.display = (list.style.display === "block") ? "none" : "block"; };btn.addEventListener("click", toggle);btn.addEventListener("touchstart", toggle);document.addEventListener("touchstart", () => { list.style.display = "none"; });let _this = this;box.querySelectorAll(".nq-li").forEach(li => {const run = function(e) {e.preventDefault(); e.stopPropagation();const index = parseInt(this.getAttribute("data-index"));_this.showPlayerWindow(CONFIG.videoParseList[index]);list.style.display = "none";};li.addEventListener("click", run);li.addEventListener("touchstart", run);});}autoPlay(container) {setTimeout(() => { this.showPlayerWindow(CONFIG.videoParseList[0]); }, 2500);}showPlayerWindow(videoObj) {if (videoObj.wsyzy) { wsyzyDirect.play(); return; }util.findTargetEle(CONFIG.currentPlayerNode.container).then((container) => {const frameLayout = buildPlayerFrameLayout({ isMobile: true, containerRect: container.getBoundingClientRect() });container.innerHTML = '';util.reomveVideo();applyInlineStyles(container, frameLayout.containerStyles);const wrapper = document.createElement("div"); wrapper.className = CONFIG.iframeWrapperClass;applyInlineStyles(wrapper, frameLayout.wrapperStyles);const iframe = document.createElement("iframe"); iframe.src = videoObj.url + window.location.href; iframe.frameBorder = "0"; iframe.allowFullscreen = true;applyInlineStyles(iframe, frameLayout.iframeStyles);wrapper.appendChild(iframe); container.appendChild(wrapper);}).catch(()=>{});}}return { start: () => { new BaseConsumer().parse(); } };})();// Trì hoãn khởi động chạy sau khi DOM ổn định trên iOSwindow.addEventListener('load', () => {setTimeout(() => { superVip.start(); }, 1500);});
