# DSH 用量总览

[English](README.en.md)

一款 DeepSeek Harness 的用量总览面板插件。插件直接读取 Harness 自身的会话记录，
展示 Token 总量、全年活跃热力图、每日 Token 与缓存命中率趋势，以及按模型拆分的
用量构成和按日/按周堆叠图。

[GitHub](https://github.com/w-callan-w/dsh-usage-overview) · [Gitee](https://gitee.com/callanjones/deep-seek-harness-usage-plugin) · [npm](https://www.npmjs.com/package/dsh-usage-overview)

## 功能

- **头部指标**：累计 Token、单日峰值、最长聊天时长、当前/最长连续天数、缓存命中率。
- **Token 活动**：最近一年的每日用量热力图，周日对齐，五级强度。
- **每日 Token 趋势**：每个 Provider 路由一条平滑曲线，共享十字准线，图例显示各自合计。
- **每日缓存命中率**：按输入 Token 加权的每日命中率；当天没有输入 Token 时留空，不画成 0%。
- **模型用量**：圆环图、带来源的模型列表（Provider、会话数、轮数、Token、占比），
  以及按日/按周切换的堆叠柱状图。
- **时间范围**：近 7 日、近 30 日、近 90 日、全部。
- **无级自适应布局**：按面板宽度而不是窗口宽度布局；统计卡、模型区、时间范围控件
  和图表都会随可用空间连续调整。
- **浅色/深色主题**：颜色来自 DSH 主题 Token；提示气泡使用自身深色表面的专用前景色。

| 桌面 | 手机（390px） |
|---|---|
| ![桌面](docs/dashboard.png) | ![手机](docs/dashboard-mobile.png) |

## 安装

本插件是一个 DSH Bundle，需要宿主提供 `webServer` 服务。

### 从 npm 安装

包名为 `dsh-usage-overview`。把它加入当前 Profile：

```sh
cd "$DSH_HOME/profiles/desktop"
pnpm add dsh-usage-overview
```

然后在 Profile 的 `package.json` 中把 `"dsh-usage-overview"` 加入
`dsh.profile.bundles`，重启 DeepSeek Harness。

### 从本地目录安装

1. 将包复制到目标 Profile：

   ```sh
   cp -r dsh-usage-overview "$DSH_HOME/profiles/desktop/node_modules/"
   ```

2. 在 `$DSH_HOME/profiles/desktop/package.json` 的 Bundle 列表中注册：

   ```json
   {
     "dsh": {
       "profile": {
         "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-usage-overview"]
       }
     }
   }
   ```

3. 重启 DeepSeek Harness。侧边栏出现 **用量统计** 入口。

Desktop 版本只在启动时组装一次 Profile，运行中修改文件不会挂载新 Bundle，需要退出并
重新启动。使用 DSH HMR Bundle 的 CLI Profile 可以在清单变化时自动重载。

## 使用

在侧边栏打开 **用量统计**。

- 时间范围控制头部指标、每日 Token 趋势、缓存命中率图以及模型用量趋势。
- Token 活动始终绘制全年网格，时间范围不会改变它的窗口。
- 悬停图表可查看对应日期/周的精确数据。
- 模型用量图支持 **每日 / 每周** 切换；周以周一为起点，首尾不完整的周仍会显示。
- 面板较窄时，热力图可横向滚动，并默认定位到最新几周。

## 数据来源

插件只读取 Harness 的持久化数据，不写入任何 Harness 状态，不调用模型，也不注册
面向模型的工具。

1. **会话日志**：`$DSH_HOME/sessions/<workspace>/<session>/session.v4.jsonl.zstd`。
   每个日志由多个独立压缩的 zstd frame 组成，需要逐帧解码。assistant 消息自带时间、
   Provider 用量、Provider 和模型信息，可还原真实的每日与分路由数据。
2. **会话索引**：目录信息提供会话 ID、创建时间和日志路径。
3. **投影缓存**：`$DSH_HOME/storages/session_projcache/sessions/*.json` 在日志不可读时
   作为兜底，并提供会话标题。
4. **实时会话服务**：`ctx.sessions.list()` 与
   `ctx.sessionProjections.snapshot(session)` 让正在运行的会话立即计入统计。

缓存读取按计费 Token 计入。缓存命中率公式：

```text
cacheRead / (cacheRead + cacheWrite + uncachedInput)
```

输出 Token 不参与计算，因为输出无法命中缓存。

## HTTP 接口

接口只读，不写入任何 Harness 状态。

| 路由 | 用途 |
|---|---|
| `GET /plugins/dsh-usage-overview/stats?range=7d\|30d\|90d\|all` | 聚合后的看板数据 |

来自本机回环地址的请求会被接受；经过 DSH 会话认证的远程请求同样会被接受，因此
手机通过远程隧道访问时无需把接口暴露给匿名调用者。

浏览器端由 DSH 客户端模块系统提供，并在页面的 boot graph 中声明。

## 开发

构建和检查脚本不依赖打包器，直接用 Node.js 运行。

```sh
node scripts/build.mjs
```

该命令把 Host 端的 `lib/*.js` 从 `src/` 复制过去，并把浏览器端打包成
`lib/client.js`（DSH 的模块加载格式）。

### 检查

| 命令 | 作用 |
|---|---|
| `node scripts/check-sources.mjs` | 客户端源码语法与样式模板 |
| `node scripts/lint-bundle.mjs` | 构建后的浏览器 Bundle 可解析 |
| `node scripts/check-build-fresh.mjs` | `lib/` 与最新构建一致 |
| `node scripts/test-aggregation.mjs` | 聚合、归属、缓存命中率与边界条件 |
| `node scripts/render-check.mjs` | Bundle 可物化并在 React Stub 中渲染 |
| `node scripts/preview.mjs` | 生成静态预览 |
| `node scripts/responsive-check.mjs [origin]` | 七种宽度、实时缩放、浅色/深色对比度、截图 |
| `node scripts/verify-install.mjs` | 已安装 Profile 的清单、导出、路由与信任校验 |
| `node scripts/verify-live.mjs [origin]` | 运行中的宿主确实提供路由和 Bundle |

`responsive-check.mjs` 与 `verify-live.mjs` 需要宿主正在运行；如果端口不是默认的
`http://127.0.0.1:50494`，请把实际地址作为参数传入。

## 布局与主题

看板测量的是面板宽度，不是窗口宽度。统计卡以 150px 为基准自动换行，模型区和时间
范围控件按内容宽度决定并排或换行，每个图表按测量到的像素宽度重绘；字号、间距和
内边距使用容器查询单位连续缩放，不依赖固定布局断点。

颜色使用 DSH 的 `--dsw-*` 主题 Token。提示气泡在浅色和深色主题下都是深色表面，
因此使用 `--dsw-alias-tooltip-label`；小号标签和图表坐标轴使用对比度更高的
Secondary 文本 Token。`responsive-check.mjs` 的主题检查会强制最低对比度不低于 4.5:1。

## 许可证

MIT
