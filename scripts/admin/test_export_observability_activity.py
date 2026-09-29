import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest
from contextlib import closing

spec=importlib.util.spec_from_file_location('exporter',Path(__file__).with_name('export-observability-activity.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/'test.sqlite'
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('CREATE TABLE changes(change_id INTEGER,trace_id TEXT,stage TEXT,state TEXT,record_count INTEGER,observed_at TEXT,private_body TEXT)')
            db.execute('INSERT INTO changes VALUES(1,?,?,?,?,?,?)',('a'*32,'recorded','succeeded',1,'2026-01-01T00:00:00Z','private fixture'))
            db.commit()
    def tearDown(self): self.tmp.cleanup()
    def test_exact_metadata_and_no_mutation(self):
        before=self.path.read_bytes()
        result=module.export(self.path)
        self.assertEqual(set(result['items'][0]),set(module.FIELDS.split(',')))
        self.assertNotIn('private fixture',str(result))
        self.assertEqual(before,self.path.read_bytes())
        self.assertEqual(module.export(self.path,1),{'items':[],'next_cursor':1})
    def test_bounds_fail_before_read(self):
        for limit in (0,101):
            with self.assertRaises(ValueError): module.export(self.path,0,limit)
    def test_unknown_states_rejected(self):
        with closing(sqlite3.connect(self.path)) as db: db.execute("UPDATE changes SET state='private payload'"); db.commit()
        with self.assertRaisesRegex(ValueError,'Invalid activity state'):module.export(self.path)


    def update_row(self, field, value):
        self.assertIn(field, ('change_id', 'record_count', 'observed_at'))
        with closing(sqlite3.connect(self.path)) as db:
            db.execute(f'UPDATE changes SET {field}=?', (value,))
            db.commit()

    def test_cursor_bounds_and_safe_record_count(self):
        for after in (-1, 10_000_001, True, 1.5):
            with self.assertRaises(ValueError): module.export('/does-not-exist', after)
        self.update_row('change_id', 10_000_000)
        self.update_row('record_count', 9_007_199_254_740_991)
        result = module.export(self.path, 9_999_999)
        self.assertEqual(result['next_cursor'], 10_000_000)
        self.assertEqual(module.export(self.path, 10_000_000), {'items': [], 'next_cursor': 10_000_000})
        self.update_row('change_id', 10_000_001)
        with self.assertRaises(ValueError): module.export(self.path)
        self.update_row('change_id', 1)
        self.update_row('record_count', 9_007_199_254_740_992)
        with self.assertRaises(ValueError): module.export(self.path)

    def test_consumer_compatible_dates_preserve_original_values(self):
        for value in ('1970-01-01T00:00:00Z', '1970-01-01T01:00:00+01:00',
                      '2026-01-01T00:00:00.123456Z', '2026-01-01 00:00:00+00:00',
                      '2026-01-01T00:00-05:00'):
            self.update_row('observed_at', value)
            self.assertEqual(module.export(self.path)['items'][0]['observed_at'], value)

    def test_out_of_contract_dates_fail_closed(self):
        for value in ('1969-12-31T23:59:59Z', '1970-01-01T00:00:00+01:00',
                      '9999-01-01T00:00:00Z', '2026-01-01T00:00:00',
                      '20260101T000000Z', '2026-W01-4T00:00:00Z',
                      '2026-01-01X00:00:00Z', '2026-01-01T00:00:00+0000',
                      '2026-01-01T00:00:00+24:00', '2026-02-30T00:00:00Z'):
            self.update_row('observed_at', value)
            with self.subTest(value=value), self.assertRaises(ValueError): module.export(self.path)

    def test_duplicate_cursor_is_rejected(self):
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('INSERT INTO changes SELECT * FROM changes')
            db.commit()
        with self.assertRaises(ValueError): module.export(self.path)

if __name__=='__main__': unittest.main()
