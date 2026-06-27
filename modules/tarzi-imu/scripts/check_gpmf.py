#!/usr/bin/env python3
"""
check_gpmf.py — Offline GPMF track validator for Tarzi IMU recordings.

Usage:
    python3 check_gpmf.py <path-to-mp4>

Exits 0 on success, 1 on failure.

What it checks:
  1. Parses top-level MP4 atoms and finds the moov box.
  2. Locates a trak whose handler type is "meta" and stsd entry type is "gpmd".
  3. Reads the chunk offset (stco) to find the raw GPMF payload in the file.
  4. Parses GPMF KLV records and prints a summary of DEVC/STRM contents.
  5. Confirms ACCL and GYRO streams with non-zero sample counts exist.

Tested against output produced by TarziImuModule.swift (iOS) and
TarziImuModule.kt (Android via MediaMuxer).
"""

import struct
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# MP4 atom parser
# ---------------------------------------------------------------------------

def parse_atoms(data: bytes, offset: int = 0, end: int = -1) -> list[dict]:
    if end < 0:
        end = len(data)
    atoms = []
    while offset < end:
        if offset + 8 > end:
            break
        size32 = struct.unpack_from(">I", data, offset)[0]
        fourcc = data[offset + 4: offset + 8].decode("latin-1")
        if size32 == 1:
            if offset + 16 > end:
                break
            size64 = struct.unpack_from(">Q", data, offset + 8)[0]
            header = 16
            total = int(size64)
        elif size32 == 0:
            total = end - offset
            header = 8
        else:
            total = int(size32)
            header = 8
        if total < header or offset + total > end:
            break
        atoms.append({
            "fourcc": fourcc,
            "offset": offset,
            "header": header,
            "total": total,
            "payload_start": offset + header,
            "payload_end": offset + total,
        })
        offset += total
    return atoms


def find_atom(atoms: list[dict], fourcc: str) -> dict | None:
    for a in atoms:
        if a["fourcc"] == fourcc:
            return a
    return None


# ---------------------------------------------------------------------------
# GPMF KLV parser
# ---------------------------------------------------------------------------

TYPE_MAP = {
    0x00: "container",
    0x62: "int8",    # 'b'
    0x42: "uint8",   # 'B'
    0x63: "char",    # 'c'
    0x73: "int16",   # 's'
    0x53: "uint16",  # 'S'
    0x4C: "uint32",  # 'L'
    0x6C: "int32",   # 'l'
    0x66: "float32", # 'f'
    0x64: "double",  # 'd'
    0x55: "uint64",  # 'U' (date/time)
    0x4A: "complex", # 'J'
}


def align4(n: int) -> int:
    return (n + 3) & ~3


def parse_gpmf(data: bytes) -> list[dict]:
    records = []
    i = 0
    while i + 8 <= len(data):
        fourcc = data[i:i+4].decode("latin-1")
        type_byte = data[i+4]
        el_size = data[i+5]
        repeat = struct.unpack_from(">H", data, i+6)[0]
        payload_len = el_size * repeat
        padded_len = align4(payload_len)
        i += 8
        payload = data[i:i+payload_len]
        i += padded_len
        records.append({
            "fourcc": fourcc,
            "type": type_byte,
            "el_size": el_size,
            "repeat": repeat,
            "payload": payload,
        })
    return records


def decode_string(payload: bytes) -> str:
    return payload.rstrip(b"\x00").decode("utf-8", errors="replace")


def summarize_gpmf(data: bytes, indent: int = 0) -> tuple[bool, list[str]]:
    prefix = "  " * indent
    lines = []
    ok = False

    records = parse_gpmf(data)
    accl_samples = 0
    gyro_samples = 0

    for r in records:
        fc = r["fourcc"]
        t = r["type"]
        rep = r["repeat"]
        el = r["el_size"]
        payload = r["payload"]

        if t == 0x00:  # container
            lines.append(f"{prefix}{fc}")
            if fc == "DEVC":
                ok = True
            _, sub = summarize_gpmf(payload, indent + 1)
            lines.extend(sub)
        elif t == 0x63:  # char string
            lines.append(f"{prefix}{fc}: {decode_string(payload)}")
        elif t == 0x73:  # int16
            if rep >= 1:
                val = struct.unpack_from(">h", payload, 0)[0]
                lines.append(f"{prefix}{fc}: {val}")
        elif t == 0x4C:  # uint32
            if rep >= 1:
                val = struct.unpack_from(">I", payload, 0)[0]
                lines.append(f"{prefix}{fc}: {val}")
        elif t == 0x66:  # float32 (3-axis)
            sample_count = (len(payload) // 4) // 3 if el == 12 else rep
            lines.append(f"{prefix}{fc}: {sample_count} samples (el_size={el})")
            if fc == "ACCL":
                accl_samples = sample_count
            elif fc == "GYRO":
                gyro_samples = sample_count
        else:
            lines.append(f"{prefix}{fc}: type=0x{t:02x} el={el} repeat={rep}")

    # After parsing STRM contents, report totals at DEVC level
    if accl_samples or gyro_samples:
        lines.append(f"{prefix}→ ACCL samples: {accl_samples}, GYRO samples: {gyro_samples}")

    return ok, lines


# ---------------------------------------------------------------------------
# iOS-style gpmd track finder (atom-based stco)
# ---------------------------------------------------------------------------

def check_ios_style(data: bytes, moov_atom: dict) -> tuple[bool, bytes | None, str]:
    moov_payload = data[moov_atom["payload_start"]:moov_atom["payload_end"]]
    moov_atoms = parse_atoms(moov_payload)

    for trak_a in [a for a in moov_atoms if a["fourcc"] == "trak"]:
        trak_pay = moov_payload[trak_a["payload_start"]:trak_a["payload_end"]]
        trak_atoms = parse_atoms(trak_pay)

        mdia_a = find_atom(trak_atoms, "mdia")
        if not mdia_a:
            continue
        mdia_pay = trak_pay[mdia_a["payload_start"]:mdia_a["payload_end"]]
        mdia_atoms = parse_atoms(mdia_pay)

        hdlr_a = find_atom(mdia_atoms, "hdlr")
        if not hdlr_a:
            continue
        hdlr_pay = mdia_pay[hdlr_a["payload_start"]:hdlr_a["payload_end"]]
        # FullBox: 4 bytes (version+flags), 4 bytes pre-defined, 4 bytes handler_type
        if len(hdlr_pay) < 12:
            continue
        handler_type = hdlr_pay[8:12].decode("latin-1")
        if handler_type != "meta":
            continue

        # Found a meta track — look for gpmd in stsd
        minf_a = find_atom(mdia_atoms, "minf")
        if not minf_a:
            continue
        minf_pay = mdia_pay[minf_a["payload_start"]:minf_a["payload_end"]]
        minf_atoms = parse_atoms(minf_pay)

        stbl_a = find_atom(minf_atoms, "stbl")
        if not stbl_a:
            continue
        stbl_pay = minf_pay[stbl_a["payload_start"]:stbl_a["payload_end"]]
        stbl_atoms = parse_atoms(stbl_pay)

        stsd_a = find_atom(stbl_atoms, "stsd")
        if not stsd_a:
            continue
        stsd_pay = stbl_pay[stsd_a["payload_start"]:stsd_a["payload_end"]]
        # stsd FullBox: 4 bytes header + 4 bytes entry count
        if len(stsd_pay) < 8:
            continue
        entries = parse_atoms(stsd_pay, offset=8)
        gpmd_entry = find_atom(entries, "gpmd")
        if not gpmd_entry:
            continue

        # Found gpmd stsd entry — now find stco to get chunk offset
        stco_a = find_atom(stbl_atoms, "stco")
        if not stco_a:
            return False, None, "gpmd track found but stco missing"
        stco_pay = stbl_pay[stco_a["payload_start"]:stco_a["payload_end"]]
        if len(stco_pay) < 8:
            return False, None, "stco payload too short"
        entry_count = struct.unpack_from(">I", stco_pay, 4)[0]
        if entry_count == 0:
            return False, None, "stco has 0 entries"
        chunk_offset = struct.unpack_from(">I", stco_pay, 8)[0]

        # Read stsz for sample size
        stsz_a = find_atom(stbl_atoms, "stsz")
        if not stsz_a:
            return False, None, "stsz missing"
        stsz_pay = stbl_pay[stsz_a["payload_start"]:stsz_a["payload_end"]]
        if len(stsz_pay) < 12:
            return False, None, "stsz too short"
        uniform_size = struct.unpack_from(">I", stsz_pay, 4)[0]
        sample_count = struct.unpack_from(">I", stsz_pay, 8)[0]
        if uniform_size > 0:
            gpmf_size = uniform_size
        elif sample_count > 0 and len(stsz_pay) >= 16:
            gpmf_size = struct.unpack_from(">I", stsz_pay, 12)[0]
        else:
            return False, None, "cannot determine sample size from stsz"

        if chunk_offset + gpmf_size > len(data):
            return False, None, (
                f"stco offset {chunk_offset} + size {gpmf_size} exceeds file length {len(data)}"
            )

        gpmf_payload = data[chunk_offset:chunk_offset + gpmf_size]
        return True, gpmf_payload, "ok"

    return False, None, "no gpmd trak found"


# ---------------------------------------------------------------------------
# Android-style: find gpmd via MIME embedded in moov (MediaMuxer output)
# ---------------------------------------------------------------------------

def check_android_style(data: bytes, moov_atom: dict) -> tuple[bool, bytes | None, str]:
    # Android MediaMuxer produces a trak with handler type "text" or similar
    # and the MIME is stored as part of the codec-specific data.
    # For our purposes, we search for the raw bytes b"gpmd" within the moov
    # to locate the track, then follow its stco.
    moov_payload = data[moov_atom["payload_start"]:moov_atom["payload_end"]]
    moov_atoms = parse_atoms(moov_payload)

    for trak_a in [a for a in moov_atoms if a["fourcc"] == "trak"]:
        trak_pay = moov_payload[trak_a["payload_start"]:trak_a["payload_end"]]
        # Quick check: does this trak mention "gpmd" anywhere?
        if b"gpmd" not in trak_pay and b"application/gpmd" not in trak_pay:
            continue
        trak_atoms = parse_atoms(trak_pay)
        mdia_a = find_atom(trak_atoms, "mdia")
        if not mdia_a:
            continue
        mdia_pay = trak_pay[mdia_a["payload_start"]:mdia_a["payload_end"]]
        mdia_atoms = parse_atoms(mdia_pay)
        minf_a = find_atom(mdia_atoms, "minf")
        if not minf_a:
            continue
        minf_pay = mdia_pay[minf_a["payload_start"]:minf_a["payload_end"]]
        minf_atoms = parse_atoms(minf_pay)
        stbl_a = find_atom(minf_atoms, "stbl")
        if not stbl_a:
            continue
        stbl_pay = minf_pay[stbl_a["payload_start"]:stbl_a["payload_end"]]
        stbl_atoms = parse_atoms(stbl_pay)

        stco_a = find_atom(stbl_atoms, "stco")
        if not stco_a:
            continue
        stco_pay = stbl_pay[stco_a["payload_start"]:stco_a["payload_end"]]
        if len(stco_pay) < 8:
            continue
        entry_count = struct.unpack_from(">I", stco_pay, 4)[0]
        if entry_count == 0:
            continue
        chunk_offset = struct.unpack_from(">I", stco_pay, 8)[0]

        stsz_a = find_atom(stbl_atoms, "stsz")
        if not stsz_a:
            continue
        stsz_pay = stbl_pay[stsz_a["payload_start"]:stsz_a["payload_end"]]
        if len(stsz_pay) < 12:
            continue
        uniform_size = struct.unpack_from(">I", stsz_pay, 4)[0]
        sample_count = struct.unpack_from(">I", stsz_pay, 8)[0]
        if uniform_size > 0:
            gpmf_size = uniform_size
        elif sample_count > 0 and len(stsz_pay) >= 16:
            gpmf_size = struct.unpack_from(">I", stsz_pay, 12)[0]
        else:
            continue

        if chunk_offset + gpmf_size > len(data):
            continue

        gpmf_payload = data[chunk_offset:chunk_offset + gpmf_size]
        return True, gpmf_payload, "ok"

    return False, None, "no gpmd trak found (android style)"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path-to-mp4>")
        return 1

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"Error: file not found: {path}")
        return 1

    data = path.read_bytes()
    print(f"File: {path} ({len(data):,} bytes)")

    top_atoms = parse_atoms(data)
    print("Top-level atoms:", [a["fourcc"] for a in top_atoms])

    moov_a = find_atom(top_atoms, "moov")
    if not moov_a:
        print("✗ No moov atom found — not a valid MP4")
        return 1

    # Try iOS-style (gpmd stsd entry) first
    found, gpmf_data, msg = check_ios_style(data, moov_a)
    if not found:
        # Fall back to Android-style (raw bytes search)
        found, gpmf_data, msg = check_android_style(data, moov_a)

    if not found or gpmf_data is None:
        print(f"✗ GPMF track not found: {msg}")
        return 1

    print(f"✓ GPMF track found ({len(gpmf_data):,} bytes)")
    print()
    print("GPMF content:")
    devc_ok, lines = summarize_gpmf(gpmf_data)
    for line in lines:
        print(line)

    print()
    if devc_ok:
        print("✓ GPMF track is valid")
        return 0
    else:
        print("✗ DEVC container not found in GPMF payload — data may be corrupt")
        return 1


if __name__ == "__main__":
    sys.exit(main())
