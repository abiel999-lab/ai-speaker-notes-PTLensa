#!/usr/bin/env python3
"""Send narrowly scoped operational alerts through the configured SMTP relay."""
import hashlib
import json
import os
import re
import smtplib
import sqlite3
import ssl
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage
from pathlib import Path

WATCH = {
    'actia-notepreso-app-live-rotated': ('Speaker Notes', {'job_failed', 'notes_recovery_failed', 'credit_refund_failed'}),
    'actia-presentation-app': ('Presentation Generator', {'document_import_failed', 'full_copy_prepare_failed', 'document_plan_rejected', 'request_failed', 'generation_failure', 'presentation_recovery_failed'}),
    'actia-presentation-worker': ('Presentation Generator', {'generation_failure', 'presentation_recovery_failed', 'queue_delivery', 'platform_refund_pending'}),
    'actia-translation-app': ('Translator', {'translation_upload_failed', 'translation_failure', 'translation_recovery_failed'}),
}
TOKEN = re.compile(r'[A-Za-z0-9_-]{1,80}\Z')


def clean(value, fallback=''):
    return value if isinstance(value, str) and TOKEN.fullmatch(value) else fallback


def parse_line(container, line):
    timestamp, sep, content = line.partition(' ')
    if not sep or not re.fullmatch(r'[\dT:Z.+-]{20,40}', timestamp):
        return None
    service, events = WATCH[container]
    try:
        data = json.loads(content)
    except ValueError:
        match = re.search(r'\b(job_failed|notes_recovery_failed|credit_refund_failed) job_id=([0-9a-f-]{36})\b', content)
        data = {'event':match[1], 'jobId':match[2]} if match else {}
    if not isinstance(data, dict) or data.get('event') not in events:
        return None
    event = data['event']
    code = clean(data.get('code'), 'PROCESSING_ERROR')
    reference = clean(data.get('jobId')) or clean(data.get('requestId'))
    digest = hashlib.sha256(f'{container}|{timestamp}|{event}|{code}|{reference}'.encode()).hexdigest()
    return digest, service, timestamp, event, code, reference


def read_container(container, since):
    result = subprocess.run(['docker','logs','--timestamps','--since',str(since),container],
                            capture_output=True, text=True, errors='replace', timeout=8, check=True)
    return [event for line in (result.stdout+'\n'+result.stderr).splitlines()
            if (event := parse_line(container,line))]


def send_alert(event, config, smtp_ssl=smtplib.SMTP_SSL, smtp_starttls=smtplib.SMTP):
    digest, service, timestamp, kind, code, reference = event
    message=EmailMessage()
    message['From']=config['from']
    message['To']=config['to']
    message['Subject']=f'[NotePreso] {service}: {code}'
    message['Message-ID']=f'<notepreso-{digest}@notepreso.com>'
    message.set_content(f'Service: {service}\nTime: {timestamp}\nEvent: {kind}\nCode: {code}\nReference: {reference or "Unavailable"}\n')
    context=ssl.create_default_context()
    settings={'host':config['host'], 'port':config['port'], 'timeout':12}
    client=smtp_ssl(**settings,context=context) if config['tls']=='implicit' else smtp_starttls(**settings)
    with client:
        if config['tls']=='starttls':
            client.ehlo();client.starttls(context=context);client.ehlo()
        client.login(config['user'],config['password'])
        client.send_message(message)


def load_settings():
    config={key:os.environ[f'NOTEPRESO_ALERT_{key.upper()}'] for key in ('host','port','from','to','user','password','tls')}
    config['port']=int(config['port'])
    if config['tls'] not in {'implicit','starttls'}:
        raise ValueError('TLS must be implicit or starttls')
    return config


def main():
    config=load_settings()
    state=Path(os.environ.get('STATE_DIRECTORY','/var/lib/notepreso-alerts'))
    with sqlite3.connect(state/'queue.sqlite3') as db, ThreadPoolExecutor(max_workers=4) as pool:
        db.execute('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, service TEXT, timestamp TEXT, kind TEXT, code TEXT, reference TEXT, sent INTEGER)')
        db.execute('CREATE TABLE IF NOT EXISTS cursors (service TEXT PRIMARY KEY, observed INTEGER)')
        retry_at=0
        while True:
            start=int(time.time())
            futures={}
            for container in WATCH:
                cursor=db.execute('SELECT observed FROM cursors WHERE service=?',(container,)).fetchone()
                futures[container]=pool.submit(read_container,container,max(0,cursor[0]-5 if cursor else start-10))
            for container, future in futures.items():
                try:
                    events=future.result()
                except (OSError,subprocess.SubprocessError):
                    print('alert log scan failed for '+container,flush=True)
                    continue
                db.executemany('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,NULL)',events)
                db.execute('INSERT INTO cursors VALUES (?,?) ON CONFLICT(service) DO UPDATE SET observed=excluded.observed',(container,start))
            db.commit()
            if time.monotonic()>=retry_at:
                for event in db.execute('SELECT id,service,timestamp,kind,code,reference FROM events WHERE sent IS NULL ORDER BY timestamp LIMIT 20').fetchall():
                    try:
                        send_alert(event,config)
                    except (OSError,smtplib.SMTPException,ValueError) as error:
                        print('alert SMTP delivery deferred: '+type(error).__name__,flush=True)
                        retry_at=time.monotonic()+30
                        break
                    db.execute('UPDATE events SET sent=? WHERE id=?',(int(time.time()),event[0]));db.commit()
            db.execute('DELETE FROM events WHERE sent < ?',(start-30*86400,));db.commit()
            time.sleep(3)


if __name__=='__main__':
    main()
