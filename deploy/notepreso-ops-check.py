#!/usr/bin/env python3
"""First-party operational snapshot. No customer content or external notifications."""
import subprocess,json,urllib.request,datetime,os,shutil,re
from collections import Counter
from pathlib import Path
NAMES=['actia-notepreso-app-live-rotated','actia-presentation-app','actia-presentation-worker','actia-translation-app','notepreso-contact-ui-20261026t050754z','notepreso-translation-monitor']
EVENTS={'actia-notepreso-app-live-rotated':{'job_failed'},
        'actia-presentation-app':{'document_import_failed','full_copy_prepare_failed','document_plan_rejected','request_failed'},
        'actia-presentation-worker':{'generation_failure'},
        'actia-translation-app':{'translation_upload_failed','translation_failure'}}
report={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'services':[],'http':[],'alerts':[]}
for name in NAMES:
 try:
  x=json.loads(subprocess.check_output(['docker','inspect',name],timeout=10))[0];state=x['State'];health=state.get('Health',{}).get('Status');healthy=state['Running'] and (health=='healthy' or name=='actia-presentation-worker' and health is None)
  report['services'].append({'name':name,'running':state['Running'],'health':health,'restarts':x['RestartCount'],'oom':state['OOMKilled']})
  if not healthy:report['alerts'].append('service_not_healthy:'+name)
 except Exception:report['alerts'].append('inspect_failed:'+name)
report['workflow_failures_15m']={}
for service,events in EVENTS.items():
 try:
  scan=subprocess.run(['docker','logs','--since','15m','--tail','3000',service],capture_output=True,text=True,timeout=10,check=True,errors='replace')
  counts=Counter()
  for line in (scan.stdout+'\n'+scan.stderr).splitlines():
   if service=='actia-notepreso-app-live-rotated' and re.search(r'\bjob_failed job_id=[0-9a-f-]{36}\b',line):
    counts['job_failed']+=1
    continue
   try:event=json.loads(line)
   except ValueError:continue
   if not isinstance(event,dict) or event.get('event') not in events:continue
   code=event.get('code')
   counts[event['event']+':'+(code if isinstance(code,str) and re.fullmatch(r'[A-Z][A-Z0-9_]{1,79}',code) else 'UNCLASSIFIED')]+=1
  report['workflow_failures_15m'][service]=dict(counts)
  if counts:report['alerts'].append('workflow_errors:'+service)
 except Exception:report['alerts'].append('workflow_logs_unavailable:'+service)
for url in ['https://notepreso.com/','https://presentation.notepreso.com/','https://notepreso.com/support']:
 try:
  with urllib.request.urlopen(url,timeout=15) as r:
   content=r.read().decode(errors='replace');ok=r.status==200 and 'nora-support.js' in content
   if url.endswith('/support'):ok=ok and "script-src 'self'" in r.headers.get('Content-Security-Policy','') and 'value="feedback"' in content
   report['http'].append({'url':url,'status':r.status,'passed':ok})
   if not ok:report['alerts'].append('http_contract:'+url)
 except Exception:report['alerts'].append('http_unavailable:'+url)
disk=shutil.disk_usage('/');report['disk_used_percent']=round(100*disk.used/disk.total,1)
if report['disk_used_percent']>=95:report['alerts'].append('disk_above_95_percent')
out=Path('/var/lib/notepreso-ops');out.mkdir(mode=0o700,exist_ok=True);temp=out/'latest.tmp';temp.write_text(json.dumps(report,indent=2)+'\n');temp.chmod(0o600);os.replace(temp,out/'latest.json')
print(json.dumps({'utc':report['utc'],'alerts':report['alerts'],'service_count':len(report['services']),'http_count':len(report['http'])}))
raise SystemExit(bool(report['alerts']))
