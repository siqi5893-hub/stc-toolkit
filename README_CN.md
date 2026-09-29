# STC Toolkit

[English](./README.md) | [简体中文](./README_CN.md)

STC Toolkit 是一个面向 **STC 单片机开发** 的 VS Code 扩展，目标是把 **Keil 工程识别、编译、固件定位、UART ISP、USB ISP 和烧录流程** 尽量统一到 VS Code 中。

项目遵循一个核心原则：

> **老型号保持向下兼容，新型号不强行套用旧协议。**

## 功能

- 自动识别 Keil `.uvproj` / `.uvprojx` 工程
- 调用 Keil `UV4.exe` 编译 / 重编译
- 自动寻找最新 `.hex` / `.ihx` / `.ihex` 固件
- 一键 **Build / Flash / Build & Flash**
- 多烧录后端
- 自动识别 MCU 系列
- UART ISP 串口选择
- 实验性原生 USB-HID 后端
- 新型号 / 大容量芯片自动回退官方 STC-ISP / AiCube
- 支持自定义 CLI、Python、Rust、C/C++ 烧录器

## 当前支持

| 系列 | 默认后端 | 状态 |
|---|---|---|
| STC89 / STC90 | stcgal | 支持 |
| STC10 / STC11 / STC12 | stcgal | 支持 |
| STC15 | stcgal | 支持 |
| STC8 | stcgal | 支持 |
| STC8G / STC8H | stcgal | 支持 |
| STC8H8K64U | Native HID / Official | 实验性 |
| STC32G12K128 / STC32F12K54 | Native HID / Official | 实验性 |
| **STC32G144K246** | **Official** | 扩展 HID 地址协议验证完成前推荐官方工具 |
| STC33 / AI8051U | Official | 推荐官方工具 |

当前实验性 Native HID 后端会主动拒绝地址超过 `0xFFFF` 的固件，以避免在大容量芯片上使用尚未验证的地址格式。

## 工程识别

插件自动搜索：

```text
*.uvproj
*.uvprojx
```

并读取：

```text
TargetName
Device
```

然后判断 MCU 系列和默认烧录后端。

## 编译

默认调用：

```text
UV4.exe -b project.uvproj
```

重编译：

```text
UV4.exe -r project.uvproj
```

配置示例：

```json
{
  "stcToolkit.keil.uv4Path": "C:\\Keil_v5\\UV4\\UV4.exe"
}
```

也可以使用自定义编译命令：

```json
{
  "stcToolkit.build.customCommand": "你的编译命令"
}
```

## 固件自动发现

编译完成后自动寻找最新：

```text
.hex
.ihx
.ihex
```

也可以手动执行：

```text
STC: Select Firmware File
```

## 烧录后端

### Auto

推荐默认使用：

```json
{
  "stcToolkit.flash.backend": "auto"
}
```

插件会根据识别到的芯片型号自动选择后端。

### stcgal

适用于传统 UART ISP：

```json
{
  "stcToolkit.flash.backend": "stcgal",
  "stcToolkit.flash.port": "COM3",
  "stcToolkit.flash.baud": 115200
}
```

推荐映射：

```text
STC89/90      -> stc89
STC10/11/12   -> stc12
STC15         -> stc15
STC8          -> stc8d
STC8G/H       -> stc8g
```

### Native USB HID（实验性）

启用：

```json
{
  "stcToolkit.flash.backend": "native-hid",
  "stcToolkit.flash.nativeHidExperimental": true
}
```

安装依赖：

```bash
pip install hidapi
```

可选自动进入 ISP：

```json
{
  "stcToolkit.flash.nativeHidAutoReset": true,
  "stcToolkit.flash.nativeHidResetCommand": "@STCISP#"
}
```

当前 Native HID 对超过 `0xFFFF` 地址空间的固件进行安全拦截。

### Official STC-ISP / AiCube

对于 **STC32G144K246** 这类较新或大容量芯片，目前推荐：

```json
{
  "stcToolkit.flash.backend": "official",
  "stcToolkit.officialIspPath": "E:\\Chrome\\stc-isp6.96s\\STC-ISP-v6.96S.exe"
}
```

在 `auto` 模式下，STC32G144K246 会自动选择官方后端。

### Custom Backend

可以接入任何自定义烧录器：

```json
{
  "stcToolkit.flash.backend": "custom",
  "stcToolkit.flash.customCommand": "python tools\\flash.py --chip ${device} --file ${firmware}"
}
```

可用变量：

```text
${firmware}
${port}
${protocol}
${workspaceFolder}
${projectFile}
${device}
```

## 命令

```text
STC: Build Project
STC: Rebuild Project
STC: Flash Firmware
STC: Build & Flash
STC: Select Flash Backend
STC: Select Serial Port
STC: Select Firmware File
STC: Open Official STC-ISP / AiCube
STC: Show Project / Device Info
```

状态栏左下角的 **STC** 按钮默认执行 **Build & Flash**。

## STC32G144K246 推荐配置

```json
{
  "stcToolkit.flash.backend": "auto",
  "stcToolkit.officialIspPath": "E:\\Chrome\\stc-isp6.96s\\STC-ISP-v6.96S.exe"
}
```

后续目标是补全 STC32G144K246 的大容量 USB-HID ISP 协议，最终实现：

```text
VS Code
  -> Build
  -> Detect STC USB Writer
  -> Erase
  -> Program
  -> Verify
  -> Reset
```

完全不需要打开官方 GUI。

## Roadmap

- 验证 STC32G144K246 扩展 USB-HID 地址协议
- 原生擦除 / 写入 / 校验 / 复位
- 用户程序自动切换 ISP
- 扩展 STC32 / STC33 / AI8051U 支持
- 完善芯片数据库与协议能力检测
- 增加 VS Code 侧边栏设备 / 固件 / 后端 / 烧录状态 UI

## License

插件代码使用 MIT License。

`stcgal`、Keil、STC-ISP、AiCube 等外部工具保留各自许可证，除非特别说明，否则不会随插件捆绑发布。
