import { COURSES } from './engine/track.ts';
import { formatTime, type RecordRun, type GhostFrame } from './engine/race.ts';
import { loadRecord } from './storage.ts';
import { $ } from './ui.ts';

interface Entry { rank:number; nickname:string; time_ms:number; mine?:number; replay:string|null }
export interface ChallengerGhost {track:string;nickname:string;rank:number;time:number;frames:GhostFrame[];splits:number[]}
export class Leaderboard {
  private request=0;
  private challengeRequest=0;
  onChallenge?: (ghost:ChallengerGhost)=>void;
  constructor(){
    const layer=document.createElement('div');
    layer.id='rankings';layer.className='overlay';layer.hidden=true;
    layer.innerHTML=`<section class="dialog ranking-dialog" role="dialog" aria-modal="true" aria-labelledby="ranking-title"><span class="eyebrow">WORLD LEADERBOARD / SEASON 4</span><h2 id="ranking-title">세계 기록</h2><label class="setting">코스 <select id="ranking-track">${COURSES.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></label><p class="settings-note">실제 기록을 세울 때 저장한 움직임으로 1:1 대결합니다.<br>원본 확인이 불가능한 과거 기록은 대결할 수 없습니다.</p><p id="ranking-mine"></p><p id="ranking-error" role="status"></p><div id="ranking-quick-area"></div><div id="ranking-entries" aria-live="polite"></div><button id="ranking-refresh" class="secondary">새로고침</button><button id="ranking-close" class="primary">돌아가기</button></section>`;
    document.body.append(layer);
    $('ranking-close').onclick=()=>{this.challengeRequest++;layer.hidden=true;$('ranking-open').focus();};
    $('ranking-refresh').onclick=()=>void this.load();
    $('ranking-track').onchange=()=>{this.challengeRequest++;void this.load();};
  }
  open(track:string){this.challengeRequest++;$<HTMLSelectElement>('ranking-track').value=track;$('rankings').hidden=false;$('ranking-close').focus();void this.load();}
  private async challenge(track:string,entry:Entry,button:HTMLButtonElement){
    const token=++this.challengeRequest;
    button.disabled=true;$('ranking-error').textContent='원본 주행을 불러오는 중…';
    try{
      const response=await fetch(`/api/leaderboard?track=${encodeURIComponent(track)}&replay=${entry.replay}`,{signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'고스트를 불러오지 못했습니다.');
      if(token!==this.challengeRequest||$('rankings').hidden)return;
      if(data.replay!==entry.replay||!Array.isArray(data.frames)||data.frames.length<2||!Array.isArray(data.splits))throw Error('원본 주행 형식이 올바르지 않습니다.');
      $('rankings').hidden=true;
      this.onChallenge?.({track,nickname:data.nickname,rank:data.rank,time:data.time_ms/1000,frames:data.frames,splits:data.splits});
    }catch(error){if(token===this.challengeRequest)$('ranking-error').textContent=error instanceof Error?error.message:'고스트 연결 실패';}
    finally{button.disabled=false;}
  }
  private async load(){
    const token=++this.request;
    const track=$<HTMLSelectElement>('ranking-track').value;
    $('ranking-entries').textContent='기록을 불러오는 중…';
    $('ranking-mine').textContent='';$('ranking-error').textContent='';$('ranking-quick-area').replaceChildren();
    try{
      const response=await fetch(`/api/leaderboard?track=${encodeURIComponent(track)}`,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('랭킹을 불러오지 못했습니다. 다시 시도해 주세요.');
      const data=await response.json() as {entries:Entry[];mine:Entry|null};
      if(token!==this.request)return;
      $('ranking-mine').textContent=data.mine?`내 순위 ${data.mine.rank}위 · ${formatTime(data.mine.time_ms/1000)}`:'아직 등록한 기록이 없습니다. 완주 화면에서 기록을 등록하세요.';
      $('ranking-entries').replaceChildren();
      if(!data.entries.length)$('ranking-entries').textContent='첫 번째 기록의 주인공이 되어 보세요.';
      for(const entry of data.entries){
        const row=document.createElement('div');row.className=`ranking-row${entry.mine?' is-me':''}`;
        for(const [text,cls] of [[String(entry.rank),'ranking-rank'],[entry.nickname+(entry.mine?' · 나':''),'ranking-nickname'],[formatTime(entry.time_ms/1000),'ranking-time']]){
          const cell=document.createElement('span');cell.className=cls;cell.textContent=text;row.append(cell);
        }
        const button=document.createElement('button');button.className='ranking-challenge-btn';
        button.textContent=entry.replay?'1:1 대결':'원본 없음';button.disabled=!entry.replay;
        button.onclick=()=>void this.challenge(track,entry,button);row.append(button);$('ranking-entries').append(row);
      }
      const best=data.entries[0];
      if(best?.replay){
        const quick=document.createElement('button');quick.className='primary ranking-top-challenge';
        quick.textContent=`1위 ${best.nickname} · 고스트 대결`;quick.onclick=()=>void this.challenge(track,best,quick);$('ranking-quick-area').append(quick);
      }
      const pb=loadRecord(track);
      if(pb?.captureVersion===1){
        const details=document.createElement('details');
        const summary=document.createElement('summary');summary.textContent=`내 브라우저 최고 기록 등록 · ${formatTime(pb.time)}`;details.append(summary);
        this.finish(track,pb,0,details);$('ranking-quick-area').append(details);
      }
    }catch(error){if(token===this.request)$('ranking-entries').textContent=error instanceof Error?error.message:'연결 실패';}
  }
  finish(track:string,run:RecordRun,respawns:number,container:HTMLElement=$('result')){
    const form=document.createElement('form');form.className='ranking-submit';
    container.append(form);
    if(respawns||run.time>600||run.captureVersion!==1){form.textContent='새 버전에서 복귀 없이 완주한 실제 기록만 등록할 수 있습니다.';return;}
    form.innerHTML='<label>랭킹 닉네임 <input name="nickname" aria-label="랭킹 닉네임" minlength="2" maxlength="16" required placeholder="2~16자 닉네임" autocomplete="nickname"></label><button class="secondary" type="submit">실제 주행과 기록 등록</button><p role="status"></p>';
    const name=form.querySelector('input')!,button=form.querySelector('button')!,status=form.querySelector('p')!;
    try{name.value=localStorage.getItem('boostrack.ranking.name')??'';}catch{}
    form.onsubmit=async event=>{
      event.preventDefault();const nickname=name.value.trim();
      if(!/^[\p{L}\p{N} _.-]{2,16}$/u.test(nickname)){status.textContent='한글·영문·숫자 및 _ . - 로 2~16자를 입력하세요.';return;}
      button.disabled=true;status.textContent='실제 주행 저장 중…';
      try{
        const init=await fetch(`/api/leaderboard?track=${encodeURIComponent(track)}`,{signal:AbortSignal.timeout(15000)});
        if(!init.ok)throw Error('랭킹 서버에 연결할 수 없습니다.');
        const response=await fetch('/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),
          body:JSON.stringify({track,nickname,time:run.time,captureVersion:run.captureVersion,splits:run.splits,frames:run.frames})});
        const data=await response.json();if(!response.ok)throw Error(data.error||'저장 실패');
        try{localStorage.setItem('boostrack.ranking.name',nickname);}catch{}
        status.textContent=data.updated?'등록 완료! 이 기록의 실제 주행이 저장됐습니다.':'더 빠른 기존 기록을 유지했습니다. 기존 고스트는 변경하지 않았습니다.';
        button.type='button';button.textContent='랭킹 보기';button.onclick=()=>this.open(track);
      }catch(error){status.textContent=error instanceof Error?error.message:'연결 실패. 다시 시도해 주세요.';}
      finally{button.disabled=false;}
    };
  }
}
