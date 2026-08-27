// ==UserScript==
// @name              Bilibili.tv VIP Web Bypass - Anti-App Shield (iOS)
// @namespace         video_vip_bilibili_anti_app_ios
// @version           1.0.6
// @description       Phá bỏ lệnh ép buộc mở App, chống chặn Premium và xử lý luồng phát Đám Mây trên Safari iOS
// @license           GPL-3.0 License
// @match             *://*.bilibili.tv/*
// @match             *://bilibili.tv/*
// @match             *://*.m.bilibili.tv/*
// @match             *://m.bilibili.tv/*
// @run-at            document-start
// @grant             unsafeWindow
// @grant             GM_addStyle
// @grant             GM_getValue
// @grant             GM_setValue
// @grant             GM_xmlhttpRequest
// @charset		      UTF-8
// ==/UserScript==

// LỚP CHẮN BẢO VỆ 1: Chặn đứng mọi hành vi kích hoạt App của Bilibili trước khi tải trang (document-start)
(function protectionShield() {
    const blockRedirect = function(e) {
        if (e && e.stopPropagation) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    };
    // Ghi đè hàm Deep Link phổ biến để vô hiệu hóa lệnh nhảy App Store / Mở App
    if (window.navigator) {
        Object.defineProperty(window.navigator, 'userAgent', {
            value: window.navigator.userAgent.replace(/iPhone|iPad/gi, 'Macintosh'), // Đánh lừa Bilibili rằng đây là máy Mac để tránh lớp chặn App di động
            writable: false
        });
    }
    // Chặn sự kiện click vào các thẻ điều hướng cài đặt ứng dụng độc hại
    document.addEventListener('click', function(e) {
        const target = e.target;
        if (target && (target.closest('.open-app-float') || target.closest('[href*="app.link"]') || target.closest('.m-video-sheet'))) {
            blockRedirect(e);
            e.preventDefault();
        }
    }, true);
})();

const util = (function () {
    let mediaCleanerStarted = false;
    let mediaPlayBlocked = false;

    function stopMedia(media) {
        if (!media) return;
        try { media.pause(); } catch (e) {}
        try {
            media.autoplay = false;
            media.removeAttribute("autoplay");
            media.removeAttribute("src");
            media.srcObject = null;
            media.querySelectorAll("source").forEach((node) => node.remove());
            if (media.currentSrc || media.srcObject || media.querySelector("source")) { media.load(); }
        } catch (e) {}
    }

    return {
        findTargetEle(selector) {
            return new Promise((resolve, reject) => {
                const el = document.querySelector(selector);
                if (el) { resolve(el); return; }
                let tryTime = 0;
                const timer = setInterval(() => {
                    const el = document.querySelector(selector);
                    if (el) { clearInterval(timer); resolve(el); return; }
                    if ((++tryTime) === 30) {
                        clearInterval(timer);
                        reject(new Error('Đang đồng bộ phân vùng video...'));
                    }
                }, 500);
            });
        },
        reomveVideo() {
            if (mediaCleanerStarted) return;
            mediaCleanerStarted = true;
            setInterval(() => {
                document.querySelectorAll("video, audio").forEach((media) => stopMedia(media));
            }, 800);
        }
    };
})();

const superVip = (function () {
    const CONFIG = {
        vipBoxId: 'vip_jx_box_shield_v3',
        iframeWrapperClass: 'vip_jx_iframe_wrapper_ios',
        videoParseList: [
            {"name": "Bstar Đám Mây", "wsyzy": true},
            {"name": "TXNQ VIP", "url": "https://txnp.cn"},
            {"name": "蝦米 Cloud", "url": "https://xmflv.com"}
        ],
        // Quét tất cả các cụm class chứa khung lỗi Premium màu đen để cưỡng chế thay thế
        selectors: ".bstar-video-wrap, .bstar-player-area, #bstar-player, .player-section, .video-container, .player-mobile, .m-video-player, .m-player, .video-wrap, .m-video-player-error, .vip-guide-container"
    };

    const wsyzyDirect = (function () {
        const SITE = 'https://wsyzy.cc';
        const API = 'https://wsyzy.net';
        const PLAYER = 'https://wsyzy.vip';

        function req(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET', url, timeout: 8000,
                    onload: res => { if (res.status === 200 && res.responseText) resolve(res.responseText); else reject(new Error('Lỗi phản hồi hệ thống đám mây.')); },
                    onerror: () => reject(new Error('Lỗi kết nối mạng iOS.')),
                    ontimeout: () => reject(new Error('Hết thời gian chờ kết nối.'))
                });
            });
        }
        
        function readVideoTitle() {
            const el = document.querySelector('.m-video-title, .bstar-video-title, h1, title');
            let t = el ? el.textContent : document.title;
            return (t || '').replace(/[《》【】「」]/g, '').replace(/哔哩哔哩|bilibili|B站|Bstar|在线观看|免费观看|完整版/gi, '').trim();
        }

        async function searchWithRetry(title) {
            try {
                const t = await req(`${SITE}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(title)}`);
                const j = JSON.parse(t);
                return j.list || [];
            } catch (e) { return []; }
        }

        async function getEpisodes(id) {
            try {
                const t = await req(`${API}?ac=detail&ids=${id}`);
                const j = JSON.parse(t);
                const v = j.list && j.list[0];
                if (!v || !v.vod_play_url) return [];
                return v.vod_play_url.split('$$$')[0].split('#').map(s => {
                    const i = s.indexOf('$');
                    return i > 0 ? { name: s.slice(0, i), url: s.slice(i + 1) } : { name: '', url: s };
                }).filter(e => /^https?:\/\//.test(e.url));
            } catch(e) { return []; }
        }

        function takeover(container) {
            container.innerHTML = '';
            util.reomveVideo();
            container.style.position = "relative";
            container.style.height = "230px";
            container.style.background = "#000";

            const wrapper = document.createElement("div");
            wrapper.className = CONFIG.iframeWrapperClass;
            wrapper.style.cssText = "position:absolute; inset:0; width:100%; height:100%; z-index:99999;";

            const iframe = document.createElement("iframe");
            iframe.frameBorder = "0";
            iframe.allow = "autoplay; encrypted-media; fullscreen";
            iframe.allowFullscreen = true;
            iframe.style.cssText = "width:100%; height:100%; display:block; background:#000;";

            const placeholder = document.createElement("div");
            placeholder.style.cssText = "position:absolute; inset:0; z-index:100000; display:flex; align-items:center; justify-content:center; background:#000; color:#38bdf8; font-size:14px;";
            placeholder.textContent = "Đang đồng bộ luồng đám mây...";

            wrapper.appendChild(iframe);
            wrapper.appendChild(placeholder);
            container.appendChild(wrapper);

            return { iframe, placeholder, hidePlaceholder: () => { placeholder.style.display = "none"; }, setStatus: (t) => { placeholder.textContent = t; } };
        }

        async function play(container, serverObj) {
            const ui = takeover(container);
            try {
                const title = readVideoTitle();
                ui.setStatus(`Đang tìm kiếm tập phim: ${title}...`);
                
                if (!serverObj.wsyzy) {
                    ui.iframe.src = serverObj.url + encodeURIComponent(window.location.href);
                    ui.hidePlaceholder();
                    return;
                }

                const list = await searchWithRetry(title);
                if (!list.length) throw new Error("Chưa cập nhật nguồn đám mây cho phim này.");
                
                const eps = await getEpisodes(list[0].id);
                if (!eps.length) throw new Error("Luồng phát trống.");
                
                ui.iframe.src = PLAYER + encodeURIComponent(eps[0].url);
                ui.hidePlaceholder();
            } catch (e) {
                ui.setStatus('✗ ' + e.message);
            }
        }
        return { play };
    })();

    class BaseConsumer {
        constructor() {
            this.init();
        }
        async init() {
            // Loại bỏ hoàn toàn các lớp phủ quảng cáo hoặc thông báo ép mở app của Bilibili bằng CSS Cưỡng chế
            GM_addStyle(`
                .open-app-float, .m-video-sheet, .vip-guide-container, .m-video-player-error button, .open-app-btn { display: none !important; opacity: 0 !important; pointer-events: none !important; }
                #${CONFIG.vipBoxId} { position: fixed; bottom: 20%; right: 15px; z-index: 2147483647; font-family: system-ui, sans-serif; }
                #${CONFIG.vipBoxId} .main_btn { width: 46px; height: 46px; line-height: 46px; text-align: center; color: #fff; background: linear-gradient(135deg, #6366f1, #a855f7); border-radius: 50%; font-weight: bold; font-size: 13px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); }
                #${CONFIG.vipBoxId} .menu_servers { display: none; position: absolute; bottom: 55px; right: 0; background: #0f172a; border: 1px solid #38bdf8; border-radius: 10px; padding: 6px; width: 130px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                #${CONFIG.vipBoxId} .menu_servers li { padding: 10px; color: #fff; font-size: 12px; text-align: center; list-style: none; background: #1e293b; margin: 5px 0; border-radius: 6px; border: 1px solid transparent; }
                #${CONFIG.vipBoxId} .menu_servers li:active { background: #0284c7; }
            `);

const body = await util.findTargetEle('body');this.buildUI(body);}buildUI(body) {if (document.getElementById(CONFIG.vipBoxId)) return;const container = document.createElement('div');container.id = CONFIG.vipBoxId;container.innerHTML = <div class="menu_servers"> <ul style="padding:0; margin:0;"> <li data-index="0">Bstar Cloud</li> <li data-index="1">Server VIP 1</li> <li data-index="2">Server VIP 2</li> </ul> </div> <div class="main_btn">VIP</div>;body.appendChild(container);const mainBtn = container.querySelector(".main_btn");const menu = container.querySelector(".menu_servers");const toggleMenu = (e) => {e.preventDefault(); e.stopPropagation();menu.style.display = (menu.style.display === "block") ? "none" : "block";};mainBtn.addEventListener("touchstart", toggleMenu, { passive: false });mainBtn.addEventListener("click", toggleMenu);document.addEventListener("touchstart", () => { menu.style.display = "none"; });container.querySelectorAll(".menu_servers li").forEach(li => {const triggerPlay = async (e) => {e.preventDefault(); e.stopPropagation();menu.style.display = "none";const index = parseInt(li.getAttribute("data-index"));try {const pContainer = await util.findTargetEle(CONFIG.selectors);wsyzyDirect.play(pContainer, CONFIG.videoParseList[index]);} catch(err) {alert("Vui lòng đợi trang web tải xong nội dung video rồi bấm lại.");}};li.addEventListener("touchstart", triggerPlay, { passive: false });li.addEventListener("click", triggerPlay);});}}return { start: () => { new BaseConsumer(); } };})();// Thực thi bọc bảo vệ ngay khi trang đang phản hồi cấu trúc dữ liệu thôif (document.readyState === 'loading') {document.addEventListener('DOMContentLoaded', () => { superVip.start(); });} else {superVip.start();}
