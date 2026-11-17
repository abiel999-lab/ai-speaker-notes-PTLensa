(()=>{'use strict';
const header=document.querySelector('#site-header');
  const onScroll=()=>header?.classList.toggle('scrolled',window.scrollY>24);
  onScroll(); window.addEventListener('scroll',onScroll,{passive:true});
const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('.site-nav');
  menu?.addEventListener('click',()=>{const open=nav.classList.toggle('menu-open');menu.setAttribute('aria-expanded',String(open));});
document.querySelectorAll('[data-scroll-upload]').forEach(b=>b.addEventListener('click',()=>window.location.assign('/#try-card')));
})();