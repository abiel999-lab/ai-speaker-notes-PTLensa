(()=>{
 'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
 function show(job,host){
  if(!host||!UUID.test(job?.id||'')||job.status!=='completed')return;
  const old=host.querySelector(':scope > .notes-preview');if(old?.dataset.job===job.id)return old;old?.remove();
  const box=node('section',undefined,'notes-preview');box.dataset.job=job.id;box.setAttribute('aria-label','Speaker notes preview');
  box.append(node('h3','Speaker notes preview'),node('p','Review AI-generated notes before presenting. This preview does not use AI Credits.','notes-preview-help'));
  const status=node('p','Loading notes...');status.setAttribute('role','status');const list=node('div',undefined,'notes-preview-list'),more=node('button','Load more slides','btn secondary');more.type='button';more.hidden=true;box.append(status,list,more);host.append(box);
  let next=0,busy=false,loaded=0;
  async function load(){
   if(busy||next===null)return;busy=true;more.disabled=true;
   try{
    const res=await fetch('/api/v1/jobs/'+encodeURIComponent(job.id)+'/notes-preview?offset='+next+'&limit=10',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-store'});
    if(!res.ok)throw new Error(res.status===410?'This result has expired or is unavailable.':res.status===401?'Sign in again to read your notes.':'Notes could not be loaded. Try again or download the result.');
    const data=await res.json();if(data.job_id!==job.id||!Array.isArray(data.slides))throw Error('Unexpected notes response.');
    for(const slide of data.slides.slice(0,20)){
     if(!Number.isInteger(slide.number)||slide.number<1)continue;
     const item=node('details',undefined,'notes-slide');const title=node('summary','Slide '+slide.number+(slide.locked?' - Pro required':slide.title?' - '+String(slide.title):''));item.append(title);
     if(slide.locked){item.classList.add('notes-slide-locked');item.append(node('p','Finish this deck with Pro to generate notes for this slide.'));const link=node('a','View Pro options');link.href='/pricing?job='+encodeURIComponent(job.id);item.append(link);}
     else{const text=String(slide.unavailable?'This note could not be read. Try downloading the result.':slide.notes||'');item.append(node('p',text||'No speaker notes on this slide.','notes-preview-text'));if(slide.preserved)item.append(node('small','Existing notes preserved.'));if(slide.truncated)item.append(node('small','Download the PowerPoint to read this note in full.'));if(loaded===0)item.open=true;}
     list.append(item);loaded++;
    }
    const validNext=Number.isInteger(data.next_offset)&&data.next_offset>next;next=validNext?data.next_offset:null;
    status.textContent=loaded+' of '+Number(data.slide_count||loaded)+' slides shown.';more.textContent='Load more slides';more.hidden=next===null;
   }catch(error){status.textContent=error.message;more.textContent='Try loading notes again';more.hidden=false;}
   finally{busy=false;more.disabled=false;}
  }
  more.addEventListener('click',load);void load();return box;
 }
 window.NotePresoNotes={show};
 const history=document.querySelector('#history-list');
 if(history){const attach=()=>history.querySelectorAll('.history-item').forEach(item=>{
  if(item.dataset.notesBound)return;
  const link=item.querySelector('a.history-download-btn');if(!link)return;
  let match;try{match=new URL(link.href,location.origin).pathname.match(/^\/api\/v1\/jobs\/([0-9a-f-]{36})\/download$/i);}catch(_){return;}if(!match||!UUID.test(match[1]))return;
  item.dataset.notesBound='true';const button=node('button','Read notes','btn secondary');button.type='button';button.setAttribute('aria-expanded','false');link.after(button);
  let section;
  button.addEventListener('click',()=>{if(section){section.hidden=!section.hidden;button.setAttribute('aria-expanded',String(!section.hidden));return;}const holder=node('div',undefined,'notes-history-preview');item.after(holder);section=show({id:match[1],status:'completed'},holder);button.setAttribute('aria-expanded','true');});
 });new MutationObserver(attach).observe(history,{childList:true,subtree:true});attach();}
})();
