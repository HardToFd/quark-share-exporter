# 夸克分享链批量导出

一个基于夸克网盘官方 `quarkclouddrive` Skill v1.0.15 的跨平台桌面工具。支持 Windows/macOS，串联本机批量上传、网盘目录筛选、分享链批量生成以及 CSV/Excel 导出。

## 已实现

- Electron + React + TypeScript 桌面 GUI，使用沙箱化渲染器和最小 IPC 桥接。
- 浏览器 OAuth 授权，以及自动回传失败后的授权码粘贴入口。
- 本机多文件/多文件夹递归上传，显示官方 NDJSON 上传进度。
- 严格区分上传目标：
  - `Skill 默认目录`：省略 `--parent-fid`；
  - `根目录`：只有用户明确选择时传 `--parent-fid 0`；
  - `指定目录`：传用户填写的 FID。
- 网盘目录模式读取 `search` 命令生成的完整 artifact，再按 `path + parent_fid` 构建路径范围。
- 自定义最大深度、是否包含根目录、仅文件/文件夹/两者。
- 分享策略：
  - 逐项生成独立链接；
  - 合并成组（每组最多 100 项）；
  - 公开链接或私密链接；
  - 永久、1/7/30/60/100/180 天；
  - 私密提取码由夸克服务端生成，不能在客户端自定义。
- CSV（UTF-8 BOM）和 Excel 双格式导出。Excel 包含“分享链接”和“任务摘要”两个工作表。
- 失败项可继续执行并写入导出文件；停止任务时保留并导出已完成的部分结果。
- 官方 CLI 文件在运行前做 SHA-256 完整性校验，不打包账号配置、token 或搜索历史。

## 一键工作流

本机来源：

```text
选择本机文件/目录 → 上传到夸克网盘 → 使用上传返回 FID → 按深度筛选 → 创建分享链 → CSV/Excel
```

网盘来源：

```text
输入目录名称/位置描述 → 官方 search 一次 → 读取全量 artifact → 选择路径根目录 → 深度筛选 → 创建分享链 → CSV/Excel
```

## 导出字段

| 字段 | 说明 |
| --- | --- |
| 批次ID、状态、错误信息 | 用于任务追踪与失败重跑 |
| 来源、本机原路径、网盘路径、相对路径 | 文件来源和层级信息 |
| 名称、类型、深度、大小、FID | 网盘对象信息 |
| 分享粒度、可见性、有效期 | 分享策略快照 |
| 分享链接、提取码、创建时间 | 最终交付信息 |
| 路径映射 | 本机同名同大小文件的匹配置信度 |

CSV 会防护以 `= + - @` 开头的单元格，避免在 Excel 中被解释为公式。已有同名导出文件不会被覆盖，工具会自动追加序号。

## 目录扫描边界

官方 Skill v1.0.15 没有公开 `browse/list-directory` 子命令。当前工具采用官方 `search --size 3000` 的完整 artifact，并以返回的精确路径做前缀过滤和深度重算。因此：

- 不读取 stdout 中至多 5 条的预览列表；
- 单次检索最多 3000 项；
- 达到 3000 项时，界面和 Excel 摘要都会标记“结果可能不完整”；
- 工具不会自动换词或拆分搜索重试；
- 若未来官方 Skill 提供目录分页 API，应替换 `electron/services/quarkService.ts` 中的扫描适配器，以获得超大目录的严格全集保证。

本机上传链路不受上述搜索上限影响，分享对象直接来自上传成功事件返回的 FID。

## 本地开发

要求：Node.js 24+。

```bash
npm install
npm run dev
```

常用校验：

```bash
npm run typecheck
npm test
npm run build
npm audit
```

## 打包

Windows：

```bash
npm run dist:win
```

生成 NSIS 安装包和便携版 EXE，输出到 `release/`。当前工程不含 Windows 代码签名证书，外部分发前应配置 Authenticode 签名。

macOS：

```bash
npm run dist:mac
```

在 macOS 主机上生成同时支持 Intel 与 Apple Silicon 的 Universal DMG/ZIP。仓库同时提供 `.github/workflows/build-desktop.yml`，会在 Windows/macOS runner 分别构建。electron-builder 不支持在 Windows 主机上生成 macOS 包；当前配置也不包含 Apple Developer ID 签名与 notarization，正式对外分发前应在 macOS 构建环境配置签名证书。

## 工程结构

```text
electron/
  main/                 Electron 窗口与 IPC 注册
  preload/              沙箱化最小桥接
  services/             CLI、认证、工作流、导出、文件清单
src/
  app/                  应用入口
  pages/workspace/      工作台页面、模型、页面 UI 与样式
  shared/               通用类型、格式化与基础控件
vendor/quark-drive/     官方 CLI 运行时与 SHA-256 清单（不含账号数据）
```

## 隐私与安全

- OAuth 和网盘操作由官方 CLI 执行。
- 应用不读取、显示或导出 access token。
- 渲染器启用 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`。
- 外部链接只允许 HTTPS，并交给系统浏览器打开。
- 符号链接不会递归上传，避免目录环。
- 分享设置必须在开始前由用户显式确认。
