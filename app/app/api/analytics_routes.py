"""Read verified Paddle events, without changing payment handling or entitlements.

Delivery claims are independent from billing and authorize one browser attempt
per transaction and destination. They do not assert delivery by either vendor.
"""
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
import json
import re
import uuid
from urllib.parse import unquote

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import String, DateTime, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base, PaymentEventRow, PaymentCheckoutRow
from app.api.routes import _reject_cross_site_browser_request, _require_api_access

router=APIRouter(prefix='/api/v1/analytics',tags=['analytics'])
NAMESPACE=uuid.UUID('d17dc5f4-d129-491b-a87a-acd1ecb613ed')
class AnalyticsDeliveryRow(Base):
    __tablename__='analytics_delivery_attempts'
    id: Mapped[str]=mapped_column(String(80),primary_key=True)
    claimed_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),nullable=False)

class Claim(BaseModel):
    reference_id: str=Field(min_length=1,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')

def consent_channels(raw,now=None):
    try:
        c=json.loads(unquote(raw)); now=now or datetime.now(UTC)
        age=now.timestamp()*1000-c['at']
        if c['v']!=1 or isinstance(c['at'],bool) or not 0<=age<=180*86400000:return []
        return [channel for channel,key in [('ga4','analytics'),('meta','marketing')] if c.get(key) is True]
    except (ValueError,TypeError,KeyError):return []

def verified_purchase(payload,live):
    if not live or payload.get('event_type')!='transaction.completed' or payload.get('_notepreso_status_applied') is not True:return None
    d=payload.get('data') or {}
    if d.get('status')!='completed' or not re.fullmatch(r'txn_[A-Za-z0-9]+',str(d.get('id',''))):return None
    if not re.fullmatch(r'sub_[A-Za-z0-9]+',str(d.get('subscription_id',''))):return None
    currency=d.get('currency_code'); exponents={'USD':2,'EUR':2,'GBP':2,'AUD':2,'CAD':2,'CHF':2,'CNY':2,'INR':2,'IDR':2,'SGD':2,'JPY':0,'KRW':0,'VND':0}
    if currency not in exponents:return None
    try:
        raw=d['details']['totals']['total']
        if not isinstance(raw,str) or not re.fullmatch(r'\d{1,15}',raw):return None
        value=Decimal(raw)/(10**exponents[currency])
        if value<=0:return None
    except (KeyError,TypeError,InvalidOperation):return None
    return {'event_id':str(uuid.uuid5(NAMESPACE,d['id'])),'value':float(value),'currency':currency}

@router.post('/purchase-claim')
def purchase_claim(request:Request,payload:Claim):
    _reject_cross_site_browser_request(request)
    identity=_require_api_access(request,mutate=True)
    channels=consent_channels(request.cookies.get('np_tracking_v1',''))
    if not channels:return {'receipt':None}
    settings=request.app.state.settings
    if str(settings.paddle_environment).strip().lower() not in {'live','production'}:return {'receipt':None}
    db=request.app.state.db
    if db is None:raise HTTPException(503,'Analytics receipt unavailable')
    with db.session() as session:
        checkout=session.get(PaymentCheckoutRow,payload.reference_id)
        if checkout is None or checkout.owner!=identity.owner_key or checkout.provider!='paddle':return {'receipt':None}
        events=session.scalars(select(PaymentEventRow).where(
            PaymentEventRow.reference_id==payload.reference_id,PaymentEventRow.provider=='paddle',
            PaymentEventRow.event_type=='transaction.completed',
            PaymentEventRow.processed_at>=datetime.now(UTC)-timedelta(hours=24)
        ).order_by(PaymentEventRow.processed_at.desc()).limit(5)).all()
        receipt=next((r for e in events if (r:=verified_purchase(e.payload,True))),None)
    if receipt is None:return {'receipt':None}
    claimed=[]
    for channel in channels:
        with db.session() as session:
            session.add(AnalyticsDeliveryRow(id=receipt['event_id']+':'+channel,claimed_at=datetime.now(UTC)))
            try:session.commit();claimed.append(channel)
            except IntegrityError:session.rollback()
    return {'receipt':{**receipt,'channels':claimed} if claimed else None}
