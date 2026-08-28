// ==UserScript==
// @name         Bilibili.tv iPhone Compatibility Helper
// @namespace    bilibili-tv-iphone-helper
// @version      1.0.0
// @description  Bilibili.tv userscript helper for Safari iPhone: SPA detection, player detection and mobile UI
// @match        https://bilibili.tv/*
// @match        https://*.bilibili.tv/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @charset      UTF-8
// ==/UserScript==

(function () {
    "use strict";

    const TAG = "[BiliTV-iOS]";

    const CONFIG = {
        buttonId: "bilitv_ios_helper",
        scanInterval: 1000,
        maxScan: 60
    };

    function log(...args) {
        console.log(TAG, ...args);
    }

    function addStyle() {
        if (typeof GM_addStyle === "function") {
            GM_addStyle(`
                #${CONFIG.buttonId} {
                    position: fixed !important;
                    right: 12px !important;
                    bottom: calc(18px + env(safe-area-inset-bottom)) !important;
                    z-index: 2147483647 !important;

                    width: 46px !important;
                    height: 46px !important;
                    border-radius: 50% !important;

                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;

                    background: #111827 !important;
                    color: #ffffff !important;
                    border: 1px solid rgba(255,255,255,.25) !important;

                    font-family: -apple-system, BlinkMacSystemFont,
                                 "Helvetica Neue", sans-serif !important;

                    font-size: 12px !important;
                    font-weight: 700 !important;

                    box-shadow: 0 5px 20px rgba(0,0,0,.35) !important;

                    -webkit-user-select: none !important;
                    user-select: none !important;
                    -webkit-tap-highlight-color: transparent !important;
                    touch-action: manipulation !important;
                }

                #${CONFIG.buttonId}:active {
                    transform: scale(.94);
                }

                #${CONFIG.buttonId}_panel {
                    position: fixed !important;
                    right: 12px !important;
                    bottom: calc(72px + env(safe-area-inset-bottom)) !important;
                    z-index: 2147483646 !important;

                    width: min(310px, calc(100vw - 24px)) !important;
                    max-height: 60vh !important;
                    overflow: auto !important;

                    padding: 14px !important;
                    box-sizing: border-box !important;

                    background: rgba(17,24,39,.97) !important;
                    color: #f9fafb !important;
                    border: 1px solid rgba(255,255,255,.18) !important;
                    border-radius: 14px !important;

                    font-family: -apple-system, BlinkMacSystemFont,
                                 "Helvetica Neue", sans-serif !important;

                    font-size: 13px !important;
                    line-height: 1.5 !important;

                    box-shadow: 0 12px 35px rgba(0,0,0,.45) !important;
                }

                #${CONFIG.buttonId}_panel[hidden] {
                    display: none !important;
                }

                #${CONFIG.buttonId}_panel .title {
                    font-weight: 700 !important;
                    font-size: 15px !important;
                    margin-bottom: 8px !important;
                }

                #${CONFIG.buttonId}_panel .row {
                    padding: 5px 0 !important;
                    border-bottom: 1px solid rgba(255,255,255,.08) !important;
                    word-break: break-word !important;
                }

                #${CONFIG.buttonId}_panel .ok {
                    color: #86efac !important;
                }

                #${CONFIG.buttonId}_panel .warn {
                    color: #fde68a !important;
                }

                #${CONFIG.buttonId}_panel button {
                    width: 100% !important;
                    min-height: 40px !important;
                    margin-top: 10px !important;

                    border: 0 !important;
                    border-radius: 9px !important;

                    background: #374151 !important;
                    color: white !important;

                    font-size: 13px !important;
                    font-weight: 600 !important;
                }
            `);
        }
    }

    function getVideoElements() {
        return Array.from(
            document.querySelectorAll("video, audio")
        );
    }

    function getPlayerCandidates() {
        const selectors = [
            "video",
            "video-container",
            "[class*='player']",
            "[class*='Player']",
            "[class*='video']",
            "[class*='Video']",
            "[id*='player']",
            "[id*='Player']",
            "[id*='video']",
            "[id*='Video']"
        ];

        const result = [];

        for (const selector of selectors) {
            try {
                document.querySelectorAll(selector).forEach(el => {
                    if (!result.includes(el)) {
                        result.push(el);
                    }
                });
            } catch (_) {}
        }

        return result;
    }

    function getStatus() {
        const videos = getVideoElements();
        const candidates = getPlayerCandidates();

        return {
            url: location.href,
            host: location.host,
            readyState: document.readyState,
            userAgent: navigator.userAgent,
            isIOS:
                /iPhone|iPad|iPod/i.test(navigator.userAgent),
            viewport:
                `${window.innerWidth} × ${window.innerHeight}`,
            videos: videos.length,
            playerCandidates: candidates.length,
            bodyExists: !!document.body
        };
    }

    function createPanel() {
        if (document.getElementById(CONFIG.buttonId)) {
            return;
        }

        const button = document.createElement("div");
        button.id = CONFIG.buttonId;
        button.textContent = "TV";

        const panel = document.createElement("div");
        panel.id = CONFIG.buttonId + "_panel";
        panel.hidden = true;

        document.body.appendChild(button);
        document.body.appendChild(panel);

        function refreshPanel() {
            const status = getStatus();

            panel.innerHTML = `
                <div class="title">Bilibili.tv · iPhone</div>

                <div class="row">
                    Host:
                    <span class="ok">${escapeHtml(status.host)}</span>
                </div>

                <div class="row">
                    DOM:
                    <span class="${status.bodyExists ? "ok" : "warn"}">
                        ${status.bodyExists ? "OK" : "WAIT"}
                    </span>
                </div>

                <div class="row">
                    Video:
                    <span class="${status.videos ? "ok" : "warn"}">
                        ${status.videos}
                    </span>
                </div>

                <div class="row">
                    Player candidates:
                    <span class="${status.playerCandidates ? "ok" : "warn"}">
                        ${status.playerCandidates}
                    </span>
                </div>

                <div class="row">
                    Viewport:
                    ${escapeHtml(status.viewport)}
                </div>

                <div class="row">
                    Ready:
                    ${escapeHtml(status.readyState)}
                </div>

                <button type="button" id="${CONFIG.buttonId}_scan">
                    Quét lại player
                </button>

                <button type="button" id="${CONFIG.buttonId}_reload">
                    Reload trang
                </button>
            `;

            const scanButton =
                document.getElementById(CONFIG.buttonId + "_scan");

            const reloadButton =
                document.getElementById(CONFIG.buttonId + "_reload");

            if (scanButton) {
                scanButton.onclick = () => {
                    scanPlayer();
                    refreshPanel();
                };
            }

            if (reloadButton) {
                reloadButton.onclick = () => {
                    location.reload();
                };
            }
        }

        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            panel.hidden = !panel.hidden;

            if (!panel.hidden) {
                refreshPanel();
            }
        }, { passive: false });

        document.addEventListener("touchstart", function (event) {
            if (
                !panel.hidden &&
                !panel.contains(event.target) &&
                event.target !== button
            ) {
                panel.hidden = true;
            }
        }, { passive: true });

        refreshPanel();
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function scanPlayer() {
        const videos = getVideoElements();
        const candidates = getPlayerCandidates();

        log("URL:", location.href);
        log("Video elements:", videos);
        log("Player candidates:", candidates);

        videos.forEach((video, index) => {
            log(`video[${index}]`, {
                src: video.currentSrc || video.src || "",
                width: video.videoWidth,
                height: video.videoHeight,
                paused: video.paused,
                readyState: video.readyState
            });
        });
    }

    function watchDOM() {
        if (!window.MutationObserver) {
            return;
        }

        const observer = new MutationObserver(() => {
            const button = document.getElementById(CONFIG.buttonId);

            if (!button && document.body) {
                createPanel();
            }
        });

        const target =
            document.documentElement || document;

        observer.observe(target, {
            childList: true,
            subtree: true
        });
    }

    function watchSPA() {
        let lastURL = location.href;

        const check = () => {
            if (location.href !== lastURL) {
                log("SPA navigation:", lastURL, "=>", location.href);
                lastURL = location.href;

                setTimeout(() => {
                    scanPlayer();
                }, 1000);
            }
        };

        setInterval(check, 500);
    }

    function waitForBody() {
        let count = 0;

        const timer = setInterval(() => {
            count++;

            if (document.body) {
                clearInterval(timer);

                log("Bilibili.tv userscript loaded");
                log("URL:", location.href);

                addStyle();
                createPanel();
                scanPlayer();
                watchDOM();
                watchSPA();

                return;
            }

            if (count >= CONFIG.maxScan) {
                clearInterval(timer);
                console.warn(TAG, "document.body not found");
            }
        }, CONFIG.scanInterval);
    }

    // Không thay đổi User-Agent native của Safari.
    // WebKit/iOS có thể chặn việc redefine navigator.userAgent.
    log("Script injected");

    waitForBody();

})();
