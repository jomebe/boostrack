// Ads run in sandboxed, opaque-origin frames: no access to game storage or top navigation.
export function mountAds(){
  const formats={
    wide:['640f329eec445b885d96df5de8c6c882',728,90],
    banner:['b3f2e8feffb16c2360f00da599de0a04',468,60],
    mobile:['a83b824320bbb21472e49e55011899bb',320,50],
    tall:['576487f9390d96e1072d62ca184b6861',160,600],
    side:['52956c30eaf4aa5571bb97da732df9a0',160,300],
    rectangle:['906a9d2e05e736f530018e76adbaeb59',300,250],
  } as const;
  function slot(name:keyof typeof formats,cls:string){
    const [key,width,height]=formats[name];
    const section=document.createElement('aside');section.className=`ad-slot ${cls}`;section.setAttribute('aria-label','광고');
    const label=document.createElement('span');label.textContent='ADVERTISEMENT · 외부 광고';section.append(label);
    const frame=document.createElement('iframe');frame.title=`광고 ${width}×${height}`;frame.width=String(width);frame.height=String(height);
    frame.sandbox.add('allow-scripts','allow-popups');frame.loading='lazy';frame.referrerPolicy='no-referrer';
    frame.srcdoc=import.meta.env.DEV?'<!doctype html><title>광고 영역 미리보기</title>':`<!doctype html><html><body style="margin:0;overflow:hidden"><script>var atOptions={key:'${key}',format:'iframe',height:${height},width:${width},params:{}};</script><script src="https://www.highrevenueformat.com/${key}/invoke.js"></script></body></html>`;
    section.append(frame);return section;
  }
  let layout='';
  const menu=document.getElementById('menu')!;
  const update=()=>{
    if(menu.hidden){document.querySelectorAll('.ad-slot').forEach(el=>el.remove());layout='';return;}
    const banner=innerWidth>=1100?'wide':innerWidth>=768?'banner':'mobile';
    const side=innerWidth>=1600&&innerHeight>=900?'tall':innerWidth>=1450&&innerHeight>=760?'side':innerWidth>=1100&&innerHeight>=900?'rectangle':null;
    const next=banner+side;if(next===layout)return;layout=next;
    document.querySelectorAll('.ad-slot').forEach(el=>el.remove());
    document.getElementById('menu')!.append(slot(banner,'ad-banner'));
    if(side)document.getElementById('menu')!.append(slot(side,'ad-side'));
  };
  update();window.addEventListener('resize',update);
  new MutationObserver(update).observe(menu,{attributes:true,attributeFilter:['hidden']});
}
