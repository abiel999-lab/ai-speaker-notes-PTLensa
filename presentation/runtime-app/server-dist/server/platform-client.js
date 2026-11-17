/** Service-to-service only. Canonical identity comes from a verified OIDC callback. */
import fs from'node:fs';import{createHash,createHmac}from'node:crypto';
const FILE='/app/.notepreso-platform-v2.json';
export const CUSTOMER_MODELS=Object.freeze({'gpt-6-luna':1,'gpt-6.1-terra':3});
export function customerModel(model){const m=model??'gpt-6-luna';if(!Object.hasOwn(CUSTOMER_MODELS,m))throw Error('MODEL_NOT_ALLOWED');return m;}
export function platformIdentity(user,cfg){
 const issuer=user?.platformIdentity?.issuer,subject=user?.platformIdentity?.subject;
 if(!cfg.oidc||issuer!==cfg.oidc.issuer||typeof subject!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(subject))throw Error('SIGN_IN_REFRESH_REQUIRED');
 // Verify the public account ID still matches the immutable issuer/sub binding.
 const expected='oidc-'+createHash('sha256').update(issuer+'\0'+subject).digest('hex');if(user.id!==expected)throw Error('IDENTITY_MISMATCH');
 return{issuer,subject};
}
export function signature(secret,path,body,time){const digest=createHash('sha256').update(body).digest('hex');return createHmac('sha256',Buffer.from(secret,'hex')).update('POST\n'+path+'\n'+time+'\n'+digest).digest('hex');}
export async function platformCall(identity,action,payload={},options={}){
 if(!['account','reserve','settle','refund','document'].includes(action))throw Error('INVALID_PLATFORM_ACTION');
 const settings=options.settings??JSON.parse(fs.readFileSync(FILE,'utf8'));
 if(!/^[a-f0-9]{64}$/.test(settings.secret)||settings.url!=='http://notepreso-platform-notes:8000')throw Error('PLATFORM_CONFIG_INVALID');
 const path='/api/internal/platform/v2/'+action,body=JSON.stringify({...payload,...identity}),time=String(Math.floor(Date.now()/1000));
 const response=await(options.fetcher??fetch)(settings.url+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-NotePreso-Time':time,'X-NotePreso-Signature':signature(settings.secret,path,body,time)},body});
 if(!response.ok){let code;try{const value=await response.json();code=value.detail;}catch{}const allowed=['PLAN_CHANGED','QUOTE_CREDIT_LIMIT','INSUFFICIENT_CREDITS','FREE_WEEKLY_LIMIT','FREE_SLIDE_LIMIT','TERRA_REQUIRES_PRO','NOTEPRESO_ACCOUNT_REQUIRED','BILLING_OPERATION_CLOSED','BILLING_IDEMPOTENCY_CONFLICT','BILLING_OPERATION_NOT_FOUND','DOCUMENT_SIZE_LIMIT','DOCUMENT_TYPE','INVALID_PDF','INVALID_DOCX','PDF_PASSWORD_REQUIRED','DOCUMENT_HAS_NO_SELECTABLE_TEXT','DOCUMENT_PAGE_LIMIT','DOCUMENT_TEXT_LIMIT','DOCUMENT_ARCHIVE_LIMIT','DOCUMENT_MACROS_NOT_ALLOWED','DOCUMENT_ENCODING'];throw Error(allowed.includes(code)?code:'PLATFORM_UNAVAILABLE');}
 return response.json();
}
