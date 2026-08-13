# 月下誓约桌宠（Windows）

一个独立运行的 Windows 桌宠原型。包含透明置顶窗口、自动散步、点击/拖拽互动、托盘常驻、开机自启、本地提醒和可选 OpenAI 对话。

## 下载 Windows 版

打开本仓库右侧的 **Releases**，下载最新的 `LunarVowPet-Windows-x64-*.zip`。完整解压后运行 `LunarVowPet.exe`，不需要安装 Node.js。

## 直接运行

解压发布包，双击 `LunarVowPet.exe`。第一次运行时 Windows 可能显示 SmartScreen，因为这是未购买代码签名证书的个人构建；选择“更多信息 → 仍要运行”即可。

- 单击角色：互动反馈
- 拖动角色：移动位置，松手后回到底部
- 双击或右键角色：打开聊天与提醒面板
- 托盘图标：显示/隐藏、暂停散步、设置开机自启或退出

## AI 聊天

基础桌宠和提醒无需联网。AI 聊天需要在“设置”里填写自己的 OpenAI API Key；密钥由 Electron `safeStorage` 调用 Windows 系统加密后保存在本机，不写入页面或源码。默认模型为 `gpt-5.6-luna`，可自行修改。

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

首版使用单张透明母版配合程序动画实现呼吸、行走摇摆、拖拽和点击弹跳。后续可在不改功能架构的前提下替换为逐帧或骨骼动画素材。
