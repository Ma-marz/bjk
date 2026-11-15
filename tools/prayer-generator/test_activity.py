import json
import random
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from io import BytesIO
from generate import plan_week, sync_activity_config


class ActivityTests(unittest.TestCase):
    def test_only_volunteers_get_extras_and_everyone_receives_prayer(self):
        for size in range(3, 13):
            names = [str(i) for i in range(size)]
            for paused_count in range(1, size - 1):
                for seed in range(20):
                    paused = names[:paused_count]
                    volunteers = names[paused_count:paused_count + 1 + seed % (size - paused_count)]
                    history = {'version': 1, 'weeks': {}, 'cycles': []}
                    record = plan_week(history, 1, names, paused=paused, volunteers=volunteers, rng=random.Random(seed))
                    targets = []
                    for owner, main in record['assignments'].items():
                        extra = record.get('extra_assignments', {}).get(owner, [])
                        if owner in paused:
                            self.assertEqual(main, '')
                            self.assertEqual(extra, [])
                        else:
                            self.assertTrue(main)
                            targets.append(main)
                        if extra:
                            self.assertIn(owner, volunteers)
                        self.assertNotIn(owner, [main] + extra)
                        targets.extend(extra)
                    self.assertEqual(sorted(targets), sorted(names))
                    loads = [len(record['extra_assignments'].get(owner, [])) for owner in volunteers]
                    self.assertLessEqual(max(loads) - min(loads), 1)

    def test_regeneration_updates_volunteers_with_same_pauses(self):
        history = {'version': 1, 'weeks': {}, 'cycles': []}
        names = list('ABCDE')
        plan_week(history, 1, names, paused=['A'], volunteers=['B'], rng=random.Random(3))
        record = plan_week(history, 1, names, paused=['A'], volunteers=['C'], rng=random.Random(3))
        self.assertEqual(list(record['extra_assignments']), ['C'])

    def test_db_sync_updates_config_without_saving_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.json'
            config = {'week': 1, 'names': ['A One', 'B Two', 'C Three'], 'google_sheet_endpoint': 'https://example.test'}
            response = BytesIO(json.dumps({'success': True, 'data': {'users': [
                {'name': 'A', 'prayerActivity': 'paused'}, {'name': 'B Two', 'prayerActivity': 'fuego'}, {'name': 'C', 'prayerActivity': 'steady'}]}}).encode())
            with patch.dict('os.environ', {'BJK_GENERATOR_KEY': 'secret'}), patch('generate.urlopen', return_value=response):
                updated = sync_activity_config(path, config)
            self.assertEqual(updated['paused'], ['A One'])
            self.assertEqual(updated['extra_volunteers'], ['B Two'])
            self.assertNotIn('secret', path.read_text())
