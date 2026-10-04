"""Read the owned game's unencrypted PCK directory; never extract or modify it."""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path


def inspect(path):
    before = path.stat()
    entries = []
    with path.open('rb') as file:
        header = file.read(88)
        magic, version, major, minor, patch = struct.unpack_from('<4s4I', header)
        if magic != b'GDPC' or version != 1:
            raise ValueError('Only the unencrypted Godot PCK v1 directory is supported')
        count = struct.unpack_from('<I', header, 84)[0]
        if count > 100000:
            raise ValueError('Invalid entry count')
        for _ in range(count):
            length = struct.unpack('<I', file.read(4))[0]
            if length > 16384:
                raise ValueError('Invalid path size')
            name = file.read(length).rstrip(b'\0').decode('utf-8')
            offset, size = struct.unpack('<QQ', file.read(16))
            digest = file.read(16)
            if offset + size > before.st_size:
                raise ValueError('Entry outside pack')
            entries.append((name, offset, size, digest))
        references = []
        for name, offset, size, digest in entries:
            if not name.endswith('.gd') or not any(k in name for k in ('class_bonus_effect', 'weapon_type_bonus_effect', 'convert_stat_effect', 'stat_cap_effect')):
                continue
            if size > 65536:
                continue
            file.seek(offset)
            data = file.read(size)
            if hashlib.md5(data).digest() != digest:
                raise ValueError('Reference checksum mismatch')
            text = data.decode('utf-8')
            fields = sorted(set(re.findall(r'\b(?:var|func)\s+([a-zA-Z0-9_]+)', text)))
            references.append({'path': name, 'fields': fields, 'sha256': hashlib.sha256(data).hexdigest()})
    after = path.stat()
    assert before.st_size == after.st_size and before.st_mtime_ns == after.st_mtime_ns
    return {'pack': str(path), 'engine': f'{major}.{minor}.{patch}', 'entries': count,
            'characterResources': sum('/characters/' in e[0] for e in entries),
            'weaponResources': sum('/weapons/' in e[0] for e in entries),
            'referenceMetadata': references, 'readOnlyVerified': True,
            'observations': ['Weapon class/type bonuses are represented independently of base weapons',
                             'Stat conversion and stat caps use separate effect records',
                             'Use these concepts only; no game code or art is copied into the web runtime']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('pack', type=Path)
    result = inspect(parser.parse_args().pack.resolve())
    output = Path(__file__).resolve().parents[1] / 'out/survival/content'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'brotato-reference.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
