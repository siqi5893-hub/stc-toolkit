# Changelog

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
