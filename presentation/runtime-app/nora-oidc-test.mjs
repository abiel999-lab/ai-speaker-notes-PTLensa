import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '/app/server-dist/server/app.js';
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'nora-qa',alg:'RS256',use:'sig'};
let issuer,grant,exchanges=0;
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const server=http.createServer(async(req,res)=>{
 const json=x=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(x));};
 if(req.url==='/.well-known/openid-configuration')return json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post','client_secret_basic'],code_challenge_methods_supported:['S256']});
 if(req.url==='/jwks')return json({keys:[jwk]});
 if(req.url==='/token'){
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=new URLSearchParams(raw);assert.equal(body.get('grant_type'),'authorization_code');assert.equal(body.get('code'),'fixture-code');assert.equal(crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url'),grant.get('code_challenge'));
  const now=Math.floor(Date.now()/1000);const data=b64({alg:'RS256',kid:'nora-qa',typ:'JWT'})+'.'+b64({iss:issuer,aud:'nora-staging',sub:'fixture-user',iat:now,exp:now+300,nonce:grant.get('nonce'),name:'Nora QA',email:'qa@example.invalid',email_verified:true});
  exchanges++;return json({access_token:'fixture-access-token',token_type:'Bearer',expires_in:300,id_token:data+'.'+crypto.sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')});
 }
 res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));issuer='http://127.0.0.1:'+server.address().port;
const root=await fs.mkdtemp(path.join(os.tmpdir(),'nora-oidc-'));
const {app}=await createApp({root,production:false,origin:'http://127.0.0.1:14310',host:'127.0.0.1',port:14310,render:false,key:'fixture-only',model:'gpt-6-luna',localAdmin:false,oidc:{issuer,clientId:'nora-staging',clientSecret:'fixture-secret-only',allowLocalIssuer:true,sessionSeconds:600}});
const inject=opts=>app.inject({headers:{host:'127.0.0.1:14310',...opts.headers},...opts});
try{
 const initial=await inject({url:'/api/session'});assert.equal(initial.json().user,null);
 const login=await inject({url:'/api/auth/login'});assert.equal(login.statusCode,302);grant=new URL(login.headers.location).searchParams;assert.equal(grant.get('code_challenge_method'),'S256');assert.equal(grant.get('ui_locales'),'en');
 const flow=login.headers['set-cookie'].split(';')[0];
 const callback=await inject({url:'/api/auth/callback?code=fixture-code&state='+grant.get('state'),headers:{host:'127.0.0.1:14310',cookie:flow}});
 assert.equal(callback.statusCode,302,callback.body);assert.equal(callback.headers.location,'/app');assert.equal(exchanges,1);
 const cookies=callback.headers['set-cookie'];const session=cookies.find(x=>x.startsWith('vb_oidc_session=')).split(';')[0];
 const me=await inject({url:'/api/session',headers:{host:'127.0.0.1:14310',cookie:session}});assert.ok(me.json().user);
 const replay=await inject({url:'/api/auth/callback?code=fixture-code&state='+grant.get('state'),headers:{host:'127.0.0.1:14310',cookie:flow}});assert.equal(replay.statusCode,400);assert.equal(exchanges,1);
 const logout=await inject({method:'POST',url:'/api/auth/logout',headers:{host:'127.0.0.1:14310',cookie:session,origin:'http://127.0.0.1:14310','x-csrf-token':me.json().csrfToken}});assert.equal(logout.statusCode,200,logout.body);
 const after=await inject({url:'/api/session',headers:{host:'127.0.0.1:14310',cookie:session}});assert.equal(after.json().user,null);
 console.log(JSON.stringify({status:'passed',signedOidcRoundtrip:true,pkce:true,nonce:true,flowReplayRejected:true,sessionLogout:true,provider:'loopback fixture; not live Keycloak'}));
}finally{await app.close();await new Promise(r=>server.close(r));}
