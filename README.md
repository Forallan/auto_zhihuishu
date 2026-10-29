# 智慧树能力测评自动化

[![Tests](https://github.com/Forallan/auto_zhihuishu/actions/workflows/ci.yml/badge.svg)](https://github.com/Forallan/auto_zhihuishu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向**自动化学院《国家安全概论》研究生课程**的 Windows 自动化工具。仅适配下面配置的这一门课程，不是通用智慧树刷课工具，不属于平台官方项目。

> 实验性项目。能自动完成正常测评流程，但不保证所有题目正确、不保证最终掌握度达到 100%，也不能保证全程无人干预。课程 AI 无法给出明确结论、登录过期或页面变化时，程序可能暂停。

## 环境与安装

- Windows 11 或当前 Playwright 支持的 Windows 环境。
- Node.js 22 或更新版本（建议 22/24 LTS），安装包需包含 npm。
- Microsoft Edge。
- 自己的智慧树账号，且有权访问**同一门课程**及其能力测评、AI 学伴功能。

**不需要安装 Codex，不需要共享任何人的账号、Cookie 或模型凭证。**

1. 下载仓库 ZIP 并解压，或执行：

   ```powershell
   git clone https://github.com/Forallan/auto_zhihuishu.git
   cd auto_zhihuishu
   ```

2. 双击 `setup.cmd`，安装锁定的项目依赖并运行离线检查。也可以在项目目录执行：

   ```powershell
   npm ci
   npm test
   ```

3. 双击 `start.cmd`。首次运行时，在新开的项目专用 Edge 中使用自己的账号登录并进入课程首页。程序默认每次最多运行 100 轮。

依赖安装需要网络。日常运行使用已有 Edge，无需额外下载测试浏览器。不要从终端运行来源不明的修改版脚本；仓库中的启动器仅为本次脚本执行设置 PowerShell 策略，不修改系统永久设置。

## 操作流程

课程首页 → 能力测评新标签页 → 测评近期知识点 → 逐题作答 → 提交报告 → 等待生成完成并展开知识点列表 → 本地保存 → 关闭测评页 → 刷新首页 → 下一轮。

程序重新接受平台分配的知识点，跟随平台切换测评内容；不直接修改掌握度或调用隐藏的成绩写入接口。

- 单选题和判断题选择后等待反馈；多选题完成勾选后提交。
- 已验证题目按选项**内容**缓存，选项乱序后重新映射；真实答案缓存不随仓库分发。
- 新题通过课程首页的 AI 学伴分析；明确总结解析失败时默认最多自动尝试三次。
- 判题后的标准答案会校正缓存。AI 本身仍可能答错，掌握度也可能下降。
- 新标签页恢复已答完的旧题卡时，会新建对话开始下一轮；现有未完成题目尽量接续。
- 未显示掌握度的知识点保持未知；学习进度 100% 不视为掌握度 100%。

运行时请保留项目专用 Edge，不要同时在其中手动答题或向 AI 学伴发送消息。分析请求会出现在自己的课程聊天记录中。原来的个人浏览器可以继续使用。

## 查看、停止与恢复

| 入口 | 功能 |
| --- | --- |
| `status.cmd` | 显示当前题目、累计完成轮数和知识点状态 |
| `stop.cmd` | 发出停止请求，当前操作结束后保留现场 |
| `start.cmd` | 启动或从保留的页面继续 |

连续无变化、达到轮数限制、加载超时或需要人工确认都不等于已完成。只有首页列出的知识点全部明确达到 100%，才记录为完成。浏览器或 AI 的单次等待可能持续到配置的超时上限，停止请求不保证即时打断当前操作。

### 等待确认答案

三次自动分析仍失败时，终端显示 `waiting-answer`，题目保存在 `data/pending.json`。可以自行分析题目后在项目目录执行：

```powershell
node cli.mjs resolve AC 终端显示的题目ID
```

`AC` 只是命令格式示例，应替换为实际答案；判断题用 `✓` 或 `✗`。题目 ID 和等待 token 会校验，避免旧答案交到下一题。

如果已等待 30 分钟超时退出，可先保存确认答案，再启动 `start.cmd`；无需删除进度或缓存。单纯延长等待时间不会改善独立答题能力。不要把整个数据目录发到公开 Issue 求助。

## 指定课程与配置

默认入口：

```text
https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/2101609010059079680/299118
```

这个地址指定课程，不包含账号密码或用户级 `mapUid`；每位使用者必须自行登录并获得课程访问权。相同课程在不同学校或教学班的页面权限、入口参数和功能可能不同，此项目未验证其他教学班。

修改 `config.json`，或创建不提交到 Git 的 `config.local.json` 覆盖本地设置。

| 设置 | 默认值 | 含义 |
| --- | --- | --- |
| `cdpUrl` | `http://127.0.0.1:9222` | 专用 Edge 本机连接地址 |
| `courseUrl` | 上述课程地址 | 本项目的适配目标 |
| `solver` | `course-ai` | 也支持 `queue` 人工确认模式或 `http` 服务适配 |
| `solverAttempts` | 3 | 课程 AI 尝试次数，范围 1–10 |
| `timeoutMs` | 120000 | 页面及 AI 单次等待上限，毫秒 |
| `answerTimeoutMs` | 1800000 | 人工确认等待上限，毫秒 |
| `maxRounds` | 100 | 直接运行 CLI 时的单次轮数上限 |
| `maxStagnantRounds` | 5 | 连续完全无变化的轮数阈值 |

启动脚本默认使用 100 轮；自定义脚本轮数：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -Rounds 3
```

`http` 模式仅提供适配器，**没有预置的模型服务**。配置 `solverUrl` 后发送 POST JSON `{id,type,stem,options:[{key,text}]}`，要求返回 `{answers:["A","C"]}`。可选环境变量 `ZHS_SOLVER_KEY` 以 Bearer 方式发送。题干和选项会发送给所配置服务，请仅使用可信地址，远程服务使用 HTTPS。

## 数据和隐私

运行后只在本机生成下列文件；仓库不包含它们：

| 路径 | 内容 |
| --- | --- |
| `browser-profile/` | Cookie、登录状态、浏览历史等敏感浏览器数据 |
| `data/progress.json` | 状态与最新知识点清单 |
| `data/reports/` | 报告正文、掌握度及页面截图 |
| `data/events.jsonl` | 答题、AI 分析和运行事件 |
| `data/solver-replies/` | 包括无法解析的原始 AI 回复 |
| `data/answer-bank.json` | 本人运行过程中积累的已验证答案 |
| `data/last-page.*` | 异常现场，可能包含个人信息 |

以上目录、`.env*`、本地配置等已加入 `.gitignore`；这不能保护手动打包上传的文件或已经进入 Git 历史的内容。仅在本机使用浏览器调试端口，不要暴露到公网。详见 [SECURITY.md](SECURITY.md)。

## 测试和维护

```powershell
npm test
npx playwright install chromium
npm run test:browser
```

离线测试包含答案映射、解析、重试及超时恢复；浏览器测试使用合成页面和独立无头浏览器，不登录智慧树、不连接正在使用的个人浏览器。默认使用 Chromium；GitHub Actions 在 Windows 的 Node.js 22/24 上使用预装的 Edge 执行检查，无需另行下载 Chromium。测试覆盖这些行为，不代表覆盖平台所有题目或页面状态。

测试浏览器下载受限时，也可使用已安装的 Edge 进行无头检查：在 PowerShell 中设置 `$env:ZHS_TEST_BROWSER_CHANNEL='msedge'`，然后执行 `npm run test:browser`。日常测评使用 Edge，不受这项测试设置影响。

真实平台流程曾在指定课程上验证；课程 UI、AI 学伴策略和平台判题行为变化可能导致工具失效。`src/browser.mjs` 为页面适配，`src/solver.mjs` 为答题来源，`src/domain.mjs` 为答案解析。

参与贡献和脱敏反馈方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。请勿提交真实题库、课件、报告截图或登录状态。本项目未取得平台或学校的自动化授权；使用前自行确认相关规则。MIT 许可证仅覆盖本仓库代码，不授予第三方课程内容或平台素材的使用权。

## 许可证

[MIT](LICENSE)，Copyright © 2026 Forallan。
