# 月下誓约桌宠（Windows）

一个独立运行的 Windows 桌宠原型。包含透明置顶窗口、平滑自动散步、点击/拖拽互动、托盘常驻、开机自启、本地提醒和 OpenAI 兼容 API 对话。

## 下载 Windows 版

打开本仓库右侧的 **Releases**，下载最新的 `LunarVowPet-Windows-x64-*.zip`。完整解压后运行 `LunarVowPet.exe`，不需要安装 Node.js。

## 直接运行

解压发布包，双击 `LunarVowPet.exe`。第一次运行时 Windows 可能显示 SmartScreen，因为这是未购买代码签名证书的个人构建；选择“更多信息 → 仍要运行”即可。

- 单击角色：互动反馈
- 拖动角色：角色会稳定跟随系统光标，松手后停在放置位置
- 双击或右键角色：打开聊天与提醒面板
- 托盘图标：显示/隐藏、暂停散步、设置开机自启或退出

## AI 聊天

基础桌宠和提醒无需联网。AI 聊天采用 OpenAI Chat Completions 兼容格式，可在“设置”中选择 OpenAI、DeepSeek、Google Gemini，或自行填写其他兼容服务的 Base URL、模型名和 API Key。“角色人设”支持自定义性格、措辞和关系设定，并会作为每次对话的系统提示词。

常用配置：

- OpenAI：`https://api.openai.com/v1`
- DeepSeek：`https://api.deepseek.com`
- Google Gemini：`https://generativelanguage.googleapis.com/v1beta/openai`

程序会自动在 Base URL 后添加 `/chat/completions`。API Key 由 Electron `safeStorage` 调用 Windows 系统加密后保存在本机，不写入页面或源码；不要求密钥的本地兼容服务可以留空。

桌宠大小可在设置中按 50%～150% 调节。保存后角色和透明窗口会同步缩放，拖动范围也会按新尺寸重新计算。

## 本地开发

需要 Node.js：

```powershell
npm install
npm start
```

生成 Windows x64 便携目录：

```powershell
npm run package:win
```

## 当前动画实现

当前行走使用 8 帧透明逐帧动画，包含左右脚交替、身体重心变化、手臂反向摆动以及头发和裙摆的次级动作，约每 105 毫秒切换一帧。窗口位移按实际经过时间独立计算，因此角色动作与桌面移动不会互相造成抖动。左右行走共用同一套帧并自动镜像，停止后回到一致的站立帧。

桌宠与聊天/设置面板使用两个独立窗口：桌宠窗口会严格贴合当前缩放后的角色尺寸，面板保持固定大小且打开时暂停行走，因此缩放不会压缩拖动范围，面板也不会跟着角色移动或被拉长。

拖动由主程序直接读取系统光标，避免窗口移动造成坐标反馈和跳动；松手后保留放置高度，自动散步仅沿水平方向继续。跨显示器拖动时会根据光标目标选择最近的显示器，并把整个角色窗口限制在对应工作区内。
