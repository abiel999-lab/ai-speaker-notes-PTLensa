const PRICING='https://notepreso.com/pricing';
const number=v=>Number.isSafeInteger(v)&&v>=0?v:null;
export function accountView(account){
 if(!account||!['free','pro'].includes(account.plan))throw Error('ACCOUNT_FORMAT');
 const c=account.credits||{},total=number(c.total),monthly=number(c.monthly),topup=number(c.topup);
 if(account.plan==='pro'&&(total===null||monthly===null||topup===null))throw Error('ACCOUNT_FORMAT');
 const remaining=number(account.remaining?.presentations);
 return {plan:account.plan==='pro'?'Pro':'Free',balance:total===null?'Not available':total.toLocaleString('en-US'),detail:account.plan==='pro'?`Monthly ${monthly.toLocaleString('en-US')} · Top-up ${topup.toLocaleString('en-US')}`:remaining===null?'Weekly allowance unavailable':`${remaining} presentations remaining this week`,pricing:PRICING};
}
export function startAccountBar(){
 if(document.getElementById('np-shared-account'))return;
 const bar=document.createElement('section');bar.id='np-shared-account';bar.className='np-shared-account';bar.setAttribute('aria-label','Shared NotePreso account');
 const summary=document.createElement('div'),plan=document.createElement('strong'),balance=document.createElement('span'),detail=document.createElement('small'),status=document.createElement('span'),controls=document.createElement('div'),refresh=document.createElement('button'),link=document.createElement('a'),connect=document.createElement('a');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 summary.className='np-credit-summary';controls.className='np-credit-actions';refresh.type='button';refresh.textContent='Refresh';refresh.setAttribute('aria-label','Refresh shared credit balance');link.href=PRICING;link.textContent='Add credits';link.className='np-credit-add';connect.hidden=true;summary.append(plan,balance,detail,status,connect);controls.append(refresh,link);bar.append(summary,controls);
 let inflight=false,last=0;
 async function update(force=false){
  if(inflight||document.hidden||!bar.isConnected||(!force&&Date.now()-last<10000))return;
  inflight=true;last=Date.now();refresh.disabled=true;status.textContent='Updating balance';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch('/api/platform/account',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
   if(response.status===401||response.status===403)throw Error('SIGN_IN_REQUIRED');
   const data=await response.json();if(!response.ok){const code=data.error||data.code||data.message;throw Error(['SIGN_IN_REFRESH_REQUIRED','NOTEPRESO_ACCOUNT_REQUIRED'].includes(code)?code:'UNAVAILABLE');}
   const view=accountView(data.account);plan.textContent=view.plan;balance.textContent=view.plan==='Pro'?`AI Credits · ${view.balance} available`:'Free previews';detail.textContent=`${view.detail} · Shared with Speaker Notes`;status.textContent='';connect.hidden=true;
  }catch(e){
   plan.textContent='NotePreso account';balance.textContent='Balance unavailable';detail.textContent='';status.textContent='Refresh to try again';
   const activate=e.message==='NOTEPRESO_ACCOUNT_REQUIRED',signIn=['SIGN_IN_REQUIRED','SIGN_IN_REFRESH_REQUIRED'].includes(e.message);connect.hidden=!(activate||signIn);connect.href=activate?'https://notepreso.com/app':'/api/auth/login';connect.textContent=activate?'Open NotePreso to connect your account':'Refresh sign-in';
  }finally{clearTimeout(timer);inflight=false;refresh.disabled=false;}
 }
 function mount(){const nav=document.querySelector('header.user-topnav');if(nav&&bar.previousElementSibling!==nav){nav.after(bar);void update();}}
 refresh.addEventListener('click',()=>void update(true));
 const observer=new MutationObserver(mount);observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});mount();
}
if(typeof document!=='undefined')startAccountBar();
