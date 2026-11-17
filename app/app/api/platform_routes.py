"""Private service boundary. Never trusts browser cookies, email, owner IDs or client rates."""
import hashlib,hmac,json,time,re
from pathlib import Path
from uuid import UUID
from fastapi import APIRouter,Request,HTTPException
from pydantic import BaseModel,ConfigDict,Field
from app.core.platform_wallet import PlatformWallet,PlatformBillingError
router=APIRouter(prefix='/api/internal/platform/v2',include_in_schema=False)
SECRET_FILE=Path('/app/.notepreso-platform-v2.json')
class Body(BaseModel):
 model_config=ConfigDict(extra='forbid',strict=True)
 issuer:str=Field(min_length=10,max_length=300)
 subject:str=Field(min_length=1,max_length=255)
 operationId:str|None=None
 model:str|None=None
 maxSlides:int|None=None
 sourceHash:str|None=None
 actualSlides:int|None=None
 expectedPlan:str|None=None
 maxCredits:int|None=None
 filename:str|None=Field(default=None,max_length=120)
 base64:str|None=Field(default=None,max_length=14000000)
 compactPdfSpacing:bool=False
async def authorize(request):
 if request.headers.get('origin'):raise HTTPException(403,'SERVICE_AUTH_REQUIRED')
 raw=bytearray()
 async for part in request.stream():
  raw.extend(part)
  if len(raw)>(14*1024*1024 if request.url.path.endswith('/document')else 16384):raise HTTPException(413,'REQUEST_TOO_LARGE')
 try:
  config=json.loads(SECRET_FILE.read_text());key=config['secret'];assert re.fullmatch('[a-f0-9]{64}',key)
  ts=request.headers.get('x-notepreso-time','');assert re.fullmatch('[0-9]{10}',ts)and abs(int(ts)-int(time.time()))<=30
  digest=hashlib.sha256(raw).hexdigest();message='POST\n'+request.url.path+'\n'+ts+'\n'+digest
  expected=hmac.new(bytes.fromhex(key),message.encode(),hashlib.sha256).hexdigest()
  supplied=request.headers.get('x-notepreso-signature','');assert len(supplied)==64 and hmac.compare_digest(supplied,expected)
 except Exception:raise HTTPException(403,'SERVICE_AUTH_REQUIRED')from None
 try:body=Body.model_validate_json(raw)
 except Exception:raise HTTPException(400,'INVALID_PLATFORM_REQUEST')from None
 if body.issuer!=request.app.state.settings.keycloak_issuer:raise HTTPException(403,'ISSUER_MISMATCH')
 try:assert str(UUID(body.subject))==body.subject
 except Exception:raise HTTPException(400,'INVALID_SUBJECT')from None
 # Membership is resolved from an already registered Keycloak subject, never email.
 from app.core.database import UserRow
 with request.app.state.db.session()as s:
  if not s.get(UserRow,body.subject):raise HTTPException(409,'NOTEPRESO_ACCOUNT_REQUIRED')
 return body
@router.post('/{action}')
async def platform(action:str,request:Request):
 b=await authorize(request);state=request.app.state;ent=state.entitlements
 service=PlatformWallet(state.db,weekly_limit=state.settings.free_weekly_presentations,free_slides=state.settings.free_preview_slide_limit)
 try:
  if action=='document':
   import base64
   from app.services.document_extract import extract_document,DocumentError
   try:
    return extract_document(
     b.filename or '', base64.b64decode(b.base64 or '', validate=True),
     compact_pdf_spacing=b.compactPdfSpacing,
    )
   except DocumentError as e:raise HTTPException(422,str(e))from None
   except Exception:raise HTTPException(422,'INVALID_DOCUMENT')from None
  if action=='account':
   value=ent.account_snapshot(b.subject);value['credits']=ent.credit_snapshot(b.subject)
   from fastapi.encoders import jsonable_encoder
   return jsonable_encoder({'account':value,'models':[{'id':'gpt-6-luna','creditsPerSlide':1},{'id':'gpt-6.1-terra','creditsPerSlide':3}]})
  if action=='reserve':
   snapshot=ent.account_snapshot(b.subject)
   if snapshot['plan']=='pro':ent.ensure_pro_credit_cycle(b.subject)
   if b.expectedPlan not in {"free","pro"}or b.maxCredits is None:raise HTTPException(400,"CREDIT_QUOTE_REQUIRED")
   return service.reserve(b.subject,b.operationId,b.model,b.maxSlides,b.sourceHash,expected_plan=b.expectedPlan,max_credits=b.maxCredits)
  if action=='settle':return service.finish(b.subject,b.operationId,actual_slides=b.actualSlides)
  if action=='refund':return service.finish(b.subject,b.operationId,refund=True)
  raise HTTPException(404,'PLATFORM_ACTION_NOT_FOUND')
 except PlatformBillingError as e:raise HTTPException(402 if e.code in {'INSUFFICIENT_CREDITS','FREE_WEEKLY_LIMIT','FREE_SLIDE_LIMIT','TERRA_REQUIRES_PRO'}else 409,e.code)from None
