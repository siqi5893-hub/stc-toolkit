# STC Toolkit

> 中文 / English bilingual README

STC Toolkit 是一个面向 **STC 单片机 + VS Code** 工作流的扩展原型，目标是把 **Keil 工程识别、编译、固件定位、串口/USB ISP 烧录** 尽量统一到 VS Code 中。

STC Toolkit is a VS Code extension prototype for **STC MCU development**. Its goal is to unify **Keil project detection, build, firmware discovery, UART ISP and USB ISP workflows** inside VS Code.

---

## 中文介绍

### 设计目标

不同年代的 STC 芯片使用的 ISP 方式并不完全一致，因此本插件不再把所有型号强行塞给一个烧录器，而是采用 **多后端自动选择**：

- **老型号 / 常见 UART ISP**：优先使用 `stcgal`，成熟、可脚本化、适合 STC89/90、STC10/11/12、STC15、STC8 等系列。
- **带硬件 USB 的较新型号**：预留插件原生 USB-HID 烧录后端。
- **STC32G144K246、STC33、AI8051U 等较新或大容量型号**：当前自动回退到官方 **STC-ISP / AiCube-ISP**，避免使用尚未验证的地址扩展协议造成误烧。
- **自定义后端**：可接入你自己的 CLI、Python、Rust、C/C++ 烧录器。

核心原则是：**旧型号向下兼容，新型号不硬套旧协议。**

### 当前支持矩阵

| 系列 | 默认后端 | 状态 |
|---|---|---|
| STC89 / STC90 | stcgal | 支持 |
| STC10 / STC11 / STC12 | stcgal | 支持 |
| STC15 | stcgal | 支持 |
| STC8 | stcgal | 支持 |
| STC8G / STC8H | stcgal | 支持 |
| STC8H8K64U | Native HID / Official | 实验性原生 HID，可回退官方 |
| STC32G12K128 / STC32F12K54 等 | Native HID / Official | 实验性原生 HID，可回退官方 |
| **STC32G144K246** | **Official** | 推荐官方 STC-ISP / AiCube；原生扩展地址协议尚未验证 |
| STC33 / AI8051U | Official | 推荐官方工具 |

> `native-hid` 目前故意拒绝烧录地址超过 `0xFFFF` 的固件，以避免在大容量芯片上使用未验证的地址格式。

### 工程识别

插件会自动寻找：

```text
*.uvproj
*.uvprojx
```

并从 Keil 工程中读取：

```text
TargetName
Device
```

然后判断芯片系列以及默认烧录后端。

### 编译

默认调用 Keil：

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

如果你的 VS Code 已经有自己的 Keil Build 链路，也可以配置：

```json
{
  "stcToolkit.build.customCommand": "你的编译命令"
}
```

### 自动寻找 HEX

编译后插件会自动寻找工作区里最新的：

```text
.hex
.ihx
.ihex
```

也可以手动执行：

```text
STC: Select Firmware File
```

### 烧录后端

#### 1. Auto

推荐默认使用：

```json
{
  "stcToolkit.flash.backend": "auto"
}
```

插件根据 Keil 工程里的芯片型号自动选择后端。

#### 2. stcgal

适合传统 STC UART ISP：

```json
{
  "stcToolkit.flash.backend": "stcgal",
  "stcToolkit.flash.port": "COM3",
  "stcToolkit.flash.baud": 115200
}
```

协议会根据型号自动建议，例如：

```text
STC89/90      -> stc89
STC10/11/12   -> stc12
STC15         -> stc15
STC8          -> stc8d
STC8G/H       -> stc8g
```

#### 3. Native USB HID（实验性）

插件附带一个实验性 USB-HID ISP helper，用于研究和逐步替代官方 GUI。

启用：

```json
{
  "stcToolkit.flash.backend": "native-hid",
  "stcToolkit.flash.nativeHidExperimental": true
}
```

Python 需要安装：

```bash
pip install hidapi
```

如果用户程序支持 STC 官方的自定义复位命令，也可尝试：

```json
{
  "stcToolkit.flash.nativeHidAutoReset": true,
  "stcToolkit.flash.nativeHidResetCommand": "@STCISP#"
}
```

当前 Native HID 会主动拒绝超过 `0xFFFF` 地址空间的固件，因此 **STC32G144K246 暂不使用该后端**。

#### 4. Official STC-ISP / AiCube

对于最新型号和大容量型号，使用官方后端更稳妥：

```json
{
  "stcToolkit.flash.backend": "official",
  "stcToolkit.officialIspPath": "E:\\Chrome\\stc-isp6.96s\\STC-ISP-v6.96S.exe"
}
```

在 `auto` 模式下，STC32G144K246 会自动选择这一后端。

#### 5. Custom

可以接任何自定义烧录器：

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

### 命令

命令面板中提供：

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

状态栏左下角的 **STC** 按钮默认执行：

```text
Build & Flash
```

### 推荐配置：STC32G144K246

目前推荐：

```json
{
  "stcToolkit.flash.backend": "auto",
  "stcToolkit.officialIspPath": "E:\\Chrome\\stc-isp6.96s\\STC-ISP-v6.96S.exe"
}
```

插件会识别 `STC32G144K246`，编译仍可在 VS Code 完成，烧录阶段自动走官方工具。

后续计划是补全 STC32G144K246 的扩展地址 USB-HID ISP 协议，使其最终可以做到：

```text
VS Code
  -> Build
  -> Detect STC USB Writer
  -> Erase
  -> Program
  -> Verify
  -> Reset
```

完全不需要打开 STC-ISP GUI。

---

## English

### Goal

STC devices span several generations and do not all use exactly the same ISP transport or protocol. STC Toolkit therefore uses a **multi-backend architecture** instead of forcing every MCU through one programmer.

- **Legacy/common UART ISP devices** use `stcgal` by default.
- **Newer USB-capable devices** can use the experimental native USB-HID backend.
- **STC32G144K246, STC33, AI8051U and other new/large-flash parts** currently fall back to the official **STC-ISP / AiCube-ISP** path until their extended addressing protocol is fully verified.
- A **custom backend** can call any external CLI or script.

The main rule is: **keep backward compatibility for older STC devices without pretending that every new device uses the same old protocol.**

### Support Matrix

| Family | Default backend | Status |
|---|---|---|
| STC89 / STC90 | stcgal | Supported |
| STC10 / STC11 / STC12 | stcgal | Supported |
| STC15 | stcgal | Supported |
| STC8 | stcgal | Supported |
| STC8G / STC8H | stcgal | Supported |
| STC8H8K64U | Native HID / Official | Experimental native HID, official fallback |
| STC32G12K128 / STC32F12K54 | Native HID / Official | Experimental native HID, official fallback |
| **STC32G144K246** | **Official** | Official STC-ISP/AiCube recommended; extended addressing not yet verified |
| STC33 / AI8051U | Official | Official tool recommended |

The current native HID helper intentionally refuses firmware addresses above `0xFFFF` to prevent unsafe programming on large-flash devices.

### Project Detection

The extension detects Keil projects automatically:

```text
*.uvproj
*.uvprojx
```

It reads the `TargetName` and `Device` fields and derives the MCU family and preferred programming backend.

### Build

Default Keil build:

```text
UV4.exe -b project.uvproj
```

Rebuild:

```text
UV4.exe -r project.uvproj
```

Example:

```json
{
  "stcToolkit.keil.uv4Path": "C:\\Keil_v5\\UV4\\UV4.exe"
}
```

A custom build command can be used instead.

### Firmware Discovery

After a build, STC Toolkit automatically selects the newest `.hex`, `.ihx` or `.ihex` file in the workspace. A file can also be selected manually with `STC: Select Firmware File`.

### Flash Backends

#### Auto

```json
{
  "stcToolkit.flash.backend": "auto"
}
```

The extension chooses a backend from the detected MCU.

#### stcgal

Recommended for established UART ISP families:

```json
{
  "stcToolkit.flash.backend": "stcgal",
  "stcToolkit.flash.port": "COM3",
  "stcToolkit.flash.baud": 115200
}
```

#### Native USB HID (Experimental)

Enable explicitly:

```json
{
  "stcToolkit.flash.backend": "native-hid",
  "stcToolkit.flash.nativeHidExperimental": true
}
```

Install the Python HID dependency:

```bash
pip install hidapi
```

Optional reset-to-ISP command support:

```json
{
  "stcToolkit.flash.nativeHidAutoReset": true,
  "stcToolkit.flash.nativeHidResetCommand": "@STCISP#"
}
```

The helper currently blocks firmware using addresses above `0xFFFF`.

#### Official STC-ISP / AiCube

Recommended for the newest and large-flash parts:

```json
{
  "stcToolkit.flash.backend": "official",
  "stcToolkit.officialIspPath": "E:\\Chrome\\stc-isp6.96s\\STC-ISP-v6.96S.exe"
}
```

In Auto mode, STC32G144K246 selects this backend automatically.

#### Custom

```json
{
  "stcToolkit.flash.backend": "custom",
  "stcToolkit.flash.customCommand": "python tools\\flash.py --chip ${device} --file ${firmware}"
}
```

Available variables:

```text
${firmware}
${port}
${protocol}
${workspaceFolder}
${projectFile}
${device}
```

### Commands

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

The **STC** status-bar button runs `Build & Flash`.

### Roadmap

The next major milestone is a verified extended-address native USB-HID programmer for STC32G144K246 and later devices, allowing a fully integrated flow:

```text
VS Code -> Build -> Detect USB Writer -> Erase -> Program -> Verify -> Reset
```

without opening the official GUI.

---

## License

MIT for the extension code. External programmers such as `stcgal`, Keil and STC-ISP/AiCube retain their own licenses and are not bundled unless explicitly stated.
