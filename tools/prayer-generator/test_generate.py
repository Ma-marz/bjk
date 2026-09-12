import copy
from datetime import date
import json
from pathlib import Path
import random
import tempfile
import unittest

from generate import generate, make_pdf, plan_week, render_text, validate_config


class GeneratorTests(unittest.TestCase):
    def history(self):
        return {"version": 1, "cycles": [], "weeks": {}}

    def test_example(self):
        h = self.history()
        h['cycles'] = [{"start_week": 1, "names": list('ABCD'),
                        "order": list('CBDA'), "offsets": [1, 3, 2]}]
        self.assertEqual(plan_week(h, 1, list('ABCD'))['assignments'],
                         dict(zip('CBDA', 'BDAC')))
        self.assertEqual(plan_week(h, 2, list('ABCD'))['assignments'],
                         dict(zip('CBDA', 'ACBD')))

    def test_every_other_person_once(self):
        for n in range(2, 15):
            names = [f'Person{i}' for i in range(n)]
            h = self.history()
            recipients = {name: set() for name in names}
            for week in range(1, n):
                assignments = plan_week(h, week, names)['assignments']
                self.assertEqual(set(assignments.values()), set(names))
                for owner, target in assignments.items():
                    self.assertNotEqual(owner, target)
                    recipients[owner].add(target)
            for owner in names:
                self.assertEqual(recipients[owner], set(names) - {owner})

    def test_saved_week_and_date_survive_roster_change(self):
        h = self.history()
        record = copy.deepcopy(plan_week(h, 1, list('ABCD'), date(2026, 1, 1)))
        plan_week(h, 3, list('ABC'))
        self.assertEqual(plan_week(h, 1, list('XYZ'), date(2027, 1, 1)), record)
        self.assertEqual(plan_week(h, 5, list('ABC'))['cycle_start'], 5)
        self.assertEqual(len(h['cycles']), 3)

    def test_skipped_weeks_advance_cycles(self):
        h = self.history()
        plan_week(h, 24, list('ABCD'))
        self.assertEqual(plan_week(h, 31, list('ABCD'))['cycle_start'], 30)
        with self.assertRaises(ValueError):
            plan_week(h, 25, list('ABCD'))

    def test_invalid_names(self):
        for names in [[], ['A'], ['A', 'A'], ['A One', 'A Two'], ['../A', 'B'], ['A\nX', 'B']]:
            with self.assertRaises(ValueError):
                validate_config({'week': 1, 'names': names})

    def test_template_and_deterministic_pdf(self):
        record = {'week': 4, 'date': '2026-09-11'}
        text = render_text('[name]\n\n[name_to_pray]\n[nr] [date]', record, 'Anett', 'Linnea')
        self.assertEqual(text, 'Anett\n\nLinnea\n4 11.09.2026')
        self.assertEqual(make_pdf(text), make_pdf(text))
        self.assertTrue(make_pdf(text).startswith(b'%PDF-'))

    def test_end_to_end_rerun_and_template_edit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config, template, history = (root / p for p in ['config.json', 'sample.txt', 'history.json'])
            config.write_text(json.dumps({'week': 1, 'names': ['A', 'B', 'C']}))
            template.write_text('[name]\n[name_to_pray]\n[nr]\n[date]')
            output = root / 'pdfs'
            generate(config, template, history, output)
            saved = history.read_bytes()
            pdfs = {p: p.read_bytes() for p in output.rglob('*.pdf')}
            self.assertEqual(len(pdfs), 3)
            generate(config, template, history, output)
            self.assertEqual(history.read_bytes(), saved)
            self.assertTrue(all(p.read_bytes() == data for p, data in pdfs.items()))
            template.write_text('New layout\n[name]\n[name_to_pray]')
            generate(config, template, history, output)
            self.assertEqual(history.read_bytes(), saved)
            self.assertTrue(all(p.read_bytes() != data for p, data in pdfs.items()))
            for content in ['[name]', '[name_to_pray]', '[nr] [date]', 'Plain text', '']:
                with self.subTest(template=content):
                    template.write_text(content)
                    generate(config, template, history, output)
                    self.assertEqual(history.read_bytes(), saved)
                    self.assertEqual(len(list(output.rglob('*.pdf'))), 3)
                    self.assertTrue(all(p.read_bytes().startswith(b'%PDF-') for p in pdfs))


if __name__ == '__main__':
    unittest.main()
