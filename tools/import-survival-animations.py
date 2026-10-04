"""Import the user's Godot frames without changing their pixels or source files."""
import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ACTIONS = ('idle', 'move', 'attack', 'cast', 'hit', 'death')


def import_assets(source):
    registry = json.loads((source / 'data/animation-manifest.json').read_text(encoding='utf-8'))
    roster = json.loads((ROOT / 'survival/roster.json').read_text(encoding='utf-8'))
    size = registry['frame_size']
    assert size == [256, 256], size
    output = ROOT / 'survival/assets/animations'
    manifest = {'version': 1, 'frameSize': size, 'footAnchor': [128, 235], 'characters': {}}
    source_bytes = output_bytes = total = 0
    for hero in roster:
        character = hero['id']
        assert character in registry['characters'], f'Missing character: {character}'
        folder = source / 'assets/animations' / character
        info = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
        assert set(info['actions']) == set(ACTIONS), character
        target = output / character
        target.mkdir(parents=True, exist_ok=True)
        actions = {}
        for action in ACTIONS:
            settings = info['actions'][action]
            file = folder / f'{action}.png'
            with Image.open(file) as image:
                rgba = image.convert('RGBA')
                assert rgba.size == (settings['columns'] * size[0], math.ceil(settings['count'] / settings['columns']) * size[1]), file
                unique = set()
                for index in range(settings['count']):
                    x, y = index % settings['columns'] * size[0], index // settings['columns'] * size[1]
                    frame = rgba.crop((x, y, x + size[0], y + size[1]))
                    assert frame.getchannel('A').getbbox(), f'Empty frame: {file}:{index}'
                    unique.add(hashlib.sha256(frame.tobytes()).hexdigest())
                assert len(unique) == settings['count'], f'Duplicate frames: {file}'
                destination = target / f'{action}.webp'
                rgba.save(destination, 'WEBP', lossless=True, exact=True, method=4)
                with Image.open(destination) as check:
                    assert check.convert('RGBA').tobytes() == rgba.tobytes(), f'Pixel mismatch: {destination}'
            actions[action] = {**settings, 'path': f'survival/assets/animations/{character}/{action}.webp',
                               'sourceSha256': hashlib.sha256(file.read_bytes()).hexdigest()}
            total += settings['count']
            source_bytes += file.stat().st_size
            output_bytes += destination.stat().st_size
        assert sum(a['count'] for a in actions.values()) == info['total'] == 44, character
        manifest['characters'][character] = {'actions': actions}
        print(f'{character}: 44 verified frames', flush=True)
    assert len(manifest['characters']) == 50 and total == 2200
    (ROOT / 'survival/animations.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'characters': 50, 'frames': total, 'sourceBytes': source_bytes, 'webBytes': output_bytes, 'lossless': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path, help='Existing Godot project; read only')
    import_assets(parser.parse_args().source.resolve())
