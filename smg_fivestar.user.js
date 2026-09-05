// ==UserScript==
// @name             收看SMGTV电视节目
// @namespace        http://tampermonkey.net/
// @version          0.11
// @description      打开网页即可收看SMGTV，并解除试看倒计时与切页暂停等限制
// @author           https://github.com/Popukok
// @match            *://*.kankanews.com/huikan*
// @icon             https://live.kankanews.com/favicon.ico
// @updateURL        https://raw.githubusercontent.com/adamllll/smg_live/refs/heads/main/smg_fivestar.user.js
// @downloadURL      https://raw.githubusercontent.com/adamllll/smg_live/refs/heads/main/smg_fivestar.user.js
// @grant            none
// @run-at           document-start
// ==/UserScript==


(function() {
    'use strict';
    const STYLE_ID = 'smgtv-unlock-style';
    const VIDEO_READY_CLASS = 'smgtv-video-ready';
    const FULLSCREEN_FALLBACK_CLASS = 'smgtv-fallback-fullscreen';
    const FULLSCREEN_TARGET_CLASS = 'smgtv-fallback-fullscreen-target';
    const FULLSCREEN_BUTTON_SELECTOR = '.xgplayer-fullscreen';
    const VIDEO_READY_EVENTS = ['loadeddata', 'canplay', 'playing', 'timeupdate', 'progress'];
    const VIDEO_RESET_EVENTS = ['loadstart', 'waiting', 'stalled', 'emptied'];
    const watchedVideos = new WeakSet();
    let fullscreenFallbackTarget = null;
    let cssFullscreenFallbackPlayer = null;
    let lastFullscreenActionAt = 0;
    // ===== 流地址缓存（被动捕获 + 主动取流共用）=====
    // liveAddressCache：加密 live_address（主动经 app 接口取回或从响应捕获）
    // streamAddressCache：channel/detail 响应里见到的 live/shift 地址（被动捕获，供空地址回补）
    // channelShiftBaseCache / channelLiveBaseCache：播放器实际使用过的解密后 m3u8 基址（回看拼时间窗用，带 TTL）
    const liveAddressCache = new Map();
    const streamAddressCache = Object.create(null);
    const channelShiftBaseCache = Object.create(null);
    const channelLiveBaseCache = Object.create(null);
    const SHIFT_TTL = 12 * 60 * 60 * 1000;
    const LIVE_TTL = 3 * 60 * 60 * 1000;
    // 日志节流：节目轮询等高频路径下避免同一日志刷屏
    const logThrottle = Object.create(null);
    function throttleLog(key, intervalMs, fn) {
        const now = Date.now();
        if ((logThrottle[key] || 0) + intervalMs > now) {
            return;
        }
        logThrottle[key] = now;
        fn();
    }
    // 被动捕获：channel/detail 响应中见到地址就记住（含 shift，回看备用）
    function rememberStreamAddresses(channelId, liveAddress, shiftAddress) {
        if (channelId == null || channelId === '') {
            return;
        }
        const key = String(channelId);
        const prev = streamAddressCache[key] || { live_address: '', shift_address: '' };
        streamAddressCache[key] = {
            live_address: liveAddress || prev.live_address || '',
            shift_address: shiftAddress || prev.shift_address || ''
        };
    }
    // 被动回补：目标对象地址为空时用缓存填充（live 缺则用 shift 兜底，反之亦然）
    function fillStreamAddresses(target, channelId) {
        if (!target) {
            return;
        }
        const cached = streamAddressCache[String(channelId)] || {};
        const channelLiveAddress = cached.live_address || cached.shift_address;
        const channelShiftAddress = cached.shift_address || cached.live_address;
        if (channelLiveAddress && !target.live_address) {
            target.live_address = channelLiveAddress;
        }
        if (channelShiftAddress && !target.shift_address) {
            target.shift_address = channelShiftAddress;
        }
    }
    function injectStyle(cssText) {
        const appendStyle = () => {
            if (document.getElementById(STYLE_ID)) {
                return;
            }
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = cssText;
            (document.head || document.documentElement).appendChild(style);
        };
        if (document.head || document.documentElement) {
            appendStyle();
        } else {
            document.addEventListener('DOMContentLoaded', appendStyle, { once: true });
        }
    }
    // 移动端：viewport-fit=cover 让 iPhone 刘海屏全屏样式能吃到 safe-area-inset
    function ensureViewportFitCover() {
        const apply = () => {
            try {
                const meta = document.querySelector('meta[name="viewport"]');
                if (meta) {
                    const content = meta.getAttribute('content') || '';
                    if (!/viewport-fit\s*=\s*cover/i.test(content)) {
                        meta.setAttribute('content', content ? content + ', viewport-fit=cover' : 'viewport-fit=cover');
                    }
                    return;
                }
                const created = document.createElement('meta');
                created.setAttribute('name', 'viewport');
                created.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
                (document.head || document.documentElement).appendChild(created);
            } catch (e) {
                throttleLog('viewport-error', 5000, () => console.warn('[SMGTV] 设置 viewport-fit 失败:', e));
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', apply, { once: true });
        } else {
            apply();
        }
    }
    function getVueInstance(el) {
        return el?.__vue__ || el?.__vueParentComponent?.proxy || null;
    }
    function isTVComponent(instance) {
        return !!instance && (
            typeof instance.initPlayer === 'function' ||
            typeof instance.playProgram === 'function' ||
            typeof instance.setLiveTimer === 'function' ||
            ('isLoading' in instance && 'player' in instance)
        );
    }
    function findComponentFromElement(el) {
        let current = el;
        while (current) {
            const instance = getVueInstance(current);
            if (isTVComponent(instance)) {
                return instance;
            }
            current = current.parentElement;
        }
        return null;
    }
    function findTVComponent() {
        const selectors = ['.huikan', '.live-container', '.live-box', '.live-player', '.tv', '.player-box'];
        for (const selector of selectors) {
            const component = findComponentFromElement(document.querySelector(selector));
            if (component) {
                return component;
            }
        }
        return null;
    }
    function getPlayerVideo(component) {
        const player = component?.player;
        return player?.video ||
            player?.media ||
            player?.root?.querySelector?.('video') ||
            component?.$refs?.livePlayer?.querySelector?.('video') ||
            document.querySelector('.live-player video, .player-box video, .xgplayer video, video');
    }
    function isVideoReady(video) {
        return !!video && !video.error && (
            video.readyState >= 2 ||
            (!video.paused && video.currentTime > 0)
        );
    }
    function setVideoReadyClass(isReady) {
        const target = document.body || document.documentElement;
        target?.classList?.toggle(VIDEO_READY_CLASS, isReady);
    }
    function syncLoadingState(component) {
        const video = getPlayerVideo(component);
        if (video) {
            watchPlayerVideo(component, video);
        }
        const isReady = isVideoReady(video);
        setVideoReadyClass(isReady);
        if (isReady && component && component.isLoading) {
            component.isLoading = false;
            console.log('[SMGTV] 已同步播放器 loading 状态');
        }
        // 持续自愈：播放器报错（空 url 创建的废播放器）时回填地址并重建（带次数上限，防死循环）
        recoverPlayerIfNeeded(component);
        return isReady;
    }
    // 播放器媒体级报错自愈：initPlayer 用空 url 建出的播放器 video.error.code===4（媒体格式错误）
    function recoverPlayerIfNeeded(component) {
        if (!component || typeof component.initPlayer !== 'function' || component.__smgRecovering) {
            return;
        }
        const video = getPlayerVideo(component);
        const mediaError = video?.error;
        if (!(component.player && mediaError && mediaError.code === 4)) {
            return;
        }
        component.__smgRecoverCount = (component.__smgRecoverCount || 0) + 1;
        if (component.__smgRecoverCount > 3) {
            return;
        }
        component.__smgRecovering = true;
        try {
            unshieldProgram(component.programObj);
            unshieldProgram(component.programDetail);
            if (isLiveAddressEmpty(component)) {
                refillLiveAddress(component);
            } else {
                component.initPlayer({ changeCurrentList: false, isPlay: true, trigger: 'click' });
                console.log('[SMGTV] 已自愈重建报错播放器');
            }
        } catch (e) {
            console.warn('[SMGTV] 播放器报错自愈失败', e);
        } finally {
            setTimeout(() => { component.__smgRecovering = false; }, 2000);
        }
    }
    function watchPlayerVideo(component, video) {
        if (!video || watchedVideos.has(video)) {
            return;
        }
        watchedVideos.add(video);
        const markReady = () => syncLoadingState(component);
        const resetReady = () => {
            if (!isVideoReady(video)) {
                setVideoReadyClass(false);
            }
        };
        VIDEO_READY_EVENTS.forEach(eventName => {
            video.addEventListener(eventName, markReady, { passive: true });
        });
        VIDEO_RESET_EVENTS.forEach(eventName => {
            video.addEventListener(eventName, resetReady, { passive: true });
        });
        // iOS 原生视频全屏的按钮态同步
        video.addEventListener('webkitbeginfullscreen', () => syncFullscreenButtonState(component, true), { passive: true });
        video.addEventListener('webkitendfullscreen', () => syncFullscreenButtonState(component, false), { passive: true });
        markReady();
    }
    // 组件清理：SPA 路由切换会把播放器组件从 DOM 摘除，定时器/observer 会残留并对新组件失效。
    // 检测到 $el 脱离 DOM 时清干净并重新扫描新组件（借鉴原作者方案）
    function cleanupComponent(component) {
        if (!component) {
            return;
        }
        if (component.__smgLoadingMonitor) {
            clearInterval(component.__smgLoadingMonitor);
            component.__smgLoadingMonitor = null;
        }
        if (component.__smgLoadingObserver) {
            component.__smgLoadingObserver.disconnect();
            component.__smgLoadingObserver = null;
        }
        if (component.pageVisibilityChange) {
            document.removeEventListener('visibilitychange', component.pageVisibilityChange);
        }
    }
    function startLoadingMonitor(component) {
        if (!component || component.__smgLoadingMonitor) {
            return;
        }
        component.__smgLoadingMonitor = setInterval(() => {
            // $el 脱离 DOM 说明组件已被销毁，清理并转去补新组件
            const rootEl = component.$el;
            if (rootEl && !rootEl.isConnected) {
                cleanupComponent(component);
                initComponentPatch();
                return;
            }
            syncLoadingState(component);
        }, 500);
        if (component.$refs?.livePlayer && !component.__smgLoadingObserver) {
            component.__smgLoadingObserver = new MutationObserver(() => syncLoadingState(component));
            component.__smgLoadingObserver.observe(component.$refs.livePlayer, {
                childList: true,
                subtree: true
            });
        }
    }
    function getBrowserFullscreenElement() {
        return document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            null;
    }
    function requestElementFullscreen(el) {
        if (!el) {
            return Promise.reject(new Error('missing fullscreen target'));
        }
        const request =
            el.requestFullscreen ||
            el.webkitRequestFullscreen ||
            el.webkitRequestFullScreen ||
            el.mozRequestFullScreen ||
            el.msRequestFullscreen;
        if (!request) {
            return Promise.reject(new Error('fullscreen api unavailable'));
        }
        try {
            const result = request.call(el);
            return result && typeof result.then === 'function' ? result : Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }
    function exitBrowserFullscreen() {
        const exit =
            document.exitFullscreen ||
            document.webkitExitFullscreen ||
            document.webkitCancelFullScreen ||
            document.mozCancelFullScreen ||
            document.msExitFullscreen;
        if (!exit) {
            return Promise.resolve();
        }
        try {
            const result = exit.call(document);
            return result && typeof result.then === 'function' ? result : Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }
    function getFullscreenTarget(component, button) {
        return component?.player?.root ||
            button?.closest?.('.xgplayer') ||
            component?.$refs?.livePlayer?.querySelector?.('.xgplayer') ||
            component?.$refs?.livePlayer ||
            document.querySelector('.live-player .xgplayer, .player-box .xgplayer, .xgplayer, .live-player, .player-box');
    }
    function syncFullscreenButtonState(component, isFullscreen) {
        // 只同步按钮 data-state，不直写 player.fullscreen（会与 iOS webkit 全屏态打架）
        document.querySelectorAll(FULLSCREEN_BUTTON_SELECTOR).forEach(button => {
            button.setAttribute('data-state', isFullscreen ? 'full' : 'normal');
        });
    }
    function enterFallbackFullscreen(target, component) {
        if (!target) {
            return;
        }
        const player = component?.player;
        if (player && typeof player.getCssFullscreen === 'function') {
            try {
                player.getCssFullscreen(target);
                cssFullscreenFallbackPlayer = player;
                syncFullscreenButtonState(component, true);
                console.log('[SMGTV] 已启用 xgplayer CSS 全屏兜底');
                return;
            } catch (e) {
                console.warn('[SMGTV] xgplayer CSS 全屏失败，使用样式兜底', e);
            }
        }
        exitFallbackFullscreen(component);
        fullscreenFallbackTarget = target;
        target.classList.add(FULLSCREEN_TARGET_CLASS);
        document.body?.classList.add(FULLSCREEN_FALLBACK_CLASS);
        syncFullscreenButtonState(component, true);
        console.log('[SMGTV] 已启用 CSS 全屏兜底');
    }
    function exitFallbackFullscreen(component) {
        const player = component?.player || cssFullscreenFallbackPlayer;
        if (cssFullscreenFallbackPlayer && player && typeof player.exitCssFullscreen === 'function') {
            try {
                player.exitCssFullscreen();
            } catch (e) {
                console.warn('[SMGTV] 退出 xgplayer CSS 全屏失败', e);
            }
        }
        cssFullscreenFallbackPlayer = null;
        if (fullscreenFallbackTarget) {
            fullscreenFallbackTarget.classList.remove(FULLSCREEN_TARGET_CLASS);
            fullscreenFallbackTarget = null;
        }
        document.body?.classList.remove(FULLSCREEN_FALLBACK_CLASS);
        syncFullscreenButtonState(component, false);
    }
    function isFallbackFullscreen() {
        return !!document.body?.classList.contains(FULLSCREEN_FALLBACK_CLASS) ||
            !!cssFullscreenFallbackPlayer?.cssfullscreen ||
            !!cssFullscreenFallbackPlayer?.isCssfullScreen;
    }
    function callFullscreenMethod(fn) {
        try {
            const result = fn();
            return result && typeof result.then === 'function' ? result : Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }
    // iOS Safari 无元素级 Fullscreen API，用 video 原生 webkitEnterFullscreen 兜底
    function enterNativeVideoFullscreen(component) {
        const video = getPlayerVideo(component);
        if (!video || typeof video.webkitEnterFullscreen !== 'function') {
            return false;
        }
        try {
            video.webkitEnterFullscreen();
            syncFullscreenButtonState(component, true);
            return true;
        } catch (e) {
            console.warn('[SMGTV] iOS 原生视频全屏失败，使用 CSS 兜底', e);
            return false;
        }
    }
    function enterFullscreen(component, target) {
        const player = component?.player;
        const enterNative = callFullscreenMethod(() => (
            player && typeof player.getFullscreen === 'function' ?
                player.getFullscreen(target) :
                requestElementFullscreen(target)
        ));
        Promise.resolve(enterNative)
            .then(() => syncFullscreenButtonState(component, true))
            .catch(() => {
                if (!enterNativeVideoFullscreen(component)) {
                    enterFallbackFullscreen(target, component);
                }
            });
    }
    function exitFullscreen(component) {
        const player = component?.player;
        if (isFallbackFullscreen()) {
            exitFallbackFullscreen(component);
            return;
        }
        const exitNative = callFullscreenMethod(() => (
            player && typeof player.exitFullscreen === 'function' ?
                player.exitFullscreen() :
                exitBrowserFullscreen()
        ));
        Promise.resolve(exitNative)
            .catch(exitBrowserFullscreen)
            .then(
                () => syncFullscreenButtonState(component, false),
                () => syncFullscreenButtonState(component, false)
            );
    }
    function handleFullscreenControl(event) {
        const button = event.target?.closest?.(FULLSCREEN_BUTTON_SELECTOR);
        if (!button) {
            return;
        }
        const now = Date.now();
        if (now - lastFullscreenActionAt < 300) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            return;
        }
        lastFullscreenActionAt = now;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const component = findTVComponent();
        const target = getFullscreenTarget(component, button);
        syncLoadingState(component);
        const video = getPlayerVideo(component);
        if (getBrowserFullscreenElement() || isFallbackFullscreen()) {
            exitFullscreen(component);
        } else if (video && video.webkitDisplayingFullscreen) {
            // iOS 原生视频全屏态的退出
            try {
                if (typeof video.webkitExitFullscreen === 'function') {
                    video.webkitExitFullscreen();
                }
            } catch (e) {
                console.warn('[SMGTV] 退出 iOS 原生全屏失败', e);
            }
            syncFullscreenButtonState(component, false);
        } else {
            enterFullscreen(component, target);
        }
    }
    function handleFullscreenChange() {
        if (getBrowserFullscreenElement()) {
            exitFallbackFullscreen(findTVComponent());
            syncFullscreenButtonState(findTVComponent(), true);
        } else if (!isFallbackFullscreen()) {
            syncFullscreenButtonState(findTVComponent(), false);
        }
    }
    function initFullscreenPatch() {
        document.addEventListener('click', handleFullscreenControl, true);
        document.addEventListener('touchend', handleFullscreenControl, true);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && isFallbackFullscreen()) {
                exitFallbackFullscreen(findTVComponent());
            }
        });
    }
    function wrapComponentMethod(component, methodName, after, before) {
        const original = component?.[methodName];
        if (typeof original !== 'function' || original.__smgWrapped) {
            return;
        }
        const wrapped = function() {
            if (typeof before === 'function') {
                try { before(this, arguments); } catch (e) {}
            }
            const result = original.apply(this, arguments);
            const runAfter = () => {
                setTimeout(() => after(this), 0);
                setTimeout(() => after(this), 250);
                setTimeout(() => after(this), 1000);
            };
            if (result && typeof result.then === 'function') {
                result.then(runAfter, runAfter);
            } else {
                runAfter();
            }
            return result;
        };
        wrapped.__smgWrapped = true;
        wrapped.__smgOriginal = original;
        component[methodName] = wrapped;
    }
    // ===== kapi 接口签名（2026-09 站点把 pc 路由的 live_address 全站置空后的兜底方案）=====
    // 签名算法来自页面 app.v2.42.23.js：业务参数 + {platform, version, nonce, timestamp, Api-Version}
    // 按 key 排序后拼 k=v& 串，追加私钥做双重 MD5；签名五参数走请求头，业务参数走 query
    const KAPI_SIGN_KEY = '28c8edde3d61a0411511d3b1866f0636';
    const KAPI_VERSION = '2.42.23';
    const KAPI_HOST = 'https://kapi.kankanews.com';
    // MD5（32 位运算标准实现，utf-8 安全）
    function md5(s) {
        function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
        function au(x, y) { const l = (x & 0xFFFF) + (y & 0xFFFF), m = (x >> 16) + (y >> 16) + (l >> 16); return (m << 16) | (l & 0xFFFF); }
        function cmn(q, a, b, x, s, t) { return au(rl(au(au(a, q), au(x, t)), s), b); }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
        function sb(str) {
            const n = ((str.length + 8) >> 6) + 1;
            const blks = new Array(n * 16).fill(0);
            for (let i = 0; i < str.length; i++) blks[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
            blks[str.length >> 2] |= 0x80 << ((str.length % 4) * 8);
            blks[n * 16 - 2] = str.length * 8;
            return blks;
        }
        function hex(n) { let s = '', j; for (let i = 0; i < 4; i++) { j = (n >> (i * 8)) & 0xFF; s += '0123456789abcdef'.charAt((j >> 4) & 0xF) + '0123456789abcdef'.charAt(j & 0xF); } return s; }
        function calc(blks) {
            let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
            for (let i = 0; i < blks.length; i += 16) {
                const oa = a, ob = b, oc = c, od = d;
                a=ff(a,b,c,d,blks[i],7,-680876936);d=ff(d,a,b,c,blks[i+1],12,-389564586);c=ff(c,d,a,b,blks[i+2],17,606105819);b=ff(b,c,d,a,blks[i+3],22,-1044525330);
                a=ff(a,b,c,d,blks[i+4],7,-176418897);d=ff(d,a,b,c,blks[i+5],12,1200080426);c=ff(c,d,a,b,blks[i+6],17,-1473231341);b=ff(b,c,d,a,blks[i+7],22,-45705983);
                a=ff(a,b,c,d,blks[i+8],7,1770035416);d=ff(d,a,b,c,blks[i+9],12,-1958414417);c=ff(c,d,a,b,blks[i+10],17,-42063);b=ff(b,c,d,a,blks[i+11],22,-1990404162);
                a=ff(a,b,c,d,blks[i+12],7,1804603682);d=ff(d,a,b,c,blks[i+13],12,-40341101);c=ff(c,d,a,b,blks[i+14],17,-1502002290);b=ff(b,c,d,a,blks[i+15],22,1236535329);
                a=gg(a,b,c,d,blks[i+1],5,-165796510);d=gg(d,a,b,c,blks[i+6],9,-1069501632);c=gg(c,d,a,b,blks[i+11],14,643717713);b=gg(b,c,d,a,blks[i],20,-373897302);
                a=gg(a,b,c,d,blks[i+5],5,-701558691);d=gg(d,a,b,c,blks[i+10],9,38016083);c=gg(c,d,a,b,blks[i+15],14,-660478335);b=gg(b,c,d,a,blks[i+4],20,-405537848);
                a=gg(a,b,c,d,blks[i+9],5,568446438);d=gg(d,a,b,c,blks[i+14],9,-1019803690);c=gg(c,d,a,b,blks[i+3],14,-187363961);b=gg(b,c,d,a,blks[i+8],20,1163531501);
                a=gg(a,b,c,d,blks[i+13],5,-1444681467);d=gg(d,a,b,c,blks[i+2],9,-51403784);c=gg(c,d,a,b,blks[i+7],14,1735328473);b=gg(b,c,d,a,blks[i+12],20,-1926607734);
                a=hh(a,b,c,d,blks[i+5],4,-378558);d=hh(d,a,b,c,blks[i+8],11,-2022574463);c=hh(c,d,a,b,blks[i+11],16,1839030562);b=hh(b,c,d,a,blks[i+14],23,-35309556);
                a=hh(a,b,c,d,blks[i+1],4,-1530992060);d=hh(d,a,b,c,blks[i+4],11,1272893353);c=hh(c,d,a,b,blks[i+7],16,-155497632);b=hh(b,c,d,a,blks[i+10],23,-1094730640);
                a=hh(a,b,c,d,blks[i+13],4,681279174);d=hh(d,a,b,c,blks[i],11,-358537222);c=hh(c,d,a,b,blks[i+3],16,-722521979);b=hh(b,c,d,a,blks[i+6],23,76029189);
                a=hh(a,b,c,d,blks[i+9],4,-640364487);d=hh(d,a,b,c,blks[i+12],11,-421815835);c=hh(c,d,a,b,blks[i+15],16,530742520);b=hh(b,c,d,a,blks[i+2],23,-995338651);
                a=ii(a,b,c,d,blks[i],6,-198630844);d=ii(d,a,b,c,blks[i+7],10,1126891415);c=ii(c,d,a,b,blks[i+14],15,-1416354905);b=ii(b,c,d,a,blks[i+5],21,-57434055);
                a=ii(a,b,c,d,blks[i+12],6,1700485571);d=ii(d,a,b,c,blks[i+3],10,-1894986606);c=ii(c,d,a,b,blks[i+10],15,-1051523);b=ii(b,c,d,a,blks[i+1],21,-2054922799);
                a=ii(a,b,c,d,blks[i+8],6,1873313359);d=ii(d,a,b,c,blks[i+15],10,-30611744);c=ii(c,d,a,b,blks[i+6],15,-1560198380);b=ii(b,c,d,a,blks[i+13],21,1309151649);
                a=ii(a,b,c,d,blks[i+4],6,-145523070);d=ii(d,a,b,c,blks[i+11],10,-1120210379);c=ii(c,d,a,b,blks[i+2],15,718787259);b=ii(b,c,d,a,blks[i+9],21,-343485551);
                a=au(a,oa);b=au(b,ob);c=au(c,oc);d=au(d,od);
            }
            return [a, b, c, d];
        }
        return calc(sb(unescape(encodeURIComponent(s)))).map(hex).join('');
    }
    // 用 pc 平台签名请求 app 路由的频道详情：服务器验签只认参数，路由按 app 端逻辑照常下发加密 live_address。
    // m-uuid 请求头（取 localStorage.uuid，页面自己写入）必须带上：kapi 会把它写进 CDN token，缺了 CDN 会 403
    function fetchChannelLiveAddress(channelId) {
        return new Promise(resolve => {
            const all = {
                channel_id: channelId,
                platform: 'pc',
                version: KAPI_VERSION,
                nonce: Math.random().toString(36).slice(-8),
                timestamp: Math.floor(Date.now() / 1000),
                'Api-Version': 'v1'
            };
            const sorted = {};
            Object.keys(all).sort().forEach(k => { sorted[k] = all[k]; });
            let raw = '';
            for (const k in sorted) if (sorted[k] != null) raw += k + '=' + sorted[k] + '&';
            const sign = md5(md5(raw + KAPI_SIGN_KEY));
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `${KAPI_HOST}/content/app/tv/channel/detail?channel_id=${channelId}`);
            xhr.setRequestHeader('platform', 'pc');
            xhr.setRequestHeader('version', KAPI_VERSION);
            xhr.setRequestHeader('nonce', sorted.nonce);
            xhr.setRequestHeader('timestamp', String(sorted.timestamp));
            xhr.setRequestHeader('Api-Version', 'v1');
            xhr.setRequestHeader('sign', sign);
            const uuid = localStorage.getItem('uuid') || '';
            if (uuid) {
                xhr.setRequestHeader('m-uuid', uuid);
            }
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        resolve(null);
                    }
                }
            };
            xhr.send();
        });
    }
    // 回填直播流地址：频道级与节目级 live_address 均被服务器置空时，优先用被动捕获缓存补齐，
    // 无缓存再走 app 接口主动取流（F1 等被屏蔽节目的核心病根：initPlayer 拿到空 url 直接报错卡加载）
    async function refillLiveAddress(component) {
        if (!component || component.__smgRefilling) {
            return;
        }
        component.__smgRefilling = true;
        try {
            const detail = component.programDetail;
            const channelId = detail?.channel_info?.id ??
                component?.currChannelDetail?.id ??
                new URLSearchParams(location.search).get('id');
            if (!channelId) {
                console.warn('[SMGTV] 回填流地址失败：未取到频道 id');
                return;
            }
            let address = liveAddressCache.get(channelId);
            if (!address) {
                // 被动捕获的缓存（含 shift 兜底）优先，命中则免发请求
                const passive = streamAddressCache[String(channelId)];
                address = passive?.live_address || passive?.shift_address || '';
                if (address) {
                    liveAddressCache.set(channelId, address);
                }
            }
            if (!address) {
                const res = await fetchChannelLiveAddress(channelId);
                address = res?.result?.live_address || '';
                if (address) {
                    liveAddressCache.set(channelId, address);
                }
            }
            if (!address) {
                console.warn('[SMGTV] app 接口未返回流地址，回填失败');
                return;
            }
            if (detail?.channel_info) {
                detail.channel_info.live_address = address;
            }
            if (component.currChannelDetail) {
                component.currChannelDetail.live_address = address;
            }
            unshieldProgram(component.programObj);
            unshieldProgram(component.playingProgramObj);
            unshieldProgram(detail);
            // 播放器健康（存在且无错误）时只回填数据、不重建：
            // 页面会定时轮询节目单并整体替换 programDetail（空地址），若每次都重建会周期性闪断
            if (component.player && !component.player.isError) {
                return;
            }
            try {
                if (typeof component.destroyPlayer === 'function') {
                    component.destroyPlayer();
                }
                if (typeof component.initPlayer === 'function') {
                    // 用 click 触发：initPlayer 在 auto 模式会抑制自动播放，click 才会执行 player.play()
                    component.initPlayer({ changeCurrentList: false, isPlay: true, trigger: 'click' });
                    console.log('[SMGTV] 已通过 app 接口回填流地址并重建播放器');
                }
            } catch (e) {
                console.warn('[SMGTV] 回流地址后重建播放器失败', e);
            }
        } finally {
            component.__smgRefilling = false;
        }
    }
    // 流地址是否处于被置空状态：只看 programDetail（initPlayer 的唯一数据源）。
    // 注意不能把 currChannelDetail 算进来：回填会先写入它，若它非空就再也不触发，
    // 而页面后续 program/detail 响应会把 programDetail 整个替换回空地址对象
    function isLiveAddressEmpty(component) {
        return !component?.programDetail?.channel_info?.live_address;
    }
    // ===== 回看解锁（借鉴原作者方案）=====
    // 原理：回看流的 m3u8 地址需要 start=节目开始时间&end=结束时间 的时间窗；
    // 被屏蔽节目缺地址/缺时间窗时，用播放器实际用过的解密基址（带 TTL 缓存）+ 节目时间拼出
    function stripTimeWindow(url) {
        return url
            .replace(/&start=\d+&end=\d+(?=&|$)/g, '')
            .replace(/\?start=\d+&end=\d+(?=&|$)/g, '?')
            .replace(/\?$/, '');
    }
    function installReplayUrlPatch(component) {
        const XGPlayer = component.$xgplayer;
        if (!XGPlayer || component.__smgReplayPatchInstalled) {
            return;
        }
        component.__smgReplayPatchInstalled = true;
        component.$xgplayer = new Proxy(XGPlayer, {
            construct(target, args) {
                const config = args[0] || {};
                const program = component.programObj;
                const channelId = component.currChannel?.id != null ? component.currChannel.id :
                    (component.programDetail?.channel_info?.id != null ? component.programDetail.channel_info.id :
                        program?.channel_id);
                let url = (config.url && typeof config.url === 'string') ? config.url : '';
                const now = Date.now();
                // 播放器实际拿到过解密后的 m3u8：剥掉时间窗记下基址（shift 优先于 live，TTL 区分）
                if (channelId != null && /\.m3u8/.test(url)) {
                    const base = stripTimeWindow(url);
                    if (base) {
                        const fromShift = /[?&]start=\d+/.test(url);
                        const store = fromShift ? channelShiftBaseCache : channelLiveBaseCache;
                        store[channelId] = { url: base, at: now };
                    }
                }
                // 回看但无流地址：用缓存基址 + 节目时间窗拼出回看地址
                const shiftEntry = channelShiftBaseCache[channelId];
                const liveEntry = channelLiveBaseCache[channelId];
                const baseOk = (shiftEntry && now - shiftEntry.at < SHIFT_TTL) ? shiftEntry.url :
                    ((liveEntry && now - liveEntry.at < LIVE_TTL) ? liveEntry.url : '');
                const isReplay = config.isLive === false;
                const hasStream = /\.m3u8/.test(url);
                const hasWindow = /\bstart=\d/.test(url);
                if (isReplay && hasWindow) {
                    return new target(...args);
                }
                if (isReplay && hasStream && !hasWindow && program?.start_time && program?.end_time) {
                    config.url = url + (url.includes('?') ? '&' : '?') +
                        'start=' + program.start_time + '&end=' + program.end_time;
                } else if (isReplay && !hasStream && program?.start_time && program?.end_time) {
                    if (baseOk) {
                        config.url = baseOk + '&start=' + program.start_time + '&end=' + program.end_time;
                    }
                } else if (!isReplay && !hasStream && baseOk) {
                    // 直播但无流地址（服务器置空）：直接用缓存基址救活
                    config.url = baseOk;
                }
                return new target(...args);
            }
        });
    }
    // 解除节目屏蔽字段：is_shield 控制是否创建播放器（isCopyright computed 依赖 programObj.is_shield）
    // 注意：只改权限字段，不动 play / isOutDate（它们是时间判断，乱改会误播未来节目或走错流地址分支）
    function unshieldProgram(program) {
        if (!program || typeof program !== 'object') {
            return;
        }
        if ('is_shield' in program) program.is_shield = 0;
        if ('is_review' in program) program.is_review = 1;
        if ('can_review' in program) program.can_review = 1;
    }
    // 自愈：默认进入页面时若选中节目被屏蔽，initPlayer 已走 destroyPlayer 分支、播放器未创建。
    // 轮询等待节目详情就绪后，校正屏蔽字段；流地址为空（服务器已全站置空）则走 app 接口回填重建
    function startPlayerRecovery(component) {
        if (!component || component.__smgRecovery) {
            return;
        }
        component.__smgRecovery = true;
        let attempts = 0;
        const maxAttempts = 40;
        const timer = setInterval(() => {
            attempts += 1;
            // 播放器健康（存在且无错误）时才退出自愈；存在但报错（空 url 创建出的废播放器）要继续修
            if (component.player && !component.player.isError) {
                clearInterval(timer);
                return;
            }
            const ready = component.programObj?.id &&
                component.programDetail?.channel_info;
            if (ready || attempts >= maxAttempts) {
                clearInterval(timer);
                if (!component.player || component.player.isError) {
                    unshieldProgram(component.programObj);
                    unshieldProgram(component.programDetail);
                    if (isLiveAddressEmpty(component)) {
                        refillLiveAddress(component);
                    } else {
                        try {
                            if (typeof component.initPlayer === 'function') {
                                // 用 click 触发：initPlayer 在 auto 模式会抑制自动播放，click 才会执行 player.play()
                                component.initPlayer({ changeCurrentList: false, isPlay: true, trigger: 'click' });
                                console.log('[SMGTV] 已自愈重建播放器');
                            }
                        } catch (e) {
                            console.warn('[SMGTV] 自愈重建播放器失败', e);
                        }
                    }
                }
            }
        }, 250);
    }
    function patchComponent(component) {
        if (!component) {
            return;
        }
        startLoadingMonitor(component);
        if (component.__smgPatched) {
            syncLoadingState(component);
            return;
        }
        component.__smgPatched = true;
        // 首次校正：解除当前选中节目 / 详情的屏蔽状态，并回补被置空的流地址
        unshieldProgram(component.programObj);
        unshieldProgram(component.playingProgramObj);
        unshieldProgram(component.programDetail);
        if (component.programDetail?.channel_info) {
            const channelId = component.programDetail.channel_info.id ?? component.currChannelDetail?.id;
            fillStreamAddresses(component.programDetail.channel_info, channelId);
        }
        if (typeof component.countdown === 'number') {
            component.countdown = 99999999;
        }
        component.showOpenApp = false;
        component.showFlag = false;
        component.startCountdown = function() {
            console.log('[SMGTV] 已拦截试看倒计时');
        };
        if (component.liveTimer) {
            clearTimeout(component.liveTimer);
            component.liveTimer = null;
        }
        // 自愈：若进入时播放器未创建（默认节目被屏蔽导致 initPlayer 走了 destroyPlayer 分支），
        // 等节目详情 + 频道流地址就绪后回填并重新初始化播放器
        if (!component.player && component.programObj?.id) {
            startPlayerRecovery(component);
        }
        if (typeof component.pageVisibilityChange === 'function') {
            document.removeEventListener('visibilitychange', component.pageVisibilityChange);
            component.pageVisibilityChange = function() {
                console.log('[SMGTV] 已拦截切换标签页自动暂停');
            };
            document.addEventListener('visibilitychange', component.pageVisibilityChange);
        }
        if (component._handlerUnload) {
            window.removeEventListener('unload', component._handlerUnload);
            component._handlerUnload = null;
        }
        // 回看解锁：Proxy 拦截 $xgplayer 构造，缺时间窗/基址时补齐
        installReplayUrlPatch(component);
        ['initPlayer', 'initNoProgramPlayer', 'initPadPlayer', 'changeProgram', 'changeChannel', 'getProgramDetail'].forEach(methodName => {
            wrapComponentMethod(component, methodName, syncLoadingState, (ctx, args) => {
                // 原方法执行前校正屏蔽字段：
                // - programObj：initPlayer 读取 isCopyright 时依赖 programObj.is_shield
                // - 入参节目对象：changeProgram/changeChannel 会将其赋给 programObj，需在赋值前放行
                unshieldProgram(ctx.programObj);
                unshieldProgram(ctx.playingProgramObj);
                unshieldProgram(ctx.programDetail);
                if (args && args[0]) {
                    unshieldProgram(args[0]);
                }
                // 流地址被服务器置空时走 app 接口回填（重建仅在播放器报错时发生，天然防抖）
                if (isLiveAddressEmpty(ctx)) {
                    refillLiveAddress(ctx);
                }
            });
        });
        syncLoadingState(component);
        console.log('[SMGTV] 页面限制补丁已生效');
    }
    let scanning = false;
    function initComponentPatch() {
        if (scanning) {
            return;
        }
        scanning = true;
        let attempts = 0;
        const maxAttempts = 50;
        const timer = setInterval(() => {
            const component = findTVComponent();
            if (component) {
                clearInterval(timer);
                scanning = false;
                patchComponent(component);
                return;
            }
            attempts += 1;
            if (attempts >= maxAttempts) {
                clearInterval(timer);
                scanning = false;
                console.warn('[SMGTV] 未找到播放器组件实例');
            }
        }, 200);
    }
    injectStyle(`
    .video-tip {
        display: none !important;
    }
    body.${VIDEO_READY_CLASS} .loading-mask {
        display: none !important;
        pointer-events: none !important;
    }
    body.${FULLSCREEN_FALLBACK_CLASS} {
        overflow: hidden !important;
    }
    .${FULLSCREEN_TARGET_CLASS} {
        background: #000 !important;
        box-sizing: border-box !important;
        height: 100vh !important;
        inset: 0 !important;
        margin: 0 !important;
        max-height: none !important;
        max-width: none !important;
        min-height: 100vh !important;
        min-width: 100vw !important;
        padding: 0 !important;
        position: fixed !important;
        transform: none !important;
        width: 100vw !important;
        z-index: 2147483647 !important;
    }
    .${FULLSCREEN_TARGET_CLASS}.xgplayer,
    .${FULLSCREEN_TARGET_CLASS} .xgplayer {
        height: 100% !important;
        inset: 0 !important;
        margin: 0 !important;
        max-height: none !important;
        max-width: none !important;
        padding: 0 !important;
        padding-top: 0 !important;
        position: absolute !important;
        transform: none !important;
        width: 100% !important;
    }
    .${FULLSCREEN_TARGET_CLASS} .xgplayer-screen-container,
    .${FULLSCREEN_TARGET_CLASS} xg-video-container.xg-video-container,
    .${FULLSCREEN_TARGET_CLASS} .xg-video-container {
        bottom: 0 !important;
        display: block !important;
        height: 100% !important;
        inset: 0 !important;
        position: absolute !important;
        width: 100% !important;
    }
    .${FULLSCREEN_TARGET_CLASS} video,
    .${FULLSCREEN_TARGET_CLASS} canvas,
    .${FULLSCREEN_TARGET_CLASS} live-video {
        bottom: 0 !important;
        height: 100% !important;
        left: 0 !important;
        max-height: none !important;
        max-width: none !important;
        object-fit: contain !important;
        position: absolute !important;
        right: 0 !important;
        top: 0 !important;
        transform: none !important;
        width: 100% !important;
    }
    .${FULLSCREEN_TARGET_CLASS} .xgplayer-controls,
    .${FULLSCREEN_TARGET_CLASS} .xg-top-bar {
        z-index: 2147483647 !important;
    }
    .${FULLSCREEN_TARGET_CLASS} .xg-top-bar {
        padding-top: env(safe-area-inset-top, 0px) !important;
    }
    `);
    
    // 保存原始的XMLHttpRequest.open方法
    const originalOpen = XMLHttpRequest.prototype.open;
    // 重写XMLHttpRequest.open方法
    function isTargetTVApi(url) {
        try {
            return new URL(String(url), location.href).pathname.includes('/content/pc/tv/');
        } catch (e) {
            return String(url).includes('/content/pc/tv/');
        }
    }
    // 统一的响应改写逻辑（XHR 与 fetch 共用，DRY）
    function rewriteTvApiResponse(requestUrl, response) {
        let modified = false;
        if (!response || typeof response !== 'object') {
            return false;
        }
        // 频道详情接口：被动记忆流地址（含 shift，回看/回补共用）
        if (requestUrl.includes('/channel/detail') && response.result) {
            rememberStreamAddresses(
                response.result.id,
                response.result.live_address,
                response.result.shift_address
            );
        }
        // 处理单个节目详情接口
        if (requestUrl.includes('/program/detail') && response.result) {
            unshieldProgram(response.result);
            const info = response.result.channel_info || (response.result.channel_info = {});
            unshieldProgram(info);
            const channelId = info?.id ?? response.result.channel_id;
            // 流地址被服务器置空时，直接把缓存地址写进响应（源头拦截，避免回填追赶竞态）
            if (!info.live_address && channelId != null) {
                if (liveAddressCache.has(channelId)) {
                    info.live_address = liveAddressCache.get(channelId);
                } else {
                    fillStreamAddresses(info, channelId);
                }
                // 仍为空则异步预热（主动取流），之后页面重新拉详情/重建时即有地址可用
                if (!info.live_address) {
                    fetchChannelLiveAddress(channelId).then(res => {
                        const addr = res?.result?.live_address || '';
                        if (addr) liveAddressCache.set(channelId, addr);
                    });
                }
            }
            modified = true;
        }
        // 处理节目列表接口
        if (requestUrl.includes('/programs') && response.result?.programs) {
            response.result.programs.forEach(program => {
                unshieldProgram(program);
            });
            modified = true;
        }
        return modified;
    }
    // 重写 XHR 响应属性（responseText + response，兼容 responseType=json）
    function replaceXhrResponse(xhr, body) {
        try {
            Object.defineProperty(xhr, 'responseText', {
                value: body,
                writable: false,
                configurable: true
            });
            Object.defineProperty(xhr, 'response', {
                value: xhr.responseType === 'json' ? JSON.parse(body) : body,
                writable: false,
                configurable: true
            });
        } catch (e) {
            throttleLog('rewrite-error', 5000, () => console.error('[SMGTV] 重写接口响应失败:', e));
        }
    }
    XMLHttpRequest.prototype.open = function(method, url) {
        this.__smgRequestUrl = String(url);
        // 检查是否是目标API请求
        if (isTargetTVApi(this.__smgRequestUrl)) {
            if (!this.__smgHooked) {
                this.__smgHooked = true;
                // 监听readystatechange事件
                this.addEventListener('readystatechange', function() {
                    if (this.readyState !== 4) {
                        return;
                    }
                    const requestUrl = this.__smgRequestUrl;
                    try {
                        let response;
                        let rawText = null;
                        try {
                            rawText = this.responseText;
                        } catch (e) {
                            rawText = null;
                        }
                        if (typeof rawText === 'string' && rawText) {
                            response = JSON.parse(rawText);
                        } else if (this.response && typeof this.response === 'object') {
                            response = this.response;
                        } else {
                            return;
                        }
                        if (this.status === 200 && rewriteTvApiResponse(requestUrl, response)) {
                            replaceXhrResponse(this, JSON.stringify(response));
                        }
                    } catch (e) {
                        throttleLog('parse-error', 5000, () => console.error('[SMGTV] 解析接口响应失败:', e));
                    }
                });
            }
        }

        // 调用原始的open方法
        return originalOpen.apply(this, arguments);
    };
    // fetch 双 hook：页面部分请求走 fetch，同样改写 TV 接口响应
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
        window.fetch = function(input, init) {
            const requestUrl = String(typeof input === 'string' ? input : (input && input.url) || '');
            const request = originalFetch.apply(this, arguments);
            if (!isTargetTVApi(requestUrl)) {
                return request;
            }
            return request.then(res => {
                if (!res || !res.ok) {
                    return res;
                }
                try {
                    return res.clone().text().then(raw => {
                        try {
                            const response = JSON.parse(raw);
                            if (!rewriteTvApiResponse(requestUrl, response)) {
                                return res;
                            }
                            return new Response(JSON.stringify(response), {
                                status: res.status,
                                statusText: res.statusText,
                                headers: res.headers
                            });
                        } catch (e) {
                            throttleLog('parse-error', 5000, () => console.error('[SMGTV] 解析接口响应失败:', e));
                            return res;
                        }
                    }).catch(() => res);
                } catch (e) {
                    throttleLog('rewrite-error', 5000, () => console.error('[SMGTV] 重写接口响应失败:', e));
                    return res;
                }
            });
        };
    }
    ensureViewportFitCover();
    if (document.readyState === 'complete') {
        initComponentPatch();
    } else {
        window.addEventListener('load', initComponentPatch, { once: true });
    }
    initFullscreenPatch();
})();
