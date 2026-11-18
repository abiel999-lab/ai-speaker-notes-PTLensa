from pathlib import Path
import tempfile,runpy
from app.core.database import DatabaseChatHistoryStore,DatabaseManager
ns=runpy.run_path('/tmp/test_v100_production.py')
with tempfile.TemporaryDirectory() as d:
 ns['test_sqlite_database_job_and_chat_persistence'](Path(d))
 db=DatabaseManager('sqlite:///'+d+'/memory.db');db.init_schema();store=DatabaseChatHistoryStore(db)
 history=[{'role':'user','content':'fixture question','turn':1},{'role':'assistant','content':'fixture answer','turn':1,'referenced_slides':[2]}]
 store.save(history,owner='fixture-a',scope_key='deck-a',mode='rag',job_id='deck-a')
 restored=DatabaseChatHistoryStore(DatabaseManager('sqlite:///'+d+'/memory.db'))
 assert restored.load(owner='fixture-a',scope_key='deck-a',mode='rag',job_id='deck-a')==history
 assert restored.load(owner='fixture-b',scope_key='deck-a',mode='rag',job_id='deck-a')==[]
 assert restored.load(owner='fixture-a',scope_key='deck-b',mode='rag',job_id='deck-b')==[]
 assert restored.load(owner='fixture-a',scope_key='deck-a',mode='general')==[]
 print('PASS stored chat survives store recreation; owner, deck and general/RAG scopes isolated; actual model calls=0')
