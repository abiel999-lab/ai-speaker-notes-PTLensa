(()=>{
 'use strict';
 const states=new WeakMap();
 function setup(form){
  const file=form.querySelector('input[type=file][name=file]'),box=form.querySelector('.preflight-review');if(!file||!box)return;
  const summary=box.querySelector('.preflight-summary'),ack=box.querySelector('input[type=checkbox]'),warning=box.querySelector('.preflight-replace');
  const state={file:null,data:null,promise:null,csrf:null,controller:null,revision:0};states.set(form,state);
  const languageSelect=form.querySelector('[name=language]'),languageStatus=box.querySelector('.preflight-language');
  let manualLanguage=false,applyingLanguage=false;
  const browserLanguages=typeof navigator.languages==='object'?navigator.languages:[navigator.language];
  const codes={id:'Bahasa Indonesia',en:'English',ja:'Japanese',ko:'Korean',ar:'Arabic',fr:'French',de:'German',es:'Spanish',pt:'Portuguese',ru:'Russian',it:'Italian',nl:'Dutch',tr:'Turkish',hi:'Hindi',bn:'Bengali',ur:'Urdu',ta:'Tamil',te:'Telugu',mr:'Marathi',vi:'Vietnamese',th:'Thai',ms:'Malay',fil:'Filipino',uk:'Ukrainian',pl:'Polish',cs:'Czech',ro:'Romanian',hu:'Hungarian',el:'Greek',sv:'Swedish',da:'Danish',no:'Norwegian',fi:'Finnish',he:'Hebrew',fa:'Persian',sw:'Swahili',su:'Sundanese',jv:'Javanese','zh-cn':'Chinese (Simplified)','zh-tw':'Chinese (Traditional)','zh-hk':'Cantonese (Traditional)','pt-br':'Portuguese (Brazil)','pt-pt':'Portuguese (Portugal)','fr-ca':'French (Canada)'};
  function selectLanguage(value){
   const search=form.querySelector('[data-language-filter="'+languageSelect?.id+'"]');
   if(search?.value){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));}
   if(!languageSelect||!Array.from(languageSelect.options).some(option=>option.value===value))return false;
   applyingLanguage=true;languageSelect.value=value;languageSelect.dispatchEvent(new Event('change',{bubbles:true}));applyingLanguage=false;return true;
  }
  function chooseLanguage(data){
   if(manualLanguage){languageStatus.textContent='Using your selected language. Existing notes may stay in their original language.';return;}
   if(data.detected_language&&selectLanguage(data.detected_language)){
    languageStatus.textContent='Detected from slide text: '+data.detected_language+'. Review or change this before processing.';return;
   }
   let fallback;
   for(const code of browserLanguages||[]){const key=String(code).toLowerCase();const value=codes[key]||codes[key.split('-')[0]];if(value&&selectLanguage(value)){fallback='browser';break;}}
   if(!fallback){try{const saved=localStorage.getItem('notepreso.notesLanguage');if(saved&&selectLanguage(saved))fallback='last choice';}catch(_){}}
   languageStatus.textContent=(data.language_detection==='mixed_or_uncertain'?'Mixed or uncertain slide language. ':'Slide language could not be confirmed. ')+(fallback?'Using your '+fallback+' language. ':'')+'Check the selected language before processing.';
  }
  languageSelect?.addEventListener('change',()=>{if(applyingLanguage)return;manualLanguage=true;try{localStorage.setItem('notepreso.notesLanguage',languageSelect.value);}catch(_){}if(state.data)chooseLanguage(state.data);});
  function render(){
   const data=state.data;if(!data)return;
   const language=form.querySelector('[name=language]')?.selectedOptions[0]?.textContent.trim()||'English';
   const mode=form.querySelector('[name=notes_mode]')?.value||'missing_only',model=form.querySelector('[name=model]')?.value||'gpt-6-luna';
   const eligible=mode==='missing_only'?data.empty_notes_count:data.slide_count;
   const count=data.plan==='free'?Math.min(eligible,data.preview_slide_limit):eligible;
   const rate=data.credits_per_slide[model];const credits=data.plan==='free'?0:count*rate;
   summary.textContent='Notes in '+language+' · '+count+' slide'+(count===1?'':'s')+' to generate · '+(Number.isFinite(credits)?credits+' AI Credits':'credit estimate unavailable')+(data.plan==='free'?' (Free preview).':'.');
   if(data.plan==='pro')summary.textContent+=' Balance: '+data.credits_available+' AI Credits. Final eligibility and charge are checked again when you process.';
   if(data.plan==='free'&&model==='gpt-6.1-terra')summary.textContent+=' Terra requires Pro.';
   if(mode==='missing_only'&&data.existing_notes_count)summary.textContent+=' '+data.existing_notes_count+' existing notes kept.';
   warning.hidden=!(mode==='replace_all'&&data.existing_notes_count>0);
  }
  async function inspect(selected){
   if(!selected)return false;
   if(state.file===selected&&state.data)return true;
   if(state.file===selected&&state.promise)return state.promise;
   state.controller?.abort();state.controller=new AbortController();const revision=++state.revision;state.file=selected;state.data=null;ack.checked=false;warning.hidden=true;summary.textContent='Checking slide count and credit estimate...';
   state.promise=(async()=>{
    try{
     const authRes=await fetch('/api/v1/auth/me',{headers:{Accept:'application/json'},cache:'no-store'});if(!authRes.ok)throw Error('Account could not be checked. Please try again.');
     const auth=await authRes.json();
     if(!auth.authenticated){if(state.revision===revision)summary.textContent='Sign in to check your deck. Your file has not been uploaded for this check.';return false;}
     const payload=new FormData();payload.append('file',selected);
     const res=await fetch('/api/v1/presentations/preflight',{method:'POST',headers:{Accept:'application/json','X-Requested-With':'fetch','X-CSRF-Token':auth.csrf_token||''},body:payload,credentials:'same-origin',cache:'no-store',signal:state.controller.signal});
     if(!res.ok)throw Error(res.status===413?'This file exceeds the upload size limit.':res.status===429?'File checks are busy. Press process to try again shortly.':'This file could not be checked. Try a valid PowerPoint file.');
     const data=await res.json();
     if(!Number.isInteger(data.slide_count)||!Number.isInteger(data.empty_notes_count)||!Number.isInteger(data.existing_notes_count)||!['free','pro'].includes(data.plan)||!data.credits_per_slide)throw Error('The file check returned an invalid result.');
     if(state.revision!==revision)return false;state.data=data;chooseLanguage(data);render();return true;
    }catch(error){if(error.name!=='AbortError'&&state.revision===revision)summary.textContent=error.message;return false;}
    finally{if(state.revision===revision)state.promise=null;}
   })();return state.promise;
  }
  state.confirm=async selected=>{
   if(state.confirming)return false;state.confirming=true;
   try{
   const ready=state.file===selected&&state.data;
   if(!ready){const success=await inspect(selected);if(success){summary.textContent+=' Review this estimate, then press generate/process again.';box.scrollIntoView({block:'center',behavior:'auto'});}return false;}
   try{
    const res=await fetch('/api/v1/account/plan',{headers:{Accept:'application/json'},cache:'no-store'});if(!res.ok)throw Error();
    const plan=await res.json();if(!['free','pro'].includes(plan?.plan))throw Error();
    const changed=plan.plan!==state.data.plan;
    state.data.plan=plan.plan;state.data.credits_available=Number(plan.credits?.total||0);
    if(plan.limits?.preview_slides)state.data.preview_slide_limit=Number(plan.limits.preview_slides);
    if(changed){render();summary.textContent+=' Your plan changed. Review this estimate, then press process again.';return false;}
   }catch(_){summary.textContent='Your account could not be confirmed. Please try again before processing.';return false;}
   render();if(!warning.hidden&&!ack.checked){summary.textContent+=' Confirm replacement before processing.';ack.focus();return false;}
   if(state.data.plan==='free'&&form.querySelector('[name=model]')?.value==='gpt-6.1-terra')return false;
   return true;
   }finally{state.confirming=false;}
  };
  file.addEventListener('change',()=>void inspect(file.files?.[0]));
  form.addEventListener('change',event=>{if(event.target!==file&&event.target!==ack){if(event.target.name==='notes_mode')ack.checked=false;render();}});
  document.addEventListener('notepreso:planchange',event=>{if(!state.data)return;const plan=event.detail;if(plan?.plan!==state.data.plan){state.data=null;summary.textContent='Your plan changed. Press process to check this file again.';}else if(plan?.credits)state.data.credits_available=Number(plan.credits.total||0);render();});
 }
 document.querySelectorAll('#job-form,#home-preview-form').forEach(setup);
 window.NotePresoPreflight={confirm:async(form,file)=>{const state=states.get(form);return state?state.confirm(file):false;}};
})();
