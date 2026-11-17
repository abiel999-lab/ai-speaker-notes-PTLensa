(()=>{
 'use strict';
 const descriptions={Low:'Light',Medium:'Balanced',High:'Detailed'};
 const lengths={'<100 kata':'Concise','100-250 kata':'Standard','250-500 kata':'Detailed',Custom:'Custom'};
 function update(){
  const workspace=document.querySelector('#workspace-settings-summary');
  if(workspace){
   const get=id=>document.querySelector('#'+id);
   const model=get('model')?.value==='gpt-6.1-terra'?'Terra · 3 credits/slide':'Luna · 1 credit/slide';
   workspace.textContent=[model,get('language')?.selectedOptions[0]?.textContent.trim(),get('audience')?.selectedOptions[0]?.textContent.trim(),descriptions[get('depth')?.value],lengths[get('note-length')?.value],get('use-vision')?.value==='true'?'Text + Vision':'Text only'].filter(Boolean).join(' · ');
  }
  const home=document.querySelector('#home-settings-summary');
  if(home){const get=id=>document.querySelector('#home-'+id);home.textContent=[get('language')?.selectedOptions[0]?.textContent.trim(),get('audience')?.selectedOptions[0]?.textContent.trim(),descriptions[get('depth')?.value],lengths[get('note-length')?.value]].filter(Boolean).join(' · ');}
 }
 function balance(plan){
  const node=document.querySelector('#workspace-balance');if(!node||!plan)return;
  if(plan.credits?.active)node.textContent=(plan.plan_name||plan.plan)+' · '+Number(plan.credits.total||0).toLocaleString()+' AI Credits available';
  else if(plan.plan==='free'){const n=plan.remaining?.presentations;node.textContent='Free · '+(typeof n==='number'?n+' previews remaining this week':'weekly previews');}
  else node.textContent=plan.plan_name||'Account details';
 }
 document.addEventListener('change',update);document.addEventListener('input',update);
 document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>setTimeout(update,0)));
 document.addEventListener('asn:languagechange',update);
 document.addEventListener('notepreso:planchange',event=>balance(event.detail));
 if(typeof window.getAccountPlan==='function')balance(window.getAccountPlan());
 function revealHash(){if(location.hash==='#account-plan-card'){const d=document.querySelector('#workspace-account-details');if(d)d.open=true;}}
 window.addEventListener('hashchange',revealHash);revealHash();update();
 document.querySelectorAll('#workspace-settings select,#workspace-settings input,#workspace-settings textarea').forEach(input=>input.addEventListener('invalid',()=>{document.querySelector('#workspace-settings').open=true;}));
 document.querySelectorAll('.start-settings,.workspace-account-details').forEach(details=>{
  function updateDisclosure(){const label=details.querySelector(':scope > summary [data-disclosure-label]');if(label)label.textContent=details.open?'Click to collapse':'Click to expand';}
  details.addEventListener('toggle',updateDisclosure);updateDisclosure();
 });
 document.querySelectorAll('[data-scroll-upload]').forEach(button=>button.addEventListener('click',()=>{document.querySelector('#try-card')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});document.querySelector('#home-file')?.focus({preventScroll:true});}));
})();
