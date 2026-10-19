"""Sync the endpoint from config.json into index.html for direct-file access."""
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
DEFAULT_PAGE = HERE.parents[1] / 'index.html'


def sync_config(config_path=HERE / 'config.json', page_path=DEFAULT_PAGE):
    from generate import atomic_write
    endpoint = json.loads(Path(config_path).read_text(encoding='utf-8')).get('google_sheet_endpoint')
    if not isinstance(endpoint, str) or not endpoint.strip():
        raise ValueError('google_sheet_endpoint is missing from config.json')
    # Escape '<' so a configuration value cannot close the script element.
    value = json.dumps(endpoint.strip()).replace('<', '\\u003c')
    block = '<script id="fileEndpointConfig">\n        // Generated from tools/prayer-generator/config.json by sync_config.py.\n        window.BJK_FILE_ENDPOINT = ' + value + ';\n    </script>'
    page_path = Path(page_path)
    page = page_path.read_text(encoding='utf-8')
    pattern = r'<script id="fileEndpointConfig">.*?</script>'
    if re.search(pattern, page, flags=re.S):
        page = re.sub(pattern, lambda _: block, page, count=1, flags=re.S)
    else:
        marker = '    <script src="prayer/available-weeks.js"></script>'
        if marker not in page:
            raise ValueError('Could not locate site configuration insertion point')
        page = page.replace(marker, '    ' + block + '\n' + marker, 1)
    atomic_write(page_path, page.encode('utf-8'))


if __name__ == '__main__':
    sync_config()
    print('Updated direct-file endpoint in index.html from config.json')
