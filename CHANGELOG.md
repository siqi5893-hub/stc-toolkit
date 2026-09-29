# Changelog

## 0.3.2

- Added native VS Code package localization.
- Added Simplified Chinese settings descriptions and command titles.
- Added Traditional Chinese localization.
- Kept English as the default UI language.
- Added localized descriptions for flash backends and all major configuration options.

## 0.3.1

- Added automatic Keil HEX/IHX detection.
- Reads Keil OutputDirectory and OutputName.
- Prefers firmware updated by the current build.
- Added status-bar firmware display.
- Added `STC: Detect Firmware Automatically`.

## 0.3.0

- Added K5-style one-click editor toolbar.
- Added Build, Flash and Build & Flash editor buttons.
- Added quieter success-notification option.

## 0.2.0

- Added automatic flash-backend selection.
- Kept `stcgal` as the backward-compatible backend for legacy/common STC families.
- Added experimental native USB-HID backend scaffold and helper.
- Added explicit safety block for firmware addresses above `0xFFFF` in the experimental HID backend.
- Added new-generation detection for STC32G144K246, STC33 and AI8051U with official-tool fallback.
- Added `STC: Select Flash Backend`.
- Added `${device}` variable for custom flash commands.
- Rewrote README as a full Chinese/English bilingual guide.

## 0.1.0

- Initial prototype with Keil build, stcgal flashing, custom command and official STC-ISP launcher.
