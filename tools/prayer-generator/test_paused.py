import copy
from datetime import date
import random
import unittest
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
from generate import plan_week, prayer_recipient_text, validate_config, make_pdf, generate


class PausedTests(unittest.TestCase):
    def test_distribution_is_complete_balanced_and_never_self_assigned(self):
        for count in range(3, 18):
            names = [f'Person{i}' for i in range(count)]
            for paused_count in range(1, count - 1):
                for seed in range(12):
                    paused = random.Random(seed).sample(names, paused_count)
                    h = {'version': 1, 'cycles': [], 'weeks': {}}
                    record = plan_week(h, 1, names, rng=random.Random(seed), paused=paused)
                    recipients, loads = [], []
                    for owner in names:
                        targets = ([record['assignments'][owner]] if record['assignments'][owner] else []) + record['extra_assignments'].get(owner, [])
                        self.assertNotIn(owner, targets)
                        if owner in paused:
                            self.assertEqual(targets, [])
                        else:
                            loads.append(len(targets))
                        recipients.extend(targets)
                    self.assertCountEqual(recipients, names)
                    self.assertLessEqual(max(loads) - min(loads), 1)
                    base = plan_week({'version': 1, 'cycles': [], 'weeks': {}}, 1, names, rng=random.Random(seed))
                    for owner in names:
                        if owner not in paused:
                            self.assertEqual(record['assignments'][owner], base['assignments'][owner])

    def test_regeneration_updates_pauses_but_keeps_date_and_rotation(self):
        h = {'version': 1, 'cycles': [], 'weeks': {}}
        names = list('ABCDE')
        original = copy.deepcopy(plan_week(h, 1, names, today=date(2026, 1, 5), rng=random.Random(2)))
        paused = plan_week(h, 1, names, today=date(2027, 1, 5), paused=['A'], rng=random.Random(3))
        self.assertEqual(paused['date'], original['date'])
        self.assertEqual(paused['base_assignments'], original['assignments'])
        self.assertEqual(paused['assignments']['A'], '')
        for owner in names[1:]:
            self.assertEqual(paused['assignments'][owner], original['assignments'][owner])
        snapshot = copy.deepcopy(paused)
        self.assertEqual(plan_week(h, 1, names, paused=['A'], rng=random.Random(999)), snapshot)
        self.assertEqual(plan_week(h, 1, names), snapshot)
        changed = plan_week(h, 1, names, paused=['B'])
        self.assertEqual(changed['assignments']['A'], original['assignments']['A'])
        self.assertEqual(changed['assignments']['B'], '')
        resumed = plan_week(h, 1, names, paused=[])
        self.assertEqual(resumed['assignments'], original['assignments'])
        self.assertNotIn('extra_assignments', resumed)
        self.assertEqual(resumed['date'], original['date'])

    def test_legacy_paused_record_is_restored_from_its_cycle(self):
        h = {'version': 1, 'cycles': [], 'weeks': {}}
        names = list('ABCD')
        paused = plan_week(h, 1, names, paused=['A'])
        base = paused.pop('base_assignments')
        self.assertEqual(plan_week(h, 1, names, paused=[])['assignments'], base)

    def test_extra_assignments_prioritize_people_who_have_helped_less(self):
        h = {'version': 1, 'cycles': [], 'weeks': {}}
        names = list('ABCDE')
        loads = {name: 0 for name in names[1:]}
        for week in range(1, 25):
            record = plan_week(h, week, names, paused=['A'], rng=random.Random(week))
            recipient = record['base_assignments']['A']
            helper = next(iter(record['extra_assignments']))
            eligible = [owner for owner in loads if owner != recipient]
            self.assertEqual(loads[helper], min(loads[owner] for owner in eligible))
            loads[helper] += 1
        self.assertLessEqual(max(loads.values()) - min(loads.values()), 1)

    def test_regeneration_excludes_current_and_future_weeks_from_helper_counts(self):
        h = {'version': 1, 'cycles': [], 'weeks': {}}
        names = list('ABCDE')
        plan_week(h, 1, names, rng=random.Random(1))
        baseline = copy.deepcopy(h)
        h['weeks']['99'] = {'week': 99, 'extra_assignments': {'B': ['C'] * 50}, 'assignments': {}, 'names': names}
        future = copy.deepcopy(h['weeks']['99'])
        result = plan_week(h, 1, names, paused=['A'], rng=random.Random(4))
        expected = plan_week(baseline, 1, names, paused=['A'], rng=random.Random(4))
        self.assertEqual(result, expected)
        self.assertEqual(h['weeks']['99'], future)
        self.assertEqual(plan_week(h, 1, names, paused=['A'], rng=random.Random(33)), result)

    def test_pause_change_requires_confirmation_before_replacing_saved_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config, template, history = [root / name for name in ['config.json', 'sample.txt', 'history.json']]
            settings = {'week': 1, 'names': list('ABCD'), 'paused': ['A']}
            config.write_text(json.dumps(settings))
            template.write_text('[name]\n[name_to_pray]')
            output = root / 'pdfs'
            generate(config, template, history, output)
            before_history = history.read_bytes()
            before_files = {path: path.read_bytes() for path in output.rglob('*') if path.is_file()}
            settings['paused'] = ['B']
            config.write_text(json.dumps(settings))
            with patch('builtins.input', return_value='no'):
                self.assertFalse(generate(config, template, history, output))
            self.assertEqual(history.read_bytes(), before_history)
            self.assertEqual({path: path.read_bytes() for path in output.rglob('*') if path.is_file()}, before_files)
            with patch('builtins.input', return_value='yes'):
                self.assertTrue(generate(config, template, history, output))
            old = json.loads(before_history)['weeks']['1']
            new = json.loads(history.read_text())['weeks']['1']
            self.assertEqual(new['paused'], ['B'])
            self.assertEqual(new['date'], old['date'])
            self.assertEqual(new['base_assignments'], old['base_assignments'])
            self.assertEqual(new['assignments']['A'], old['base_assignments']['A'])
            self.assertEqual(new['assignments']['B'], '')

    def test_invalid_paused_settings(self):
        for paused in ['A', ['Unknown'], ['A', 'A'], ['A', 'B'], ['A', 'B', 'C']]:
            with self.subTest(paused=paused), self.assertRaises(ValueError):
                validate_config({'week': 1, 'names': ['A', 'B', 'C'], 'paused': paused})

    def test_pdf_recipient_text(self):
        record = {'assignments': {'A': 'B', 'B': 'C', 'C': ''}, 'extra_assignments': {'A': ['C', 'D']}, 'paused': ['C']}
        self.assertEqual(prayer_recipient_text(record, 'A'), 'B\n(C)\n(D)')
        self.assertEqual(prayer_recipient_text(record, 'B'), 'C')
        self.assertEqual(prayer_recipient_text(record, 'C'), '# oled praegu puhkusel #')

    def test_multiline_recipients_are_drawn_on_separate_lines(self):
        import base64
        import re
        import zlib
        pdf = make_pdf('    [name_to_pray]', '(Alice)\n(Bob)')
        streams = re.findall(rb'stream\r?\n(.*?)endstream', pdf, re.S)
        commands = b'\n'.join(zlib.decompress(base64.a85decode(stream.strip(), adobe=True)) for stream in streams)
        self.assertIn(b'\\(Alice\\)', commands)
        self.assertIn(b'\\(Bob\\)', commands)
        alice = commands.index(b'Alice')
        bob = commands.index(b'Bob')
        self.assertIn(b'T*', commands[alice:bob], 'PDF advances to a new line between names')

if __name__ == '__main__':
    unittest.main()
