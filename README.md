<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
  <img src="assets/banner-light.svg" alt="SMTV Live — 解除看看新闻直播与回看的观看限制">
</picture>

![version](https://img.shields.io/badge/version-0.11-blue)
![license](https://img.shields.io/badge/license-MIT-grey)
![userscript](https://img.shields.io/badge/Tampermonkey%20%7C%20Violentmonkey-userscript-grey?logo=tampermonkey&logoColor=white)

[![install](https://img.shields.io/badge/%E5%AE%89%E8%A3%85%E8%84%9A%E6%9C%AC-Tampermonkey%20%7C%20Violentmonkey-2ea44f?logo=tampermonkey&logoColor=white)](https://g.geeck.eu.org/https://raw.githubusercontent.com/adamllll/smg_live/refs/heads/main/smg_fivestar.user.js)

基于 [Popukok/smg_live](https://github.com/Popukok/smg_live) 维护

</div>

---

## ✨ 功能

- 🔓 解除节目屏蔽 —— F1 等版权节目直接放行
- 📺 直播流回填 —— 服务器置空流地址时自动经 app 接口取回
- ⏪ 回看解锁 —— 已播完节目可回看，自动补全时间窗参数
- ⏱️ 拦截试看倒计时，切换标签页不暂停
- 🔁 播放器自愈 —— 报错自动重建，节目轮询不受影响
- 🖥️ 全屏兜底（含 iOS / 刘海屏 safe-area 适配）

## 📥 安装

需要浏览器装有 [Tampermonkey](https://tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) 插件，点击上方绿色按钮即可安装。

安装后[点击打开看看新闻](https://live.kankanews.com/huikan?id=10)，选择频道即可观看。

例如收看五星体育频道 F1 比赛直播，可以跳过以下图片提示：

![安装脚本前，频道会显示版权节目的试看限制提示](https://p.statickksmg.com/cont/2023/10/08/image_1696731269_qOxBpp34.jpg)

## 📝 更新日志

- **0.11** —— 回看解锁、组件自动恢复、fetch 拦截、移动端适配
- **0.10** —— 流地址被服务器置空时经 app 接口主动取回
- **0.9** —— 解除节目屏蔽导致的播放器不创建与流地址置空

## 🌐 兼容性

兼容 [Tampermonkey](https://tampermonkey.net/) / [Violentmonkey](https://violentmonkey.github.io/)，但在较旧的浏览器中 Violentmonkey 可能无法运行此脚本。

支持**最新版** Chrome、Firefox，不保证在 Safari 和[套壳类浏览器](https://www.jianshu.com/p/67d790a8f221)中完美运行。

## 📱 移动端

支持在移动端收看，前提是移动端浏览器支持 **[Tampermonkey](https://tampermonkey.net/)** 插件并能运行其脚本。

💎 **如何选择**

- 追求**最接近电脑 Chrome 的安装体验**：**Kiwi Browser**、**Chrome Browser**、**Edge Browser**
- 看重**国产浏览器对 Chrome/Edge 扩展生态的兼容**：**狐猴浏览器**
- 习惯 **Firefox 桌面版**或开源生态：**Firefox for Android**
- **X 浏览器**：轻量、无广告、支持油猴脚本

---

<div align="center">

仅为学习交流使用，请于 24 小时内删除

</div>
