(() => {
'use strict';
const header=document.querySelector('#site-header');
  const onScroll=()=>header?.classList.toggle('scrolled',window.scrollY>24);
  onScroll(); window.addEventListener('scroll',onScroll,{passive:true});
document.querySelectorAll('[data-scroll-upload]').forEach(button=>{
  button.addEventListener('click',()=>{
    window.location.assign('/#try-card');
  });
});
})();
