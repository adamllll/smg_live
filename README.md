<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
  <img src="assets/banner-light.svg" alt="SMTV Live — 解除看看新闻直播与回看的观看限制">
</picture>

![version](https://img.shields.io/badge/version-0.24-blue)
![license](https://img.shields.io/badge/license-MIT-grey)
![userscript](https://img.shields.io/badge/Tampermonkey%20%7C%20Violentmonkey-userscript-grey?logo=tampermonkey&logoColor=white)

[![install](https://img.shields.io/badge/%E5%AE%89%E8%A3%85%E8%84%9A%E6%9C%AC-Tampermonkey%20%7C%20Violentmonkey-2ea44f?logo=tampermonkey&logoColor=white)](https://g.geeck.eu.org/https://raw.githubusercontent.com/adamllll/smg_live/refs/heads/main/smg_fivestar.user.js)

跟随 [Popukok/smg_live](https://github.com/Popukok/smg_live) 上游 · 本仓库为镜像

</div>

---

## ✨ 功能

- 🔓 解除节目屏蔽 —— F1 等版权节目直接放行
- 📺 直播流回填 —— 服务器置空流地址时经签名接口取回并解密
- ⏪ 回看解锁 —— 已播完节目可回看，跨日期取源补全时间窗
- ⏱️ 拦截试看倒计时，切换标签页不暂停
- 🔄 短时效地址自动续期 —— 链接临近过期自动换新链，长时观看不中断
- 🛡️ 取源节流 + 跨标签页锁 —— 降低被 CDN 封锁 IP 的概率
- 🔁 播放中断自愈与断点续播
- 🖥️ 全屏兜底（含 iOS / 刘海屏 safe-area、动态视口适配）

## 📥 安装

需要浏览器装有 [Tampermonkey](https://tampermonkey.net/)（推荐）或 [Violentmonkey](https://violentmonkey.github.io/) 插件，点击上方绿色按钮即可安装。

安装后[点击打开看看新闻](https://live.kankanews.com/huikan?id=10)，选择频道即可观看。

例如收看五星体育频道 F1 比赛直播，可以跳过以下图片提示：

![安装脚本前，频道会显示版权节目的试看限制提示](https://p.statickksmg.com/cont/2023/10/08/image_1696731269_qOxBpp34.jpg)

> 脚本正文与上游逐字一致，且 `@updateURL` 指向上游，因此**安装后会自动跟随上游更新**，无需等待本仓库同步。

## 📝 更新日志

- **0.24** —— 同步上游最新：全屏修复、M 站切节目黑屏修复、取源请求节流
- **0.20** —— 上游修复「看一会儿就中断且不再恢复」；短时效 M3U8 自动换链
- **0.15** —— 上游解锁回看、节目列表、全屏等修复，新增 Safari / iOS 支持
- **0.11** —— 本仓库最后一版自维护脚本（此后改为跟随上游）

> 0.9 – 0.11 为本仓库自维护时期的版本，修复记录见 git 历史。

## 🌐 兼容性

支持**最新版** Chrome、Firefox、Safari，脚本管理器推荐使用 [Tampermonkey](https://tampermonkey.net/)。

与上游一致，脚本使用 `GM_xmlhttpRequest` 与 `unsafeWindow` 授权（用于解密流地址、以及在页面请求被拦截时提供兜底通路），因此需要管理器**允许用户脚本**，并在首次安装时确认脚本的连接权限。

> ⚠️ 由于两款插件存在技术差异，基于 Tampermonkey 开发的脚本在 Violentmonkey 上可能存在兼容性问题，建议使用油猴插件。

## 🩺 常见问题

**Q：不能看了 / 提示「版权受限，此时段不提供电视网络转播服务」？**

**A：** 通常是脚本没生效，去扩展 → Tampermonkey → 详细信息 里勾选「允许用户脚本」。

**Q：一直转圈 / 所有频道都打不开 / 节目单一片空白？**

**A：** 多半是刷新过频被网站限流。等半小时会自动释放，或换个网络（重拨宽带、切换代理）。脚本已内置取源节流与跨标签页锁来降低触发概率。

## 📱 移动端

支持在移动端收看，前提是移动端浏览器支持 **[Tampermonkey](https://tampermonkey.net/)** 插件并能运行其脚本。

💎 **如何选择**

- 追求**最接近电脑 Chrome 的安装体验**：**Kiwi Browser**、**Chrome Browser**、**Edge Browser**
- 看重**国产浏览器对 Chrome/Edge 扩展生态的兼容**：**狐猴浏览器**
- 习惯 **Firefox 桌面版**或开源生态：**Firefox for Android**
- **X 浏览器**：轻量、无广告、支持油猴脚本
- **iPhone / iPad**：直接用 Safari（iOS 15+），安装 Userscripts 或 Tampermonkey 后启用扩展即可

> iPhone 全屏使用 iOS 原生视频全屏；CSS 全屏已适配动态视口与安全区域。

---

## 🔧 本仓库维护说明

本仓库不再自维护脚本正文。上游迭代速度快，自维护 fork 会持续落后，因此改为跟随模式：

```bash
git fetch upstream
git checkout upstream/main -- smg_fivestar.user.js
git diff upstream/main -- smg_fivestar.user.js   # 应无输出
```

每次上游有实质更新时同步一次即可；用户端更新不依赖本仓库（脚本 `@updateURL` 直指上游）。README 与 `assets/` 为本仓库自有版式，不受同步影响。

---

<div align="center">

仅为学习交流使用，请于 24 小时内删除

</div>
