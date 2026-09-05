# SMGTV 直播解锁 · 增强版<br>
观看上海 SMGTV（看看新闻 `kankanews.com/huikan`）全部频道直播，不受试看、切页暂停与节目屏蔽限制

![version](https://img.shields.io/badge/版本-0.11-blue) ![license](https://img.shields.io/badge/许可-MIT-green) ![userscript](https://img.shields.io/badge/类型-油猴脚本-orange)

基于 [Popukok/smg_live](https://github.com/Popukok/smg_live) 原版增强维护。

# 功能

* **解除节目屏蔽** —— F1、世界杯等版权节目的屏蔽字段（`is_shield`）在接口层直接放行
* **流地址主动取回** —— 服务器在 pc 路由置空流地址时，脚本用页面同款签名走 app 接口取回直播地址并回填（原版仅靠被动缓存，冷启动无米下锅）
* **回看解锁** —— 已播完节目可直接回看：缺少时间窗参数时自动用节目起止时间拼出回看地址
* **解除试看倒计时** —— 倒计时被拦截，不会跳出试看结束提示
* **切页不暂停** —— 切换浏览器标签页后直播不中断
* **播放器自愈** —— 播放器报错（空地址、媒体错误）时自动回填地址并重建，节目单轮询替换数据也不受影响
* **全屏兜底** —— 原生全屏失败时回退 iOS 视频全屏 / CSS 全屏
* **移动端适配** —— 刘海屏 safe-area、viewport-fit=cover

# 安装
需要浏览器装有 [Tampermonkey](https://tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) 插件, 点击下方表格中安装，即可安装脚本.

|正式版 (GitHub 源)                                                                           |
|---------------------------------------------------------------------------------------------|
| [安装](https://g.geeck.eu.org/https://raw.githubusercontent.com/adamllll/smg_live/refs/heads/main/smg_fivestar.user.js)  |

安完脚本后[点击打开看看新闻](https://live.kankanews.com/huikan?id=10)，点击对应的频道即可观看节目<br>
<br>
**例如收看五星体育频道F1比赛直播，可以跳过以下图片提示**

![这是图片](https://p.statickksmg.com/cont/2023/10/08/image_1696731269_qOxBpp34.jpg "")

# 更新日志

* **0.11** —— 合并原版新方案：回看解锁、组件生命周期管理（SPA 切换后自动恢复）、fetch 双拦截、移动端 safe-area / iOS 全屏兼容
* **0.10** —— 应对服务器置空 pc 路由流地址：新增 kapi 签名模块，经 app 路由主动取流回填（`m-uuid` 写入 CDN token）
* **0.9** —— 解除节目屏蔽导致播放器不创建与流地址被置空

# 兼容性
### [Tampermonkey](https://tampermonkey.net/) / [Violentmonkey](https://violentmonkey.github.io/)
兼容, 但在较旧的浏览器中 Violentmonkey 可能无法运行此脚本.
支持**最新版** Chrome, Firefox, 不保证脚本能在 Safari 和 ["套壳类浏览器"](https://www.jianshu.com/p/67d790a8f221) 中完美运行.

# 移动端
支持在移动端收看，前提是移动端浏览器支持 **[Tampermonkey](https://tampermonkey.net/)** 插件， <br>并且支持运行 **[Tampermonkey](https://tampermonkey.net/)** 脚本

💎  **如何选择**

*   如果你希望**安装过程最接近电脑上的Chrome体验**，能直接从Chrome网上应用店安装各种扩展，**Kiwi Browser** ，**Chrome Browser** , **Edge Browser** 是很不错的选择。
*   如果你看重**国产浏览器且对Chrome和Edge扩展生态的兼容性**，**狐猴浏览器**值得考虑。
*   如果你**习惯使用Firefox桌面版**，或者看重**开源生态**，那么 **Firefox for Android** 会很适合你。
*   **X浏览器**则以其**轻量级、无广告**的特点，并支持油猴脚本，吸引了部分用户。
