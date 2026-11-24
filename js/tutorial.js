// 처음 방문한 사람에게 성공지도 사용법을 4단계로 소개한다. 한 번 닫으면 다시 뜨지 않고, 주소에 ?tour를 붙이면 다시 볼 수 있다.
(function(){
  var KEY='together.tutorial';
  var box=document.getElementById('tutorial');
  if(!box)return;
  var params=new URLSearchParams(location.search);
  var seen=null;try{seen=localStorage.getItem(KEY);}catch(e){}
  if(seen&&!params.has('tour'))return;
  var steps=box.querySelectorAll('.tut-step'),dots=box.querySelectorAll('.tut-dot');
  var next=document.getElementById('tut-next'),skip=document.getElementById('tut-skip');
  var i=0;
  function count(kind){try{if(window.goatcounter&&window.goatcounter.count)window.goatcounter.count({path:'tutorial-'+kind,title:'튜토리얼 '+kind,event:true});}catch(e){}}
  function show(n){
    i=n;
    steps.forEach(function(s,k){s.hidden=k!==n;});
    dots.forEach(function(d,k){d.classList.toggle('on',k===n);});
    var last=n===steps.length-1;
    document.getElementById('tut-next-label').hidden=last;
    document.getElementById('tut-start-label').hidden=!last;
    var sel=document.getElementById('language');
    box.querySelectorAll('[data-tut-lang]').forEach(function(x){x.classList.toggle('on',!!sel&&x.dataset.tutLang===sel.value);});
    skip.style.visibility=last?'hidden':'visible';
  }
  function close(kind){
    box.hidden=true;window.__tourOpen=false;
    try{localStorage.setItem(KEY,kind);}catch(e){}
    count(kind);
  }
  var loc=document.getElementById('tut-locate');
  if(loc)loc.addEventListener('click',function(){
    var g=document.getElementById('gps-button');if(g)g.click();
    loc.classList.add('done');loc.disabled=true;
    document.getElementById('tut-locate-label').hidden=true;
    document.getElementById('tut-located-label').hidden=false;
    count('locate');
  });
  next.addEventListener('click',function(){if(i<steps.length-1)show(i+1);else close('done');});
  skip.addEventListener('click',function(){close('skip');});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!box.hidden)close('skip');});
  box.querySelectorAll('[data-tut-lang]').forEach(function(b){
    b.addEventListener('click',function(){
      var sel=document.getElementById('language');if(!sel)return;
      sel.value=b.dataset.tutLang;sel.dispatchEvent(new Event('change'));
      show(i);
    });
  });
  window.__tourOpen=true;
  show(0);box.hidden=false;
})();
