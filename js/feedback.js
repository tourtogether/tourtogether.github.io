// 지도 만족도(👍/👎) 카드: 30초 뒤 한 번만 보여주고, 응답은 GoatCounter 이벤트로만 집계한다(개인 식별 없음).
(function(){
  try{if(matchMedia('(max-width:760px)').matches){var bd=document.getElementById('bin-directory-open'),fl=document.querySelector('.filters');if(bd&&fl){bd.className='chip';fl.appendChild(bd);}}}catch(e){}
  var KEY='together.feedback';
  var params=new URLSearchParams(location.search);
  if(params.has('demo')){var b=document.getElementById('demo-open');if(b)b.hidden=false;document.documentElement.classList.add('is-demo');}
  function done(){try{return localStorage.getItem(KEY)}catch(e){return null}}
  function mark(v){try{localStorage.setItem(KEY,v)}catch(e){}}
  var card=document.getElementById('feedback-card');
  if(!card||done())return;
  function send(v){
    try{if(window.goatcounter&&window.goatcounter.count){window.goatcounter.count({path:'feedback-'+v,title:'지도 피드백: '+(v==='yes'?'네':'아니요'),event:true});}}catch(e){}
  }
  card.querySelectorAll('.feedback-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var v=btn.dataset.vote;send(v);mark(v);
      card.querySelector('.feedback-buttons').hidden=true;
      document.getElementById('feedback-thanks').hidden=false;
      setTimeout(function(){card.hidden=true},2200);
    });
  });
  document.getElementById('fb-card-close').addEventListener('click',function(){card.hidden=true;mark('dismissed');});
  var delay=params.has('feedbacknow')?500:30000;
  function tryShow(){if(window.__tourOpen){setTimeout(tryShow,5000);return;}if(!done())card.hidden=false;}
  setTimeout(tryShow,delay);
})();
