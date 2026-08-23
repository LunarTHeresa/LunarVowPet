# 月下誓约桌宠 Windows 版

## 下载安装

1. 在下方 **Assets** 中下载 `LunarVowPet-Windows-x64-v*.zip`，不要下载 GitHub 自动生成的 Source code 压缩包。
2. 将 ZIP 完整解压，不要直接在压缩包内运行，也不要单独移动 `LunarVowPet.exe`。
3. 进入解压得到的 `LunarVowPet-win32-x64` 文件夹，双击 `LunarVowPet.exe`。
4. 如果 Windows SmartScreen 弹出提示，请选择“更多信息 → 仍要运行”。

无需安装 Node.js。发布包适用于 64 位 Windows。

## 当前版本

- 移除不自然的自动散步，月下会稳定停留在用户放置的位置。
- 提供开心、害羞、好奇、困倦、得意和病娇六套独立立绘与动作，尺寸和身体比例统一；仅在用户单击或从托盘手动选择时切换。
- 未配置 API 时使用本地台词；配置自己的 OpenAI、DeepSeek、Gemini 或其他兼容 API 后，单击与聊天回复会结合当前表情和情境由 AI 生成。
- 缩放滑块可实时预览，聊天与设置面板保持固定大小，不会随角色缩放或双击而异常变大。
- 改善拖拽稳定性、跨显示器限制和窗口可见区域恢复。

## API 与隐私

API 是可选项，每位使用者需要填写自己的 API Key。此仓库和发布包不包含作者的 API Key。密钥会通过 Electron `safeStorage` 使用 Windows 系统能力加密后保存在当前用户的本机数据目录，不会写入源码或发布包。基础桌宠、内置台词和本地提醒无需 API。

完整说明请阅读仓库首页的 README。
