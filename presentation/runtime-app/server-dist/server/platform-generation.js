import{composeTechnicalDocument}from'../core/document-composition.js';
import{withVisualCover}from'../core/visual-cover.js';
import {buildFullCopyScene,parseFullCopySource} from '../core/full-copy.js';
/** Immutable price quotes and durable job-level billing; service secrets never enter job JSON. */
import {loadDocumentPlan} from './document-plan.js';
import fs from'node:fs';import{createHmac,timingSafeEqual,createHash}from'node:crypto';
import{platformIdentity,platformCall,customerModel,CUSTOMER_MODELS}from'./platform-client.js';
import{parseSource}from'../core/source.js';import{creativeAtoms}from'../core/creative.js';import{buildCreativeRescueScene}from'../core/creative-fallback.js';import{rulesPlan}from'../core/planner.js';import{buildScene}from'../core/layout.js';
const SECRET='/app/.notepreso-platform-v2.json';
export const usesPlatform=cfg=>!!cfg.production||!!cfg.platform;
const config=cfg=>cfg.platform??JSON.parse(fs.readFileSync(SECRET,'utf8'));
export function safeBillingScene(source,settings){
 try {
  const doc=parseSource(source,settings.mode);
  if(settings.creationMode!=='creative')return buildScene(doc,rulesPlan(doc,settings.images),settings.theme,settings);
  if(!settings.creativeSlideCount&&!settings.assetId&&doc.blocks.some(b=>b.equation))return withVisualCover(doc,composeTechnicalDocument(doc,settings.theme,settings.creativeAssets));
  return withVisualCover(doc,buildCreativeRescueScene(doc,creativeAtoms(doc),settings.theme,{assets:settings.creativeAssets,slideCount:settings.creativeSlideCount,interactiveLinks:settings.interactiveLinks,motion:settings.motion==='keynote'}).scene,settings.creativeSlideCount);
 } catch (error) {
  const scene=buildFullCopyScene(parseFullCopySource(source),[],{...settings,fontScale:0.85,density:'compact'});
  return {...scene,quoteRecovery:true};
 }
}
function settingsHash(settings){return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(settings).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');}
export async function createQuote(project,settings,user,cfg){
 const identity=platformIdentity(user,cfg),model=customerModel(settings.model),documentPlan=await loadDocumentPlan(project,cfg.root,settings),maxSlides=documentPlan?(documentPlan.slideCount??documentPlan.slides.length):safeBillingScene(project.source,settings).slides.length;
 const account=(await platformCall(identity,'account',{}, {settings:config(cfg)})).account;
 if(account.plan!=='pro'&&model!=='gpt-6-luna')throw Error('TERRA_REQUIRES_PRO');
 if(account.plan!=='pro'&&maxSlides>Number(account.limits?.preview_slides||5))throw Error('FREE_SLIDE_LIMIT');
 const maxCredits=account.plan==='pro'?maxSlides*CUSTOMER_MODELS[model]:0;
 if(account.plan==='pro'&&Number(account.credits?.total||0)<maxCredits)throw Error('INSUFFICIENT_CREDITS');
 if(account.plan!=='pro'&&Number(account.remaining?.presentations||0)<1)throw Error('FREE_WEEKLY_LIMIT');
 const quote={owner:user.id,project:project.id,sourceHash:project.sourceHash,settingsHash:settingsHash(settings),model,maxSlides,rate:CUSTOMER_MODELS[model],maxCredits,plan:account.plan,expires:Date.now()+300000};
 const data=Buffer.from(JSON.stringify(quote)).toString('base64url'),mac=createHmac('sha256',Buffer.from(config(cfg).secret,'hex')).update(data).digest('hex');
 return{token:data+'.'+mac,maxSlides,maxCredits,rate:quote.rate,model,plan:account.plan,balance:Number(account.credits?.total||0),expires:quote.expires};
}
export function acceptQuote(token,project,settings,user,cfg){
 if(typeof token!=='string'||token.length>5000)throw Error('CREDIT_QUOTE_REQUIRED');const [data,mac,...extra]=token.split('.');if(extra.length||!mac||!/^[a-f0-9]{64}$/.test(mac))throw Error('CREDIT_QUOTE_INVALID');
 const expected=createHmac('sha256',Buffer.from(config(cfg).secret,'hex')).update(data).digest();if(!timingSafeEqual(expected,Buffer.from(mac,'hex')))throw Error('CREDIT_QUOTE_INVALID');
 let q;try{q=JSON.parse(Buffer.from(data,'base64url').toString());}catch{throw Error('CREDIT_QUOTE_INVALID');}
 if(q.expires<Date.now()||q.owner!==user.id||q.project!==project.id||q.sourceHash!==project.sourceHash||q.settingsHash!==settingsHash(settings)||q.model!==customerModel(settings.model))throw Error('CREDIT_QUOTE_EXPIRED');
 return{identity:platformIdentity(user,cfg),model:q.model,maxSlides:q.maxSlides,maxCredits:q.maxCredits,plan:q.plan,sourceHash:q.sourceHash,phase:'accepted'};
}
export async function reserveJobBilling(repo,cfg,job){
 if(!job.billing)return job;await repo.enqueueBillingRefund(job);const b=job.billing;
 const receipt=await platformCall(b.identity,'reserve',{operationId:job.id,model:b.model,maxSlides:b.maxSlides,sourceHash:b.sourceHash,expectedPlan:b.plan,maxCredits:b.maxCredits},{settings:config(cfg)});
 return{...job,billing:{...b,phase:receipt.state==='committed'?'settling':'reserved',receipt}};
}
export async function settleJobBilling(repo,cfg,job){
 if(!job.billing)return job;
 const receipt=await platformCall(job.billing.identity,'settle',{operationId:job.id,actualSlides:job.scene.slides.length},{settings:config(cfg)});
 return{...job,billing:{...job.billing,phase:'committed',receipt}};
}
export async function refundJobBilling(repo,cfg,job){
 if(!job.billing)return;
 try{await platformCall(job.billing.identity,'refund',{operationId:job.id},{settings:config(cfg)});}catch(e){if(e.message!=='BILLING_OPERATION_NOT_FOUND')throw e;}
 await repo.completeBillingRefund(job.id);
}
export async function reconcileBilling(repo,cfg){
 if(!usesPlatform(cfg))return;
 for(const pending of await repo.pendingBillingRefunds()){
  const job=await repo.job(pending.id);if(!job)continue;
  if(job.status==='ready'){await repo.completeBillingRefund(job.id);continue;}
  if(['failed','cancelled'].includes(job.status))try{await refundJobBilling(repo,cfg,job);}catch{console.error(JSON.stringify({event:'platform_refund_pending',code:'PLATFORM_UNAVAILABLE'}));}
 }
}
export async function accountFor(user,cfg){return platformCall(platformIdentity(user,cfg),'account',{}, {settings:config(cfg)});}
