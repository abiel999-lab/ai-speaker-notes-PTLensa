(()=>{
'use strict';
if(document.body.dataset.adminPage!=='presentation')return;
const set=(id,value)=>{const e=document.getElementById(id);if(e)e.textContent=value;};
const num=value=>Number(value||0).toLocaleString('en-US');
const date=value=>value?new Date(value).toLocaleString('en-US'):'—';
const addTextCell=(row,value)=>{const td=document.createElement('td');td.textContent=String(value??'—');row.append(td);};
const list=(target,rows,fields,empty)=>{
 const tbody=document.getElementById(target);if(!tbody)return;tbody.replaceChildren();
 if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=fields.length;td.className='empty-cell';td.textContent=empty;tr.append(td);tbody.append(tr);return;}
 for(const item of rows){const tr=document.createElement('tr');for(const field of fields)addTextCell(tr,field(item));tbody.append(tr);}
};
async function load(){
 const alert=document.getElementById('presentation-alert');
 try{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6500);
  let res;try{res=await fetch('/api/v1/admin/presentation-ai',{credentials:'same-origin',headers:{'Accept':'application/json'},signal:controller.signal});}finally{clearTimeout(timer);}
  if(!res.ok)throw new Error('Presentation AI monitoring is unavailable. Check the internal integration.');
  const data=await res.json(),counts=data.counts||{},usage=data.usage||{};
  if(alert){alert.classList.add('hidden');alert.textContent='';}
  set('pa-total',num(counts.generations));set('pa-ready',num(counts.completed));set('pa-failed',num(counts.failed));
  set('pa-active',num(counts.active));set('pa-users',num(counts.accounts));
  set('pa-tokens',num(Number(usage.inputTokens||0)+Number(usage.outputTokens||0)));
  set('pa-cost',usage.estimatedUsd===null?'Unknown':`$${Number(usage.estimatedUsd||0).toFixed(4)}`);
  set('pa-refreshed',`Updated ${new Date().toLocaleTimeString('en-US')}`);
  list('pa-generations',data.recent||[],[
   x=>x.title,x=>x.ownerName,x=>x.status,
   x=>[x.model||'—',x.engine||'—'].join(' / '),x=>date(x.updatedAt),x=>x.errorCode||'—'
  ],'No generation records yet.');
  list('pa-user-rows',data.users||[],[x=>x.displayName,x=>num(x.generations)],'No account activity yet.');
 }catch(error){
  if(alert){alert.textContent='Presentation AI data is temporarily unavailable. The existing Admin functions are unaffected.';alert.classList.remove('hidden');}
  set('pa-refreshed','Connection unavailable');
 }
}
void load();
})();
