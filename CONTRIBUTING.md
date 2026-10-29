# 参与贡献

本仓库仅适配 README 指定课程，不承诺支持其他课程或其他平台。

1. Fork 后创建分支，使用 Node.js 22 或更新版本运行 `npm ci`。
2. 修改后运行 `npm test`；涉及页面流程时运行 `npx playwright install chromium` 和 `npm run test:browser`。
3. 使用合成题干、选项和页面夹具复现问题，不提交真实题库、登录状态或个人报告。
4. Pull Request 说明触发条件、修复后的行为、验证结果及已知限制。

提交前执行 `git add`，检查 `git diff --cached`，并运行 `npm run check:release`。该检查只检查当前跟踪文件，不替代对整个提交历史的审阅。

反馈问题请包含项目版本、Windows/Node/Edge 版本和脱敏后的错误。不要直接附整个 `data/` 或 `browser-profile/` 目录。
