import fs from 'node:fs';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex'),random=()=>randomBytes(32).toString('base64url');
const SESSION='vb_oidc_session',FLOW='__Host-np_pres_shared',ENTRY='__Host-np_pres_entry';
function cookie(req,name){const xs=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));if(xs.length!==1)return '';const value=xs[0].slice(name.length+1);return /^[\w-]{43}$/.test(value)?value:'';}
const set=(name,value,seconds)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
export function verifySharedTicket(ticket,{secret,issuer,origin,state,now=Date.now()/1000}){
 if(typeof ticket!=='string'||ticket.length>8192)throw Error('INVALID_TICKET');
 const [data,mac,...extra]=ticket.split('.');if(extra.length||!/^[A-Za-z0-9_-]+$/.test(data||'')||!/^([a-f0-9]{64})$/.test(mac||''))throw Error('INVALID_TICKET');
 const expected=createHmac('sha256',Buffer.from(secret,'hex')).update('presentation-login-v1.'+data).digest();if(!timingSafeEqual(expected,Buffer.from(mac,'hex')))throw Error('INVALID_TICKET');
 const p=JSON.parse(Buffer.from(data,'base64url').toString());
 if(p.purpose!=='presentation-login-v1'||p.iss!==issuer||p.aud!==origin||p.state!==state||typeof p.exp!=='number'||p.exp<=now||p.exp>now+65||!/^[A-Za-z0-9_-]{43}$/.test(p.jti||'')||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(p.sub||''))throw Error('INVALID_TICKET');
 return p;
}
export function registerSharedSignin(app,repo,cfg){
 const settings=()=>cfg.platform??JSON.parse(fs.readFileSync('/app/.notepreso-platform-v2.json','utf8'));
 const begin=async(req,reply)=>{const browser=random(),state=random();const returnTo=['/app/how-to','/app?tool=journal','/app?new=1','/app?new=1&author=1'].includes(new URL(req.url,cfg.origin).searchParams.get('returnTo'))?new URL(req.url,cfg.origin).searchParams.get('returnTo'):'/app';await repo.saveLoginFlow(hash(browser),{kind:'notes-shared',state,returnTo},Date.now()+600000);return reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').header('Set-Cookie',set(FLOW,browser,600)).redirect('https://notepreso.com/auth/presentation/connect?state='+encodeURIComponent(state));};
 app.addHook('preHandler',async(req,reply)=>{
  const path=req.url.split('?')[0];if(req.method!=='GET'||!(path==='/app'||path.startsWith('/app/')||path==='/'&&cookie(req,SESSION)))return;
  const marker=cookie(req,ENTRY);if(marker){const proof=await repo.consumeLoginFlow(hash(marker));reply.header('Set-Cookie',set(ENTRY,'',0));if(proof?.kind==='shared-entry'&&proof.session===hash(cookie(req,SESSION)))return;}
  return begin(req,reply);
 });
 app.get('/api/auth/shared/callback',async(req,reply)=>reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').type('text/html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Signing in | NotePreso</title></head><body><p id="shared-status">Synchronizing your NotePreso account…</p><script src="/api/auth/shared/client.js" defer></script></body></html>'));
 app.get('/api/auth/shared/client.js',async(req,reply)=>reply.header('Cache-Control','no-store').type('application/javascript').send(`(async()=>{const ticket=new URLSearchParams(location.hash.slice(1)).get('ticket');history.replaceState(null,'',location.pathname);try{const r=await fetch('/api/auth/shared/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})});if(!r.ok)throw Error();const d=await r.json();location.replace(d.returnTo);}catch{document.getElementById('shared-status').textContent='Sign-in could not be confirmed. Please start again from NotePreso.';const a=document.createElement('a');a.href='/api/auth/login';a.textContent='Start sign-in again';document.body.append(a);}})();`));
 app.post('/api/auth/shared/complete',async(req,reply)=>{
  reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer');
  if(req.headers.origin!==cfg.origin)return reply.code(403).send({error:'ORIGIN_REJECTED'});
  const browser=cookie(req,FLOW);if(!browser)return reply.code(400).send({error:'SIGN_IN_FAILED'});
  const flow=await repo.consumeLoginFlow(hash(browser));if(flow?.kind!=='notes-shared')return reply.code(400).send({error:'SIGN_IN_FAILED'});
  try{
   const p=verifySharedTicket(req.body?.ticket,{secret:settings().secret,issuer:cfg.oidc.issuer,origin:cfg.origin,state:flow.state});
   const email=typeof p.email==='string'&&p.email.length<=254?p.email:undefined,name=typeof p.name==='string'?p.name.slice(0,160):undefined;
   const user=await repo.oidcUser(p.iss,p.sub,email,name),token=random(),marker=random(),seconds=cfg.oidc.sessionSeconds??2592000;
   await repo.createAuthSession(hash(token),user.id,Date.now()+seconds*1000);await repo.saveLoginFlow(hash(marker),{kind:'shared-entry',session:hash(token)},Date.now()+60000);
   return reply.header('Set-Cookie',[set(FLOW,'',0),set(SESSION,token,seconds),set(ENTRY,marker,60)]).send({returnTo:flow.returnTo});
  }catch{return reply.code(400).send({error:'SIGN_IN_FAILED'});}
 });
 return begin;
}
