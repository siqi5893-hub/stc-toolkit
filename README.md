# STC Toolkit

[English](./README.md) | [简体中文](./README_CN.md)

STC Toolkit is a VS Code extension for **STC MCU development**. It aims to bring **Keil project detection, build, firmware discovery, UART ISP, USB ISP, and flashing workflows** into one place.

The project follows one rule:

> **Keep backward compatibility for older STC devices, but do not force newer devices to use legacy protocols.**

## Features

- Auto-detect Keil `.uvproj` / `.uvprojx` projects
- Build and rebuild with Keil `UV4.exe`
- Auto-discover the newest `.hex`, `.ihx`, or `.ihex` firmware
- One-click **Build**, **Flash**, and **Build & Flash**
- Multiple flashing backends
- Automatic MCU-family detection
- Serial port selection for UART ISP
- Experimental native USB-HID backend
- Official STC-ISP / AiCube fallback for newer and large-flash devices
- Custom backend support for your own CLI / Python / Rust / C/C++ flasher

## One-click Workflow

After the initial configuration, normal development does not require opening the command palette.

When a C/C++ source file is open, STC Toolkit shows three buttons in the editor title bar:

- **Build**
- **Flash**
- **Build & Flash**

The **Build & Flash** button performs the complete configured workflow with one click:

```text
Edit source
  -> Build Keil project
  -> Locate latest firmware
  -> Detect target MCU
  -> Select flash backend
  -> Flash / launch configured programmer
```

You can also click the **STC** button in the VS Code status bar; it runs the same **Build & Flash** command.

The toolbar can be disabled with:

```json
{
  "stcToolkit.ui.showEditorButtons": false
}
```

For a quieter workflow, success notifications can also be disabled:

```json
{
  "stcToolkit.ui.showSuccessNotifications": false
}
```

> For legacy STC devices using `stcgal`, Build & Flash can be fully automatic. For **STC32G144K246**, the current official backend still launches STC-ISP/AiCube for the final programming step until the extended native USB-HID protocol is fully implemented.

## Supported Families

| Family | Default backend | Status |
|---|---|---|
| STC89 / STC90 | stcgal | Supported |
| STC10 / STC11 / STC12 | stcgal | Supported |
| STC15 | stcgal | Supported |
| STC8 | stcgal | Supported |
| STC8G / STC8H | stcgal | Supported |
| STC8H8K64U | Native HID / Official | Experimental |
| STC32G12K128 / STC32F12K54 | Native HID / Official | Experimental |
| **STC32G144K246** | **Official** | Recommended until extended HID addressing is verified |
| STC33 / AI8051U | Official | Recommended |

The current experimental native HID backend intentionally refuses firmware addresses above `0xFFFF`. This prevents unsafe flashing on large-memory parts until their extended addressing protocol is fully verified.

## Project Detection

STC Toolkit automatically searches for:

```text
*.uvproj
*.uvprojx
```

It reads fields such as:

```text
TargetName
Device
```

and then selects the MCU family and preferred flashing backend.

## Build

> **Note:** Paths shown in this README are examples only. Replace them with the actual installation paths on your system.

Default Keil build:

```text
UV4.exe -b project.uvproj
```

Rebuild:

```text
UV4.exe -r project.uvproj
```

Example configuration:

```json
{
  "stcToolkit.keil.uv4Path": "C:\\Path\\To\\Keil_v5\\UV4\\UV4.exe"
}
```

You can also use your own build command:

```json
{
  "stcToolkit.build.customCommand": "your build command"
}
```

## Firmware Discovery

After a successful build, STC Toolkit automatically selects the newest firmware file in the workspace:

```text
.hex
.ihx
.ihex
```

You can also select one manually with:

```text
STC: Select Firmware File
```

## Flash Backends

### Auto

Recommended default:

```json
{
  "stcToolkit.flash.backend": "auto"
}
```

The extension chooses a backend from the detected MCU.

### stcgal

Recommended for established UART ISP families:

```json
{
  "stcToolkit.flash.backend": "stcgal",
  "stcToolkit.flash.port": "COM3",
  "stcToolkit.flash.baud": 115200
}
```

Suggested protocol mapping:

```text
STC89/90      -> stc89
STC10/11/12   -> stc12
STC15         -> stc15
STC8          -> stc8d
STC8G/H       -> stc8g
```

### Native USB HID (Experimental)

Enable explicitly:

```json
{
  "stcToolkit.flash.backend": "native-hid",
  "stcToolkit.flash.nativeHidExperimental": true
}
```

Python dependency:

```bash
pip install hidapi
```

Optional reset-to-ISP support:

```json
{
  "stcToolkit.flash.nativeHidAutoReset": true,
  "stcToolkit.flash.nativeHidResetCommand": "@STCISP#"
}
```

The helper currently blocks firmware using addresses above `0xFFFF`.

### Official STC-ISP / AiCube

Recommended for newer or large-flash devices such as **STC32G144K246**:

```json
{
  "stcToolkit.flash.backend": "official",
  "stcToolkit.officialIspPath": "C:\\Path\\To\\STC-ISP\\STC-ISP-v6.96S.exe"
}
```

In `auto` mode, STC32G144K246 currently selects this backend automatically.

### Custom Backend

You can connect any external flasher:

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

## Commands

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

The **STC** status-bar button runs **Build & Flash**.

## Recommended Configuration for STC32G144K246

```json
{
  "stcToolkit.flash.backend": "auto",
  "stcToolkit.officialIspPath": "C:\\Path\\To\\STC-ISP\\STC-ISP-v6.96S.exe"
}
```

The current roadmap is to fully support the large-memory USB-HID ISP protocol so the complete workflow can become:

```text
VS Code
  -> Build
  -> Detect STC USB Writer
  -> Erase
  -> Program
  -> Verify
  -> Reset
```

without opening the official GUI.

## Roadmap

- Verify STC32G144K246 extended USB-HID addressing
- Native erase / program / verify / reset
- Automatic runtime-to-ISP switching
- Wider STC32 / STC33 / AI8051U coverage
- Better device database and protocol capability detection
- VS Code side-panel UI for device, firmware, backend, and flash status

## License

STC Toolkit is released under the [MIT License](./LICENSE).

See [NOTICE.md](./NOTICE.md) for third-party software, trademark, affiliation, and hardware-programming notices.

External tools and proprietary binaries are not relicensed by STC Toolkit and remain subject to their own terms.
