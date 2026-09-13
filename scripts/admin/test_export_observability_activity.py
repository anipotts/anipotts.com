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

if __name__=='__main__': unittest.main()
