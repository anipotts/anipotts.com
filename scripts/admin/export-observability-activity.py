#!/usr/bin/env python3
"""One bounded read-only operational checkpoint export; never opens a writer.

No HTTP server, credential, outbox acknowledgement, or personal-record read.
Output contains only the six established Store.activity metadata fields.
"""
import argparse
import datetime
import json
from pathlib import Path
import re
import sqlite3
import sys

STAGES = {'discovered','available','captured','validated','recorded','indexed','identity_changed','wiki_updated','wiki_published','source_observed','source_registered','failed','excluded','retried','quarantined'}
STATES = {'observed','succeeded','failed','pending','blocked','skipped','excluded'}
FIELDS = 'change_id,trace_id,stage,state,record_count,observed_at'
MAX_CURSOR = 10_000_000
MAX_SAFE_INTEGER = 9_007_199_254_740_991
# Calendar ISO forms shared by Python and the downstream JavaScript parser.
TIMESTAMP = re.compile(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)')

def export(database, after=0, limit=100):
    if type(after) is not int or not 0 <= after <= MAX_CURSOR or type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError('Invalid activity bounds')
    path = Path(database).resolve(strict=True)
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=1)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute('PRAGMA query_only=ON')
        rows = [dict(row) for row in connection.execute(
            f'SELECT {FIELDS} FROM changes WHERE change_id>? ORDER BY change_id LIMIT ?', (after,limit))]
        now = datetime.datetime.now(datetime.timezone.utc)
        previous = after
        for row in rows:
            if (type(row['change_id']) is not int or not previous < row['change_id'] <= MAX_CURSOR
                    or type(row['record_count']) is not int or not 0 <= row['record_count'] <= MAX_SAFE_INTEGER):
                raise ValueError('Invalid activity count')
            if not isinstance(row['trace_id'],str) or not re.fullmatch(r'[0-9a-fA-F]{32}',row['trace_id']) or int(row['trace_id'],16)==0:
                raise ValueError('Invalid activity identifier')
            if row['stage'] not in STAGES or row['state'] not in STATES:
                raise ValueError('Invalid activity state')
            previous = row['change_id']
            if not isinstance(row['observed_at'], str) or not TIMESTAMP.fullmatch(row['observed_at']):
                raise ValueError('Invalid activity timestamp')
            instant = datetime.datetime.fromisoformat(row['observed_at'].replace('Z','+00:00'))
            if instant.tzinfo is None or not datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc) <= instant <= now:
                raise ValueError('Invalid activity timestamp')
        return {'items':rows,'next_cursor':rows[-1]['change_id'] if rows else after}
    finally:
        connection.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',required=True)
    parser.add_argument('--after',type=int,default=0)
    parser.add_argument('--limit',type=int,default=100)
    args=parser.parse_args()
    try:
        result=export(args.database,args.after,args.limit)
        print(json.dumps(result,separators=(',',':')))
        return 0
    except (OSError,ValueError,TypeError,sqlite3.Error):
        print('Operational activity unavailable',file=sys.stderr)
        return 1
if __name__=='__main__':
    raise SystemExit(main())
