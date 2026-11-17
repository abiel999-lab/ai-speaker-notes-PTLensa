"""Shared credit transactions. Additive receipt table; existing wallets and ledger remain authoritative.
No HTTP identity, client-supplied rate, payment grant, user-data cleanup or balance migration.
"""
from datetime import UTC,datetime
from uuid import UUID
from sqlalchemy import String,Integer,DateTime,select,update
from sqlalchemy.orm import Mapped,mapped_column
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.core.database import (Base,DatabaseManager,UserRow,SubscriptionRow,ManualAccessGrantRow,CreditWalletRow,CreditLedgerRow,FreeWeeklyUsageRow,FreePresentationReservationRow)
from app.core.free_quota import week_bounds
RATES={'gpt-6-luna':1,'gpt-6.1-terra':3}
class PlatformBillingError(ValueError):
 def __init__(self,code):self.code=code;super().__init__(code)
class PlatformReceipt(Base):
 __tablename__='platform_generation_receipts'
 id:Mapped[str]=mapped_column(String(64),primary_key=True)
 owner:Mapped[str]=mapped_column(String(255),nullable=False,index=True)
 service:Mapped[str]=mapped_column(String(32),nullable=False)
 model:Mapped[str]=mapped_column(String(64),nullable=False)
 source_hash:Mapped[str]=mapped_column(String(64),nullable=False)
 max_slides:Mapped[int]=mapped_column(Integer,nullable=False)
 actual_slides:Mapped[int|None]=mapped_column(Integer,nullable=True)
 rate:Mapped[int]=mapped_column(Integer,nullable=False)
 monthly_used:Mapped[int]=mapped_column(Integer,nullable=False,default=0)
 topup_used:Mapped[int]=mapped_column(Integer,nullable=False,default=0)
 plan:Mapped[str]=mapped_column(String(16),nullable=False)
 state:Mapped[str]=mapped_column(String(16),nullable=False)
 period_start:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
 period_end:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
 created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),nullable=False)
 updated_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),nullable=False)
def aware(v):return v.replace(tzinfo=UTC)if v is not None and v.tzinfo is None else v
def active_plan(session,owner,now):
 sub=session.get(SubscriptionRow,owner)
 if sub and sub.plan=='pro'and sub.status in {'active','trialing','past_due'}and(sub.current_period_end is None or aware(sub.current_period_end)>now):return 'pro'
 grant=session.get(ManualAccessGrantRow,owner)
 if grant and not grant.revoked_at and aware(grant.starts_at)<=now<aware(grant.ends_at):return 'pro'
 return 'free'
def public(r):return {'operationId':r.id,'state':r.state,'plan':r.plan,'model':r.model,'rate':r.rate,'maxSlides':r.max_slides,'actualSlides':r.actual_slides,'reservedCredits':r.monthly_used+r.topup_used,'chargedCredits':(r.actual_slides*r.rate if r.plan=='pro'and r.state=='committed'else 0)}
class PlatformWallet:
 def __init__(self,db,*,weekly_limit=5,free_slides=5):self.db=db;self.weekly_limit=weekly_limit;self.free_slides=free_slides
 def ledger(self,s,r,event,monthly,topup,w,now):
  s.add(CreditLedgerRow(owner=r.owner,monthly_delta=monthly,topup_delta=topup,monthly_balance_after=w.monthly_credits,topup_balance_after=w.topup_credits,event_type='platform_'+event,idempotency_key='platform:'+r.id+':'+event,job_id=r.id,payment_reference=None,period_start=r.period_start,period_end=r.period_end,metadata_json={'service':r.service,'model':r.model,'rate':r.rate,'max_slides':r.max_slides,'actual_slides':r.actual_slides,'source_hash':r.source_hash},created_at=now))
 def reserve(self,owner,operation_id,model,max_slides,source_hash,*,now=None,expected_plan=None,max_credits=None):
  import re
  try:valid=str(UUID(operation_id))==operation_id
  except (ValueError,TypeError):valid=False
  if not valid or model not in RATES or type(max_slides)is not int or not 1<=max_slides<=80 or not re.fullmatch('[a-f0-9]{64}',source_hash or ''):raise PlatformBillingError('INVALID_BILLING_REQUEST')
  now=now or datetime.now(UTC)
  with self.db.session()as s:
   # Existing user only: no duplicate signup credits and no email-based account matching.
   if not s.get(UserRow,owner):raise PlatformBillingError('NOTEPRESO_ACCOUNT_REQUIRED')
   self.db._lock_credit_owner(s,owner)
   old=s.get(PlatformReceipt,operation_id)
   if old:
    if (old.owner,old.service,old.model,old.max_slides,old.source_hash)!=(owner,'presentation',model,max_slides,source_hash):raise PlatformBillingError('BILLING_IDEMPOTENCY_CONFLICT')
    if old.state=='refunded':raise PlatformBillingError('BILLING_OPERATION_CLOSED')
    return public(old)
   plan=active_plan(s,owner,now)
   if expected_plan is not None and plan!=expected_plan:raise PlatformBillingError('PLAN_CHANGED')
   if max_credits is not None and(type(max_credits)is not int or max_credits<0 or(plan=='pro'and max_slides*RATES[model]>max_credits)):raise PlatformBillingError('QUOTE_CREDIT_LIMIT')
   r=PlatformReceipt(id=operation_id,owner=owner,service='presentation',model=model,source_hash=source_hash,max_slides=max_slides,actual_slides=None,rate=RATES[model],monthly_used=0,topup_used=0,plan=plan,state='reserved',created_at=now,updated_at=now)
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
 def finish(self,owner,operation_id,*,actual_slides=None,refund=False,now=None):
  try:valid=str(UUID(operation_id))==operation_id
  except (ValueError,TypeError):valid=False
  if not valid:raise PlatformBillingError('INVALID_BILLING_REQUEST')
  now=now or datetime.now(UTC)
  with self.db.session()as s:
   r=s.get(PlatformReceipt,operation_id)
   if not r or r.owner!=owner:raise PlatformBillingError('BILLING_OPERATION_NOT_FOUND')
   self.db._lock_credit_owner(s,owner);s.refresh(r)
   if not r or r.owner!=owner:raise PlatformBillingError('BILLING_OPERATION_NOT_FOUND')
   target='refunded'if refund else'committed'
   if r.state!='reserved':
    if r.state!=target or(not refund and r.actual_slides!=actual_slides):raise PlatformBillingError('BILLING_OPERATION_CLOSED')
    return public(r)
   if not refund and(type(actual_slides)is not int or not 1<=actual_slides<=r.max_slides):raise PlatformBillingError('BILLING_SLIDE_COUNT_EXCEEDED')
   r.actual_slides=0 if refund else actual_slides
   if r.plan=='pro':
    w=self.db._ensure_credit_wallet_locked(s,owner=owner,now=now);unused=(r.max_slides-r.actual_slides)*r.rate
    topup=min(unused,r.topup_used);monthly=unused-topup
    # Unused allowance is restored only to its original, still-active period.
    same=aware(w.period_start)==aware(r.period_start)and aware(w.period_end)==aware(r.period_end)and(r.period_end is None or aware(r.period_end)>now)
    if not same:monthly=0
    w.monthly_credits+=monthly;w.topup_credits+=topup;w.updated_at=now;self.ledger(s,r,'refund'if refund else'settle',monthly,topup,w,now)
   elif refund:
    # Keep the reservation record. Receipt state makes the quota refund exactly once.
    s.execute(update(FreeWeeklyUsageRow).where(FreeWeeklyUsageRow.owner==owner,FreeWeeklyUsageRow.period_start==r.period_start,FreeWeeklyUsageRow.presentation_jobs>0).values(presentation_jobs=FreeWeeklyUsageRow.presentation_jobs-1))
   r.state=target;r.updated_at=now;s.commit();return public(r)
