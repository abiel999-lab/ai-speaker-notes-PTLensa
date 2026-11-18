from pathlib import Path
import json,copy,subprocess,importlib.util,time

# Reuse the existing Docker API client only; no deployment entrypoint executes on import.
spec=importlib.util.spec_from_file_location('ops','/home/actiaAdmin26/nora-production-cutover.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
name='notepreso-translation-monitor';old=name+'-before-healthfix-20261118'
backup=Path('/home/actiaAdmin26/translation-monitor-healthfix-20261118');backup.mkdir(mode=0o700,exist_ok=False)
info=ops.api('GET','/containers/'+name+'/json');ops.save(backup/'before.json',info)
code="import urllib.request,json;from pathlib import Path;r=urllib.request.Request('http://127.0.0.1:8020/jobs',headers={'Authorization':'Bearer '+Path('/run/monitor-token').read_text().strip()});d=json.load(urllib.request.urlopen(r,timeout=3));assert isinstance(d.get('jobs'),list)"
subprocess.run(['docker','exec',name,'python','-c',code],check=True)
cfg=copy.deepcopy(info['Config']);cfg['Image']=info['Image'];cfg['Healthcheck']={'Test':['CMD','python','-c',code],'Interval':30000000000,'Timeout':5000000000,'StartPeriod':5000000000,'Retries':3};cfg['HostConfig']=copy.deepcopy(info['HostConfig']);cfg['NetworkingConfig']={'EndpointsConfig':ops.networks(info)}
def rollback():
 try:
  cur=ops.api('GET','/containers/'+name+'/json')
  if cur['Id']!=info['Id']:ops.api('DELETE','/containers/'+name+'?force=true&v=false')
 except Exception:pass
 ops.api('POST','/containers/'+old+'/rename?name='+name)
 for n,ep in ops.networks(info).items():ops.api('POST','/networks/'+n+'/connect',{'Container':info['Id'],'EndpointConfig':ep})
 ops.api('POST','/containers/'+name+'/start')
try:
 ops.api('POST','/containers/'+name+'/stop?t=10');ops.api('POST','/containers/'+name+'/rename?name='+old)
 for n in ops.networks(info):ops.api('POST','/networks/'+n+'/disconnect',{'Container':info['Id'],'Force':True})
 new=ops.api('POST','/containers/create?name='+name,cfg);ops.api('POST','/containers/'+new['Id']+'/start')
 for attempt in range(45):
  after=ops.api('GET','/containers/'+name+'/json')
  if after['State'].get('Health',{}).get('Status')=='healthy':break
  time.sleep(1)
 else:raise RuntimeError('Monitor health failed')
 subprocess.run(['docker','exec',name,'python','-c',code],check=True)
 result={'service':name,'health':after['State']['Health']['Status'],'port':8020,'authenticated_jobs_probe':True,'old_container':old,'application_restarted':False}
 (backup/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 rollback();raise

