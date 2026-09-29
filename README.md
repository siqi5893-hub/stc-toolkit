# STC Toolkit

一个从零编写的 VS Code 扩展原型，目标是把常见 STC MCU 的 **工程识别 / Keil 编译 / 固件选择 / ISP 烧录** 放到 VS Code 里。

## 支持思路

- Keil `.uvproj` / `.uvprojx` 自动发现。
- Build / Rebuild：调用 `UV4.exe -b/-r`，因此同一个扩展可承接 Keil C51 和 C251 工程；也支持自定义构建命令。
- Flash：默认调用 `stcgal`。
- 族到 stcgal 协议的建议映射：
  - STC89/90 → `stc89`
  - STC10/11/12 → `stc12`
  - STC15 → `stc15`
  - STC8 → `stc8d`
  - STC8G/H → `stc8g`
  - STC32 → `stc8d`
- 自定义烧录命令后端：用于 patched stcgal、厂商 CLI 或你自己的 HID/UART flasher。
- 官方 STC-ISP 后端：作为兜底，仅启动官方程序，不做 GUI 自动点击。

> 注意：stcgal 虽然覆盖 STC89/10/11/12/15/8/32 系列，但**具体新型号是否已收录**取决于所安装 stcgal 版本。STC32G144K246 这类较新的型号需要实机验证；如果 stcgal 不识别，可以使用 custom backend 或官方 STC-ISP。

## 安装（开发版）

1. 解压源码目录。
2. VS Code 打开该目录。
3. 按 `F5` 启动 Extension Development Host。
4. 在新窗口打开你的 STC 工程。

也可以安装附带的 `.vsix`：扩展面板 → `...` → **Install from VSIX...**。

## 基础配置

VS Code 设置中搜索 `STC Toolkit`。

常用配置：

```json
{
  "stcToolkit.keil.uv4Path": "C:\\Path\\To\\Keil_v5\\UV4\\UV4.exe",
  "stcToolkit.flash.backend": "stcgal",
  "stcToolkit.flash.stcgalPath": "stcgal",
  "stcToolkit.flash.protocol": "auto",
  "stcToolkit.flash.port": "COM3",
  "stcToolkit.officialIspPath": "C:\\Path\\To\\STC-ISP\\STC-ISP-v6.96S.exe"
}
```

## 命令

- `STC: Build Project`
- `STC: Rebuild Project`
- `STC: Flash Firmware`
- `STC: Build & Flash`
- `STC: Select Serial Port`
- `STC: Select Firmware File`
- `STC: Open Official STC-ISP`
- `STC: Show Project / Device Info`

状态栏左下角的 **STC** 也可以直接执行 `Build & Flash`。

## 自定义烧录器

把 backend 改成 `custom`：

```json
{
  "stcToolkit.flash.backend": "custom",
  "stcToolkit.flash.customCommand": "python tools\\flash.py --chip STC32G144K246 --file ${firmware}"
}
```

支持变量：`${firmware}`、`${port}`、`${protocol}`、`${workspaceFolder}`、`${projectFile}`。

## 设计取舍

这个原型借鉴了现有 STC VS Code 扩展“在 VS Code 管理 Keil 工程”的产品思路，但代码为独立实现，没有复制其源码。烧录层优先使用可自动化的 `stcgal`，避免把 GUI 点击自动化当成稳定 ISP 接口。
