"""Translator boundary: NotePreso owns identity, entitlement and credit accounting."""
import base64,hashlib,hmac,json,re,secrets,time
from datetime import UTC,datetime
from urllib.parse import quote
from uuid import UUID
from fastapi import APIRouter,Request,HTTPException
from fastapi.responses import RedirectResponse
from app.core.auth import request_identity
from app.api.platform_routes import authorize,SECRET_FILE
from app.core.platform_wallet import PlatformWallet,PlatformBillingError,PlatformReceipt,active_plan,public,RATES
from app.core.database import UserRow,CreditWalletRow,FreeWeeklyUsageRow,FreePresentationReservationRow
from app.core.free_quota import week_bounds
from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
router=APIRouter(include_in_schema=False)
class TranslationWallet(PlatformWallet):
 def reserve(self,owner,operation_id,model,max_slides,source_hash,*,now=None,expected_plan=None,max_credits=None):
  import re
  try:valid=str(UUID(operation_id))==operation_id
  except (ValueError,TypeError):valid=False
  if not valid or model not in RATES or type(max_slides)is not int or not 1<=max_slides<=5000 or not re.fullmatch('[a-f0-9]{64}',source_hash or ''):raise PlatformBillingError('INVALID_BILLING_REQUEST')
  now=now or datetime.now(UTC)
  with self.db.session()as s:
   # Existing user only: no duplicate signup credits and no email-based account matching.
   if not s.get(UserRow,owner):raise PlatformBillingError('NOTEPRESO_ACCOUNT_REQUIRED')
   self.db._lock_credit_owner(s,owner)
   old=s.get(PlatformReceipt,operation_id)
   if old:
    if (old.owner,old.service,old.model,old.max_slides,old.source_hash)!=(owner,'translation',model,max_slides,source_hash):raise PlatformBillingError('BILLING_IDEMPOTENCY_CONFLICT')
    if old.state=='refunded':raise PlatformBillingError('BILLING_OPERATION_CLOSED')
    return public(old)
   plan=active_plan(s,owner,now)
   if plan!='pro':raise PlatformBillingError('PRO_REQUIRED')
   if model!='gpt-6-luna':raise PlatformBillingError('INVALID_BILLING_REQUEST')
   if expected_plan is not None and plan!=expected_plan:raise PlatformBillingError('PLAN_CHANGED')
   if max_credits is not None and(type(max_credits)is not int or max_credits<0 or(plan=='pro'and max_slides*RATES[model]>max_credits)):raise PlatformBillingError('QUOTE_CREDIT_LIMIT')
   r=PlatformReceipt(id=operation_id,owner=owner,service='translation',model=model,source_hash=source_hash,max_slides=max_slides,actual_slides=None,rate=RATES[model],monthly_used=0,topup_used=0,plan=plan,state='reserved',created_at=now,updated_at=now)
   if plan=='free':
    if model!='gpt-6-luna':raise PlatformBillingError('TERRA_REQUIRES_PRO')
    if max_slides>self.free_slides:raise PlatformBillingError('FREE_SLIDE_LIMIT')
    start,end=week_bounds(now);insert=pg_insert if self.db.engine.dialect.name=='postgresql'else sqlite_insert
    s.execute(insert(FreeWeeklyUsageRow).values(owner=owner,period_start=start,period_end=end,presentation_jobs=0).on_conflict_do_nothing(index_elements=['owner','period_start']))
    change=s.execute(update(FreeWeeklyUsageRow).where(FreeWeeklyUsageRow.owner==owner,FreeWeeklyUsageRow.period_start==start,FreeWeeklyUsageRow.presentation_jobs<self.weekly_limit).values(presentation_jobs=FreeWeeklyUsageRow.presentation_jobs+1))
    if change.rowcount!=1:raise PlatformBillingError('FREE_WEEKLY_LIMIT')
    # Same durable quota records used by Speaker Notes. No second free allowance.
    s.add(FreePresentationReservationRow(job_id='pg:'+operation_id,owner=owner,period_start=start,created_at=now));r.period_start=start;r.period_end=end
   else:
    w=self.db._ensure_credit_wallet_locked(s,owner=owner,now=now);required=max_slides*r.rate
    if w.monthly_credits+w.topup_credits<required:raise PlatformBillingError('INSUFFICIENT_CREDITS')
    r.monthly_used=min(w.monthly_credits,required);r.topup_used=required-r.monthly_used;r.period_start=w.period_start;r.period_end=w.period_end
    w.monthly_credits-=r.monthly_used;w.topup_credits-=r.topup_used;w.updated_at=now;self.ledger(s,r,'reserve',-r.monthly_used,-r.topup_used,w,now)
   s.add(r);s.commit();return public(r)

def ticket(request,subject,state):
 key=bytes.fromhex(json.loads(SECRET_FILE.read_text())['secret'])
 value={'purpose':'translation-login-v1','sub':subject,'state':state,'exp':int(time.time())+60,'jti':secrets.token_urlsafe(32),'iss':request.app.state.settings.keycloak_issuer,'aud':'https://translation.notepreso.com'}
 encoded=base64.urlsafe_b64encode(json.dumps(value,separators=(',',':')).encode()).decode().rstrip('=')
 signature=hmac.new(key,('translation-login-v1.'+encoded).encode(),hashlib.sha256).hexdigest()
 return encoded+'.'+signature
@router.get('/auth/translation/connect')
def connect(request:Request,state:str=''):
 if not re.fullmatch('[A-Za-z0-9_-]{43}',state):raise HTTPException(400,'Invalid sign-in state')
 identity=request_identity(request)
 if identity is None:return RedirectResponse('/auth/login?return_to='+quote('/auth/translation/connect?state='+state,safe=''),status_code=303)
 try:subject=str(UUID(identity.owner_key))
 except ValueError:raise HTTPException(403,'Sign in with your NotePreso account')
 return RedirectResponse('https://translation.notepreso.com/#ticket='+ticket(request,subject,state),status_code=303,headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'})
@router.post('/api/internal/translation/v1/{action}')
async def translation_action(action:str,request:Request):
 b=await authorize(request);ent=request.app.state.entitlements;db=request.app.state.db
 if action=='account':
  value=ent.account_snapshot(b.subject);value['credits']=ent.credit_snapshot(b.subject)
  from fastapi.encoders import jsonable_encoder
  with db.session() as session:
   user=session.get(UserRow,b.subject)
   profile={'display_name':(user.display_name or user.username) if user else None}
  return jsonable_encoder({'account':value,'profile':profile})
 wallet=TranslationWallet(db)
 try:
  if action=='reserve':
   snapshot=ent.account_snapshot(b.subject)
   if snapshot['plan']!='pro':raise HTTPException(402,'PRO_REQUIRED')
   ent.ensure_pro_credit_cycle(b.subject)
   if b.expectedPlan!='pro' or b.maxCredits is None:raise HTTPException(400,'CREDIT_QUOTE_REQUIRED')
   return wallet.reserve(b.subject,b.operationId,'gpt-6-luna',b.maxSlides,b.sourceHash,expected_plan='pro',max_credits=b.maxCredits)
  if action in {'settle','refund'}:
   with db.session() as session:
    receipt=session.get(PlatformReceipt,b.operationId)
    if not receipt or receipt.owner!=b.subject or receipt.service!='translation':raise HTTPException(404,'BILLING_OPERATION_NOT_FOUND')
   return wallet.finish(b.subject,b.operationId,actual_slides=b.actualSlides,refund=action=='refund')
  raise HTTPException(404,'UNKNOWN_TRANSLATION_ACTION')
 except PlatformBillingError as e:raise HTTPException(402 if e.code in {'INSUFFICIENT_CREDITS','PRO_REQUIRED'} else 409,e.code) from None
