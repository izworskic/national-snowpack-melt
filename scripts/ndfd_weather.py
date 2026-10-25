"""Decode NOAA NDFD section-2 categorical weather strings without inference.

Section 2 template 2.1 holds NULL-separated ASCII entries packed 7 bits per char.
Indices in NDFD Wx GRIB grid refer to those entries, NOT snowfall amounts.
Reference: https://graphical.weather.gov/docs/grib_design.html
"""
import struct

def sections(message):
    if message[:4] != b"GRIB" or message[7] != 2:
        raise ValueError("Not GRIB2")
    length = int.from_bytes(message[8:16], "big")
    if length != len(message) or message[-4:] != b"7777":
        raise ValueError("Incomplete GRIB2 message")
    offset = 16
    while offset < length - 4:
        n = int.from_bytes(message[offset:offset + 4], "big")
        if n < 5 or offset + n > length - 4:
            raise ValueError("Malformed GRIB2 section")
        yield message[offset + 4], message[offset:offset + n]
        offset += n
    if offset != length - 4:
        raise ValueError("Unaligned GRIB2 section lengths")

def messages(blob):
    pos = 0
    while True:
        p = blob.find(b"GRIB", pos)
        if p < 0:
            return
        if p + 16 > len(blob):
            raise ValueError("Truncated GRIB2 header")
        size = int.from_bytes(blob[p + 8:p + 16], "big")
        if size < 21 or p + size > len(blob):
            raise ValueError("Truncated GRIB2 message")
        yield blob[p:p + size]
        pos = p + size

def weather_keys(message):
    local = next((s for num, s in sections(message) if num == 2), None)
    if local is None or len(local) < 21 or local[5] != 1:
        raise ValueError("NDFD weather local table missing or unrecognized")
    if int.from_bytes(local[6:8], "big") != 1:
        raise ValueError("NDFD weather groups other than 1 are unsupported")
    count = int.from_bytes(local[8:12], "big")
    reference = struct.unpack(">f", local[12:16])[0]
    decimal_scale = int.from_bytes(local[16:18], "big", signed=True)
    bits, kind = local[18], local[19]
    if not 1 <= bits <= 8 or kind != 1 or count < 1 or count > 50000 or reference != 0 or decimal_scale != 0:
        raise ValueError("Unexpected NDFD weather ASCII packing; refuse unsafe decode")
    data = local[20:]
    if count * bits > len(data) * 8:
        raise ValueError("Incomplete weather key table")
    numeric = []
    for idx in range(count):
        offset = idx * bits
        byte = offset // 8
        shift = offset % 8
        # At most two bytes needed for a <=8-bit value starting at any bit.
        group = int.from_bytes(data[byte:byte + 2].ljust(2, b"\x00"), "big")
        value = (group >> (16 - bits - shift)) & ((1 << bits) - 1)
        if value > 127:
            raise ValueError("Invalid NDFD weather ASCII")
        numeric.append(value)
    raw = bytes(numeric)
    if raw[-1] != 0:
        raise ValueError("Unterminated NDFD weather key table")
    entries = [part.decode("ascii") for part in raw[:-1].split(b"\x00")]
    if not entries or not all(":" in x for x in entries):
        raise ValueError("Not an NDFD weather key table")
    return entries

def categories(weather_key):
    """A tuple (new_snow, blowing_snow_only, readable) from *official* Wx category."""
    parts = []
    for sub in weather_key.split("^"):
        pair = sub.split(":")
        if len(pair) < 2:
            continue
        # Some NWS weather keys reverse the coverage/type tokens.
        code = pair[1] if pair[1] in ("S", "SW", "BS") else pair[0]
        parts.append(code)
    snow = "S" in parts or "SW" in parts
    blowing = "BS" in parts and not snow
    return snow, blowing, ("Snow Showers" if "SW" in parts else "Snow" if snow else "Blowing Snow" if blowing else "Other Weather")

def key_at_index(keys, value):
    if not isinstance(value, (int, float)) or not (0 <= value < len(keys)) or int(value) != value:
        return None
    return keys[int(value)]
