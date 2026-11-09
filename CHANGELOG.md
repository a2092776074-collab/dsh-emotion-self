# Changelog

## 0.2.1 — 2026-11-09

- **修 `VOICE` 未导出**：`index.js` 从 pipeline 导入 `VOICE`，pipeline 没导出它——插件一加载就报
  `does not provide an export named 'VOICE'`。已补导出。
- **补 `cordis.patch.yml`**：DSH 靠这个文件注册插件，缺了它插件不会加载（记忆插件有，之前漏了）。
- **修 veto 读不到配置**：配置路径原来写死成「包根/数据/情绪配置.json」，
  打包后包根变了，于是**永远读不到配置 = 一条都不拦**。现在按
  `DSH_EMOTION_CONFIG → DSH_WORKSPACE/数据 → 当前目录/数据 → 包内/数据` 依次找。
- **语气档案改成通用模板**：称呼、忌讳、场合松紧都是占位值，使用者自己改。

## 0.2.0 — 2026-11-09

- 加 `guessScene`：自动判场合（评论/私信/群聊/文档/回复），不用每次手填。
- `emotion_check` 返回结构化结果：改写文本、改动列表、问题清单、是否被拦、否决建议。

## 0.1.0 — 2026-11-09

- 第一版：把语气档案接到情绪模块上，提供 `emotion_check` 工具。
