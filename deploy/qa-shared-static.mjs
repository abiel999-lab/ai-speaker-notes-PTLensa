import fs from 'node:fs/promises';import staticFiles from '@fastify/static';
import assert from 'node:assert/strict';import Fastify from 'fastify';import {createHmac,createHash} from 'node:crypto';import {registerSharedSignin,verifySharedTicket} from './shared-signin.js';
const secret='ab'.repeat(32),issuer='https://login.notepreso.com/realms/aispeaker',origin='https://presentation.notepreso.com',sub='00000000-0000-4000-8000-000000000002',state='s'.repeat(43);
const sign=p=>{const d=Buffer.from(JSON.stringify(p)).toString('base64url');return d+'.'+createHmac('sha256',Buffer.from(secret,'hex')).update('presentation-login-v1.'+d).digest('hex')};
const p={purpose:'presentation-login-v1',sub,iss:issuer,aud:origin,state,exp:Date.now()/1000+60,jti:'j'.repeat(43),name:'Canonical Notes User'};
assert.equal(verifySharedTicket(sign(p),{secret,issuer,origin,state}).sub,sub);
for(const bad of [{aud:'https://evil.example'},{iss:'https://evil.example'},{state:'wrong'},{exp:0},{purpose:'translation-login-v1'},{sub:'not-a-user'}])assert.throws(()=>verifySharedTicket(sign({...p,...bad}),{secret,issuer,origin,state}));
assert.throws(()=>verifySharedTicket(sign(p).slice(0,-1)+'z',{secret,issuer,origin,state}));
const flows=new Map(),sessions=new Map();const repo={saveLoginFlow:async(k,v)=>flows.set(k,v),consumeLoginFlow:async k=>{const v=flows.get(k);flows.delete(k);return v},oidcUser:async(iss,id,email,name)=>({id:'oidc-'+createHash('sha256').update(iss+'\0'+id).digest('hex'),displayName:name}),createAuthSession:async(k,id)=>sessions.set(k,id)};
const app=Fastify();const begin=registerSharedSignin(app,repo,{production:true,origin,oidc:{issuer},platform:{secret}});app.get('/api/auth/login',begin);const root=await fs.mkdtemp('/tmp/shared-static-');await fs.writeFile(root+'/index.html','<!doctype html><title>Workspace QA</title>');await app.register(staticFiles,{root,prefix:'/'});app.setNotFoundHandler((req,reply)=>reply.sendFile('index.html'));if(process.env.QA_EXPLICIT!=='0')app.get('/app',async(req,reply)=>reply.sendFile('index.html'));
const first=await app.inject({url:'/api/auth/login'});assert.ok(first.headers.location.startsWith('https://notepreso.com/auth/presentation/connect?state='));const st=new URL(first.headers.location).searchParams.get('state'),flow=first.cookies.find(c=>c.name==='__Host-np_pres_shared');const ticket=sign({...p,state:st});
const req={method:'POST',url:'/api/auth/shared/complete',headers:{origin,cookie:flow.name+'='+flow.value},payload:{ticket}};
let response=await app.inject({...req,headers:{...req.headers,origin:'https://evil.example'}});assert.equal(response.statusCode,403);
response=await app.inject(req);assert.equal(response.statusCode,200,response.body);assert.equal(sessions.size,1);const cs=response.cookies.filter(c=>c.value).map(c=>c.name+'='+c.value).join('; ');
const allowed=await app.inject({url:'/app',headers:{cookie:cs}});assert.equal(allowed.statusCode,200);assert.equal((await app.inject({url:'/app',headers:{cookie:cs}})).statusCode,302,'Entry proof is single-use; F5 rechecks Notes');assert.equal((await app.inject(req)).statusCode,400,'Replay rejected');
assert.ok([...sessions.values()][0].includes('oidc-'));await app.close();console.log('PASS signed identity, audience/issuer/state/expiry/purpose/tamper rejection, origin, replay and one-time entry revalidation');

