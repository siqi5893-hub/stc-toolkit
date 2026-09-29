#!/usr/bin/env python3
"""Experimental STC USB-HID ISP helper.

Clean-room implementation based on publicly observable packet framing for the
STC USB writer bootloader. It intentionally refuses firmware above 64 KiB;
newer large-flash parts (for example STC32G144K246) use an extended address
scheme that is not implemented here. Use the official STC-ISP/AiCube backend
for those parts until the extended protocol is verified.
"""
import argparse, sys, time

BOOT_VID = 0x34BF
BOOT_PID = 0x1001
APP_VID = 0x34BF
APP_PID = 0xFF01


def parse_hex(path):
    mem = {}
    upper = 0
    with open(path, 'r', encoding='ascii', errors='strict') as f:
        for ln, raw in enumerate(f, 1):
            line = raw.strip()
            if not line:
                continue
            if not line.startswith(':'):
                raise ValueError(f'line {ln}: not Intel HEX')
            b = bytes.fromhex(line[1:])
            if len(b) < 5 or (sum(b) & 0xFF) != 0:
                raise ValueError(f'line {ln}: checksum error')
            count, a_hi, a_lo, rectype = b[0], b[1], b[2], b[3]
            data = b[4:4+count]
            addr = (a_hi << 8) | a_lo
            if rectype == 0x00:
                base = upper + addr
                for i, v in enumerate(data): mem[base+i] = v
            elif rectype == 0x01:
                break
            elif rectype == 0x04:
                if len(data) != 2: raise ValueError(f'line {ln}: bad ELA record')
                upper = ((data[0] << 8) | data[1]) << 16
            elif rectype == 0x02:
                if len(data) != 2: raise ValueError(f'line {ln}: bad ESA record')
                upper = ((data[0] << 8) | data[1]) << 4
    if not mem:
        raise ValueError('firmware contains no data records')
    lo, hi = min(mem), max(mem)
    return mem, lo, hi


def import_hid():
    try:
        import hid
        return hid
    except Exception:
        print('ERROR: Python package "hid" is missing. Install it with: pip install hidapi', file=sys.stderr)
        sys.exit(12)


def packet(payload):
    body = bytearray([0x46, 0xB9, 0x6A])
    total_len = len(payload) + 6
    body += bytes([(total_len >> 8) & 0xFF, total_len & 0xFF])
    body += payload
    csum = sum(body[2:]) & 0xFFFF
    body += bytes([(csum >> 8) & 0xFF, csum & 0xFF, 0x16])
    return bytes(body)


def write_cmd(dev, payload, expect_reply=True):
    p = packet(payload)
    if len(p) < 64:
        p += bytes(64-len(p))
    dev.write(p)
    if expect_reply:
        r = dev.read(64, timeout_ms=2000)
        if not r:
            raise RuntimeError(f'no reply for command 0x{payload[0]:02X}')
        return bytes(r)
    return b''


def try_reset_to_isp(hid, command):
    try:
        d = hid.device()
        d.open(APP_VID, APP_PID)
        data = command.encode('ascii')
        report = data[:64] + bytes(max(0, 64-len(data)))
        d.write(report)
        d.close()
        time.sleep(1.0)
        return True
    except Exception:
        return False


def flash(path, auto_reset=False, reset_command='@STCISP#'):
    mem, lo, hi = parse_hex(path)
    if hi > 0xFFFF:
        raise RuntimeError(
            f'firmware reaches 0x{hi:X}; experimental native HID backend currently supports only <= 0xFFFF. '
            'Select the official STC-ISP/AiCube backend for large-flash parts such as STC32G144K246.'
        )
    hid = import_hid()
    if auto_reset:
        try_reset_to_isp(hid, reset_command)
    d = hid.device()
    try:
        d.open(BOOT_VID, BOOT_PID)
    except Exception as e:
        raise RuntimeError('STC USB Writer was not found. Put the MCU into USB ISP mode (for many boards: hold P3.2 while power-cycling).') from e
    try:
        print('Connected to STC USB Writer')
        write_cmd(d, bytes([0x00, 0x00]))
        write_cmd(d, bytes([0x01, 0, 0, 0, 0, 0, 0, 0x80, 0]))
        write_cmd(d, bytes([0x05, 0, 0, 0x5A, 0xA5]))
        write_cmd(d, bytes([0x03, 0, 0, 0x5A, 0xA5]))
        start = lo & ~0x7F
        end = (hi + 0x80) & ~0x7F
        blocks = max(1, (end-start)//0x80)
        for idx, addr in enumerate(range(start, end, 0x80)):
            chunk = bytes(mem.get(addr+i, 0xFF) for i in range(0x80))
            cmd = 0x32 if idx == 0 else 0x12
            payload = bytes([cmd, (addr >> 8) & 0xFF, addr & 0xFF, 0x5A, 0xA5]) + chunk
            write_cmd(d, payload)
            pct = int((idx+1)*100/blocks)
            print(f'PROGRESS {pct} {addr:04X}')
        write_cmd(d, bytes([0xFF]), expect_reply=False)
        print('Flash completed')
    finally:
        try: d.close()
        except Exception: pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('firmware')
    ap.add_argument('--auto-reset', action='store_true')
    ap.add_argument('--reset-command', default='@STCISP#')
    ns = ap.parse_args()
    try:
        flash(ns.firmware, ns.auto_reset, ns.reset_command)
        return 0
    except Exception as e:
        print('ERROR:', e, file=sys.stderr)
        return 2

if __name__ == '__main__':
    raise SystemExit(main())
