#!/usr/bin/env python3
"""First-party operational snapshot. No customer content or external notifications."""
import subprocess,json,urllib.request,datetime,os,shutil
from pathlib import Path
NAMES=['actia-notepreso-app-live-rotated','actia-presentation-app','actia-presentation-worker','actia-translation-app','notepreso-contact-ui-20261026t050754z','notepreso-translation-monitor']
report={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'services':[],'http':[],'alerts':[]}
for name in NAMES:
 try:
  x=json.loads(subprocess.check_output(['docker','inspect',name],timeout=10))[0];state=x['State'];health=state.get('Health',{}).get('Status');healthy=state['Running'] and (health=='healthy' or name=='actia-presentation-worker' and health is None)
  report['services'].append({'name':name,'running':state['Running'],'health':health,'restarts':x['RestartCount'],'oom':state['OOMKilled']})
  if not healthy:report['alerts'].append('service_not_healthy:'+name)
 except Exception:report['alerts'].append('inspect_failed:'+name)
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
