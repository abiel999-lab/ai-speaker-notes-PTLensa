/* Progressive enhancement: only empty, optional signup name fields. */
(()=>{
 function simplify(){
  const form=document.querySelector('body[data-page-id="login-register"] #kc-register-form');
  if(!form)return;
  for(const name of ['firstName','lastName']){
   const input=form.querySelector('input[name="'+name+'"]');
   const group=input?.closest('.pf-v5-c-form__group,.pf-v6-c-form__group');
   if(!input||!group||input.value||input.required||input.getAttribute('aria-required')==='true'||input.getAttribute('aria-invalid')==='true')continue;
   if(group.querySelector('.pf-v5-c-form__label-required,.pf-v6-c-form__label-required,.pf-m-error,[role="alert"]'))continue;
   group.remove();
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',simplify,{once:true});else simplify();
})();
