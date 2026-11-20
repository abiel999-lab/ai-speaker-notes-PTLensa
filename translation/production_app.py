"""Independent Translator service. Notes remains the identity and credit authority."""
from pathlib import Path
from uuid import UUID,uuid4
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager,contextmanager
import asyncio,base64,hashlib,hmac,json,os,re,secrets,sqlite3,subprocess,threading,time
import httpx
from fastapi import FastAPI,Request,HTTPException
from fastapi.responses import HTMLResponse,JSONResponse,RedirectResponse,FileResponse
from fastapi.staticfiles import StaticFiles
from session_auth import SessionManager
from translator import translate_file,OpenAITranslator,TranslationError,MAX_UPLOAD,package,xml,P,normalize_ooxml_variant,recover_translation
from normalize_legacy import normalize_legacy

ROOT=Path(os.getenv('TRANSLATION_STORAGE','/data'));ROOT.mkdir(parents=True,exist_ok=True)
CONFIG=json.loads(Path(os.getenv('TRANSLATION_CONFIG','/run/secrets/translation.json')).read_text())
ORIGIN='https://translation.notepreso.com';COOKIE='__Host-np_translation';LOGIN_COOKIE='__Host-np_translation_login'
SIGNED_OUT_COOKIE='__Host-np_translation_signed_out'
AUTH_COOKIE_OPTIONS={'path':'/','secure':True,'httponly':True,'samesite':'lax'}
SESSIONS=SessionManager(CONFIG['session_secret'],max_age_seconds=30*86400)
LOGIN=SessionManager(hashlib.sha256((CONFIG['session_secret']+':login-state-v1').encode()).hexdigest(),max_age_seconds=600)
LANGUAGES=['auto', 'Indonesian', 'English', 'Arabic', 'Bengali', 'Bulgarian', 'Burmese', 'Catalan', 'Chinese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Croatian', 'Czech', 'Danish', 'Dutch', 'Estonian', 'Filipino', 'Finnish', 'French', 'German', 'Greek', 'Gujarati', 'Hebrew', 'Hindi', 'Hungarian', 'Icelandic', 'Italian', 'Japanese', 'Javanese', 'Kannada', 'Khmer', 'Korean', 'Lao', 'Latvian', 'Lithuanian', 'Malay', 'Malayalam', 'Marathi', 'Nepali', 'Norwegian', 'Persian', 'Polish', 'Portuguese', 'Portuguese (Brazil)', 'Portuguese (Portugal)', 'Punjabi', 'Romanian', 'Russian', 'Serbian', 'Sinhala', 'Slovak', 'Slovenian', 'Spanish', 'Sundanese', 'Swahili', 'Swedish', 'Tamil', 'Telugu', 'Thai', 'Turkish', 'Ukrainian', 'Urdu', 'Uzbek', 'Vietnamese', 'Welsh']
LOCK=threading.RLock();ACTIVE=set();UPLOADING=set();POOL=ThreadPoolExecutor(max_workers=1)

def read(p):
 with LOCK:return json.loads((p/'job.json').read_text())
def save(p,data):
 with LOCK:
  temp=p/'job.tmp';temp.write_text(json.dumps(data,ensure_ascii=False));os.replace(temp,p/'job.json')
def identity(request):
 if request.cookies.get(SIGNED_OUT_COOKIE):return None
 try:
  who=SESSIONS.parse(request.cookies.get(COOKIE))
  if who and who.terms_version=='translation-v1' and str(UUID(who.subject))==who.subject:return who
  return None
 except Exception:return None
def job_path(job):
 try:assert str(UUID(job))==job
 except (ValueError,AssertionError):raise HTTPException(404,'Job not found')
 return ROOT/job
def owned(job,subject):
 p=job_path(job)
 if not (p/'job.json').is_file() or read(p)['owner']!=subject:raise HTTPException(404,'Job not found')
 return p
class BillingUnavailable(Exception):pass
class BillingRejected(Exception):pass
def billing(action,owner,**values):
 path='/api/internal/translation/v1/'+action
 body=json.dumps({'issuer':CONFIG['issuer'],'subject':owner,**values},separators=(',',':')).encode();ts=str(int(time.time()))
 message='POST\n'+path+'\n'+ts+'\n'+hashlib.sha256(body).hexdigest()
 signature=hmac.new(bytes.fromhex(CONFIG['platform_secret']),message.encode(),hashlib.sha256).hexdigest()
 try:
  r=httpx.post(CONFIG['notes_url']+path,content=body,headers={'Content-Type':'application/json','X-Notepreso-Time':ts,'X-Notepreso-Signature':signature},timeout=20)
  if r.status_code>=500:raise BillingUnavailable()
  if r.status_code!=200:
   code=r.json().get('detail','BILLING_REJECTED')
   raise BillingRejected(code if isinstance(code,str) else 'BILLING_REJECTED')
  return r.json()
 except (httpx.HTTPError,ValueError):raise BillingUnavailable() from None

from job_failure_events import record_failure

def alert_failure(d, code, error=None, diagnostic=None):
 record_failure(
  ROOT, 'Translator', d['id'], d['owner'], code, error=error,
  status=d['status'], stage=d['phase'], slides=d['slides'],
  completedSegments=d.get('completed_segments'), totalSegments=d.get('total_segments'),
  attempt=d.get('provider_retries',0)+1, refunded=d['phase']=='refunded',
  **(diagnostic or {}),
 )

def worker(job):
 p=job_path(job);d=read(p)
 try:
  # Replay the same operation on uncertain network responses: no duplicate charge.
  if d['phase']=='reserving':
   receipt=billing('reserve',d['owner'],operationId=d['operation'],model='gpt-6-luna',maxSlides=d['slides'],sourceHash=d['source_hash'],expectedPlan='pro',maxCredits=d['slides'])
   if receipt['state']=='committed':d['phase']='settling'
   else:d['phase']='translating'
   d['status']='processing';save(p,d)
  if d['phase']=='translating':
   try:
    def progress(done,total):d.update(completed_segments=done,total_segments=total);save(p,d)
    translate_file(p/'input.pptx',p/'translated.pptx',OpenAITranslator(CONFIG['model'],api_key=CONFIG['openai_key']),source_language=d['source'],target_language=d['target'],fit=d['fit'],checkpoint=p/'checkpoint.json',progress=progress)
    d.update(phase='settling',error_code=None);save(p,d)
   except Exception as error:
    transient=type(error).__name__ in {'APIConnectionError','APITimeoutError','RateLimitError','InternalServerError'} or getattr(error,'status_code',0) in {408,409,429,500,502,503,504}
    retries=int(d.get('provider_retries',0))
    if transient and retries<3:
     d.update(provider_retries=retries+1,status='reconciling',next_retry_at=int(time.time())+[30,120,300][retries],message='The translation provider is temporarily unavailable. Retrying automatically; saved progress and the existing credit reservation are preserved.')
     save(p,d);return
    d['error_code']='TRANSLATION_VALIDATION_FAILED' if isinstance(error,TranslationError) else 'PROVIDER_UNAVAILABLE' if transient else 'PROCESSING_FAILED'
    print(json.dumps({'event':'translation_failure','code':d['error_code'],'jobId':job}),flush=True)
    try:
     recovery=recover_translation(p/'input.pptx',p/'translation-recovery.pptx',p/'checkpoint.json',d['source'],d['target'],CONFIG['model'])
     d['recovery']={key:recovery[key] for key in ('status','translated_segments','untranslated_segments')}
    except Exception:
     print(json.dumps({'event':'translation_recovery_failed','code':'RECOVERY_COPY_FAILED','jobId':job}),flush=True)
    diagnostic={'type':type(error).__name__,'status':getattr(error,'status_code',None),'reason':str(error)[:250] if isinstance(error,TranslationError) else 'Provider or processing failure; content omitted'}
    diagnostic['stack']=[f'{Path(frame.filename).name}:{frame.lineno} ({frame.name})' for frame in __import__('traceback').extract_tb(error.__traceback__)[-12:]]
    diagnostic_path=p/'error.private.json';diagnostic_path.write_text(json.dumps(diagnostic));diagnostic_path.chmod(0o600)
    d['phase']='refunding';save(p,d)
  if d['phase']=='settling':
   receipt=billing('settle',d['owner'],operationId=d['operation'],actualSlides=d['slides'])
   assert receipt['state']=='committed' and receipt['chargedCredits']==d['slides']
   d.update(phase='done',status='completed',message='Translation ready. Review layout in PowerPoint before use.',charged_credits=d['slides']);save(p,d)
  elif d['phase']=='refunding':
   receipt=billing('refund',d['owner'],operationId=d['operation']);assert receipt['state']=='refunded'
   recovered=bool(d.get('recovery'))
   message='A recovery PowerPoint is ready. Unfinished text stays in its original language. Credits were returned where still valid; retry the saved job to continue.' if recovered else 'Translation stopped. Reserved credits were returned where still valid; completed segments are saved for retry.'
   d.update(phase='refunded',status='recovered' if recovered else 'failed',message=message);save(p,d)
   try:detail=json.loads((p/'error.private.json').read_text())
   except (OSError,ValueError):detail={}
   alert_failure(d,d.get('error_code','PROCESSING_FAILED'),diagnostic={'exceptionType':detail.get('type'),'providerStatus':detail.get('status'),'stack':detail.get('stack',[])})
 except BillingUnavailable:
  d.update(status='reconciling',message='Reconnecting to NotePreso billing. Your job is saved; no new charge is created.');save(p,d)
 except BillingRejected as e:
  # Never discard an uncertain reserved/committed payment as a generic failure.
  d.update(status='failed' if d['phase']=='reserving' else 'needs_review',message={'PRO_REQUIRED':'An active NotePreso Pro account is required.','INSUFFICIENT_CREDITS':'Insufficient shared AI credits. Add credits in NotePreso and retry.'}.get(str(e),'The credit operation could not be confirmed. Contact support with this job ID.'));save(p,d)
  alert_failure(d,str(e),e)
 except Exception as error:
  d.update(status='needs_review',message='This job needs a billing check before it can continue. Contact support with the job ID.');save(p,d)
  alert_failure(d,'BILLING_OR_PROCESSING_REVIEW',error)
 finally:
  with LOCK:ACTIVE.discard(job)
def enqueue(job):
 with LOCK:
  if job in ACTIVE:return
  ACTIVE.add(job)
 POOL.submit(worker,job)
STOP=threading.Event()
@contextmanager
def auth_database():
 db=sqlite3.connect(ROOT/'auth.sqlite')
 try:
  with db:yield db
 finally:db.close()
def reconcile_loop():
 while not STOP.wait(15):
  for file in ROOT.glob('*/job.json'):
   try:
    d=read(file.parent)
    if d['status']=='reconciling' and int(d.get('next_retry_at',0))<=int(time.time()):enqueue(file.parent.name)
   except Exception:continue
@asynccontextmanager
async def lifespan(app):
 with auth_database() as db:db.execute('CREATE TABLE IF NOT EXISTS used_tickets (jti TEXT PRIMARY KEY,expires INTEGER NOT NULL)')
 for file in ROOT.glob('*/job.json'):
  d=read(file.parent)
  if d['status'] in {'queued','processing','reconciling'}:enqueue(file.parent.name)
 thread=threading.Thread(target=reconcile_loop,daemon=True);thread.start()
 yield
 STOP.set();POOL.shutdown(wait=True)
app=FastAPI(title='NotePreso Translator',docs_url=None,redoc_url=None,lifespan=lifespan)
app.mount('/static',StaticFiles(directory=Path(__file__).parent/'static'),name='static')
@app.middleware('http')
async def guard(request,call_next):
 host=request.headers.get('host','').split(':')[0]
 if host not in {'translation.notepreso.com','127.0.0.1','localhost','testserver'}:return JSONResponse({'detail':'Unknown host'},status_code=400)
 who=identity(request);request.state.identity=who
 if request.url.path.startswith('/api/') and request.url.path not in {'/api/health','/api/session','/api/auth/complete'}:
  if not who:return JSONResponse({'detail':'Sign in with NotePreso to continue'},status_code=401)
 if request.method=='POST':
  if request.headers.get('origin')!=ORIGIN:return JSONResponse({'detail':'Origin not allowed'},status_code=403)
  if request.url.path!='/api/auth/complete' and (not who or not hmac.compare_digest(request.headers.get('x-csrf-token',''),who.csrf)):return JSONResponse({'detail':'Refresh your session before retrying'},status_code=403)
 # Check live entitlement before accepting uploads, exposing jobs or downloads.
 if who and request.url.path.startswith('/api/jobs'):
  try:
   snapshot=await asyncio.to_thread(billing,'account',who.subject)
  except (BillingUnavailable,BillingRejected):return JSONResponse({'detail':'Account verification is temporarily unavailable. Please retry.'},status_code=503)
  if snapshot.get('account',{}).get('plan')!='pro':return JSONResponse({'detail':'An active NotePreso Pro subscription is required.'},status_code=403)
 response=await call_next(request)
 response.headers.update({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'})
 response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
 from nora_policy import eligible, extend_csp
 if eligible(request.url.hostname,request.url.path,response.headers.get('content-type','')):
  response.headers['Content-Security-Policy']=extend_csp(response.headers['Content-Security-Policy'])
 if who and request.url.path!='/api/auth/logout' and response.status_code<400:
  renewed=SESSIONS.renew(request.cookies.get(COOKIE))
  if renewed:response.set_cookie(COOKIE,renewed,max_age=30*86400,secure=True,httponly=True,samesite='lax',path='/')
 return response
@app.get('/api/health')
def health():return {'status':'ok','service':'translation','billing':'shared-credits','credits_per_slide':1}
@app.get('/')
def home(request:Request):
 who=request.state.identity
 if not who:
  if request.cookies.get(SIGNED_OUT_COOKIE):
   return HTMLResponse((Path(__file__).parent/'access.html').read_text(encoding='utf-8'))
  # SSO returns a ticket in the fragment. Complete it before checking access.
  state=LOGIN.parse(request.cookies.get(LOGIN_COOKIE))
  if state:
   return HTMLResponse('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signing in | NotePreso</title></head><body><p id="sign-in-status" role="status">Completing sign-inâ€¦</p><script src="/static/callback.js" defer></script></body></html>')
  return login()
 try:
  snapshot=billing('account',who.subject)
 except (BillingUnavailable,BillingRejected):
  return HTMLResponse('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Account verification | NotePreso</title></head><body><h1>Account verification is temporarily unavailable</h1><p>Please try again shortly.</p><a href="/">Retry</a></body></html>',status_code=503)
 if snapshot.get('account',{}).get('plan')!='pro':return RedirectResponse('https://notepreso.com/pricing',status_code=303)
 return HTMLResponse((Path(__file__).parent/'production.html').read_text())
@app.get('/how-to')
def guide():return HTMLResponse((Path(__file__).parent/'guide.html').read_text())
@app.get('/api/languages')
def languages():return {'languages':LANGUAGES}

@app.get('/app.js')
def javascript():return FileResponse(Path(__file__).parent/'workspace.js',media_type='application/javascript')
@app.get('/auth/login')
def login():
 state=secrets.token_urlsafe(32);cookie,_=LOGIN.issue(state,subject=state,terms_version='translation-login-v1')
 res=RedirectResponse('https://notepreso.com/auth/translation/connect?state='+state,status_code=303)
 res.set_cookie(LOGIN_COOKIE,cookie,max_age=600,**AUTH_COOKIE_OPTIONS)
 res.delete_cookie(SIGNED_OUT_COOKIE,**AUTH_COOKIE_OPTIONS)
 return res
@app.post('/api/auth/complete')
async def complete(request:Request):
 if request.cookies.get(SIGNED_OUT_COOKIE):
  return JSONResponse({'detail':'Sign in again to use Translator.'},status_code=400)
 try:
  raw=await request.body();assert len(raw)<4096
  token=json.loads(raw)['ticket'];encoded,signature=token.split('.',1)
  assert hmac.compare_digest(signature,hmac.new(bytes.fromhex(CONFIG['platform_secret']),('translation-login-v1.'+encoded).encode(),hashlib.sha256).hexdigest())
  value=json.loads(base64.urlsafe_b64decode(encoded+'='*(-len(encoded)%4)))
  state=LOGIN.parse(request.cookies.get(LOGIN_COOKIE));assert state and hmac.compare_digest(value['state'],state.username)
  assert value['purpose']=='translation-login-v1' and value['aud']==ORIGIN and value['iss']==CONFIG['issuer'] and int(time.time())<value['exp']<=int(time.time())+65
  assert str(UUID(value['sub']))==value['sub']
  with auth_database() as db:
   db.execute('DELETE FROM used_tickets WHERE expires<?',(int(time.time()),));db.execute('INSERT INTO used_tickets VALUES (?,?)',(value['jti'],value['exp']))
 except Exception:return JSONResponse({'detail':'Sign-in expired or could not be confirmed. Start sign-in again.'},status_code=400)
 token,who=SESSIONS.issue(value['sub'],subject=value['sub'],terms_version='translation-v1')
 res=JSONResponse({'authenticated':True,'csrf_token':who.csrf});res.set_cookie(COOKIE,token,max_age=30*86400,secure=True,httponly=True,samesite='lax',path='/');res.delete_cookie(LOGIN_COOKIE,path='/',secure=True,httponly=True,samesite='lax');return res
@app.get('/api/session')
def session(request:Request):
 who=request.state.identity
 return {'authenticated':bool(who),'csrf_token':who.csrf if who else None,'display_name':who.display_name if who else None}
@app.get('/api/account')
def account(request:Request):
 try:return billing('account',request.state.identity.subject)
 except Exception:raise HTTPException(503,'Account information is temporarily unavailable') from None
@app.post('/api/auth/logout')
def logout():
 res=JSONResponse({'ok':True})
 res.delete_cookie(COOKIE,**AUTH_COOKIE_OPTIONS)
 res.delete_cookie(LOGIN_COOKIE,**AUTH_COOKIE_OPTIONS)
 res.set_cookie(SIGNED_OUT_COOKIE,'1',max_age=30*86400,**AUTH_COOKIE_OPTIONS)
 return res
@app.post('/api/jobs')
async def create(request:Request,filename:str,job_id:str,source:str='auto',target:str='Indonesian',fit:str='review',allow_legacy:bool=False):
 owner=request.state.identity.subject;p=job_path(job_id)
 if source not in LANGUAGES or target not in LANGUAGES[1:] or fit not in {'review','shrink'}:raise HTTPException(400,'Choose valid language and fit options')
 if (p/'job.json').exists():
  existing=read(owned(job_id,owner))
  if (source,target,fit)!=(existing['source'],existing['target'],existing['fit']):raise HTTPException(409,'Job settings differ; create a new job')
  return {'id':job_id}
 suffix=Path(filename).suffix.lower()
 if suffix not in {'.ppt','.pptx','.ppsx','.potx'} or (suffix=='.ppt' and not allow_legacy):raise HTTPException(400,'Choose PPTX, PPSX or POTX, or enable conversion for legacy PPT')
 with LOCK:
  if sum(f.stat().st_size for f in ROOT.glob('*/input.pptx'))>4*1024*1024*1024:raise HTTPException(507,'Upload storage is full. Please contact support.')
  if len(ACTIVE)+len(UPLOADING)>=4 or owner in UPLOADING or any(read(job_path(x))['owner']==owner for x in ACTIVE):raise HTTPException(429,'Please wait for your current job')
  UPLOADING.add(owner)
 try:
  p.mkdir(mode=0o700,exist_ok=True);upload=p/('original'+suffix);size=0
  with upload.open('wb') as f:
   async for chunk in request.stream():
    size+=len(chunk)
    if size>MAX_UPLOAD:raise HTTPException(413,'Upload limit: 100 MB')
    f.write(chunk)
  if suffix=='.ppt':normalize_legacy(upload,p/'input.pptx')
  elif suffix in {'.ppsx','.potx'}:normalize_ooxml_variant(upload,p/'input.pptx',suffix)
  else:os.replace(upload,p/'input.pptx')
  data=(p/'input.pptx').read_bytes();z=package(data);root=xml(z.read('ppt/presentation.xml'));slides=len(root.findall('./{'+P+'}sldIdLst/{'+P+'}sldId'))
  if not 1<=slides<=5000:raise HTTPException(400,'Use a file with 1 to 5,000 slides within the upload limit')
  d={'id':job_id,'owner':owner,'filename':Path(filename).name[:150],'source':source,'target':target,'fit':fit,'source_hash':hashlib.sha256(data).hexdigest(),'slides':slides,'operation':str(uuid4()),'phase':'reserving','status':'queued','created_at':int(time.time()),'message':'Reserving shared credits: 1 per slide.'};save(p,d);enqueue(job_id);return {'id':job_id}
 except (TranslationError,KeyError,subprocess.TimeoutExpired):
  print(json.dumps({'event':'translation_upload_failed','code':'POWERPOINT_INVALID','jobId':job_id}),flush=True)
  raise HTTPException(400,'The PowerPoint file could not be safely read. If it opens in PowerPoint, save a new macro-free PPTX and retry.') from None
 finally:
  with LOCK:UPLOADING.discard(owner)
  if not (p/'job.json').exists():
   # Only this request's unaccepted upload; never touch another job's data.
   for name in ['original'+suffix,'input.pptx']:(p/name).unlink(missing_ok=True)
@app.get('/api/jobs')
def history(request:Request):
 owner=request.state.identity.subject;items=[]
 for file in ROOT.glob('*/job.json'):
  try:
   d=read(file.parent)
   if d['owner']==owner:items.append({k:d.get(k) for k in ['id','filename','created_at','status','target','slides']})
  except (ValueError,KeyError,OSError):continue
 return {'jobs':sorted(items,key=lambda d:d['created_at'] or 0,reverse=True)[:20]}
@app.get('/api/jobs/{job}')
def status(job:str,request:Request):
 d=read(owned(job,request.state.identity.subject));return {k:v for k,v in d.items() if k not in {'owner','operation','source_hash'}}
@app.post('/api/jobs/{job}/retry')
def retry(job:str,request:Request):
 p=owned(job,request.state.identity.subject);d=read(p)
 if d['status'] not in {'failed','recovered'}:raise HTTPException(409,'This job cannot be retried yet')
 with LOCK:
  if len(ACTIVE)>=4 or any(read(job_path(x))['owner']==d['owner'] for x in ACTIVE):raise HTTPException(429,'Please wait for your current job')
 if d['phase']=='refunded':d.update(operation=str(uuid4()),phase='reserving')
 d.update(status='queued',provider_retries=0,next_retry_at=0);save(p,d);enqueue(job);return {'id':job}
def translated_filename(job):
 name=str(job.get('filename') or 'PowerPoint').replace(chr(92),'/').split('/')[-1]
 stem=Path(name).stem
 stem=re.sub(r'[<>:"/\\|?*\x00-\x1f\x7f]','_',stem).strip(' .') or 'PowerPoint'
 language=re.sub(r'[^\w-]+','-',str(job.get('target') or 'translated'),flags=re.UNICODE).strip('-') or 'translated'
 return f'{stem}-translate-{language}.pptx'

@app.get('/api/jobs/{job}/{artifact}')
def artifact(job:str,artifact:str,request:Request):
 p=owned(job,request.state.identity.subject);d=read(p)
 if d.get('recovery') and artifact=='recovery':return FileResponse(p/'translation-recovery.pptx',filename='translation-recovery.pptx',media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation')
 if d.get('recovery') and artifact=='recovery-report':return FileResponse(p/'translation-recovery.report.json',filename='translation-recovery.json')
 if d['status']!='completed':raise HTTPException(409,'Translation is not ready')
 if artifact=='result':return FileResponse(p/'translated.pptx',filename=translated_filename(d),media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation')
 if artifact=='report':return FileResponse(p/'translated.report.json',filename='translation-review.json')
 raise HTTPException(404,'Not found')
