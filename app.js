/* 생태계 탐험 교실 — v7 Supabase 공개 키 적용 · v6 활동 기능 유지 */
(() => {
  'use strict';
  const ITEMS = [
    {id:'grass',name:'풀',category:'producer'},
    {id:'tree',name:'나무',category:'producer'},
    {id:'flower',name:'꽃',category:'producer'},
    {id:'rabbit',name:'토끼',category:'consumer'},
    {id:'grasshopper',name:'메뚜기',category:'consumer'},
    {id:'caterpillar',name:'애벌레',category:'consumer'},
    {id:'frog',name:'개구리',category:'consumer'},
    {id:'snake',name:'뱀',category:'consumer'},
    {id:'sparrow',name:'참새',category:'consumer'},
    {id:'hawk',name:'매',category:'consumer'},
    {id:'mushroom',name:'버섯(균류)',category:'decomposer'},
    {id:'bacteria',name:'세균',category:'decomposer'},
    {id:'sun',name:'햇빛',category:'nonliving'},
    {id:'water',name:'물',category:'nonliving'},
    {id:'wind',name:'공기',category:'nonliving'},
    {id:'soil',name:'흙',category:'nonliving'},
    // 국립생태원 멸종위기 야생생물 목록에서 선정한 8종
    {id:'otter',name:'수달',category:'consumer'},
    {id:'wildcat',name:'삵',category:'consumer'},
    {id:'fox',name:'여우',category:'consumer'},
    {id:'blackbear',name:'반달가슴곰',category:'consumer'},
    {id:'crane',name:'두루미',category:'consumer'},
    {id:'flyingsquirrel',name:'하늘다람쥐',category:'consumer'},
    {id:'turtle',name:'남생이',category:'consumer'},
    {id:'narrowmouthtoad',name:'맹꽁이',category:'consumer'},
    // 같은 목록에 등재된 4종의 희귀·멸종위기 식물은 생산자로 분류
    {id:'euryale',name:'가시연',category:'producer'},
    {id:'ranunculus',name:'매화마름',category:'producer'},
    {id:'yellowiris',name:'노랑붓꽃',category:'producer'},
    {id:'dichotomousiris',name:'대청부채',category:'producer'}
  ];
  const ITEM_COUNT = ITEMS.length;
  const LIVING_COUNT = ITEMS.filter(x=>x.category!=='nonliving').length;
  const CATEGORY = {producer:'생물 · 생산자',consumer:'생물 · 소비자',decomposer:'생물 · 분해자',nonliving:'비생물 요소'};
  const EDGE = {eat:{name:'먹이 관계',color:'#2e8063',label:''},decompose:{name:'분해 관계',color:'#a67735',label:'분해'}};
  const DEFAULT = () => ({members:[],classifications:{},classificationResult:null,nodes:[],edges:[],note:'',finished:false});
  const app = document.getElementById('app');
  const config = window.ECO_CONFIG || {};
  const cloud = Boolean(config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY && window.supabase);
  const supa = cloud ? window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY) : null;
  let state=DEFAULT(),groupNo=null,tab='classify',mode='landing',connecting=false,from=null,edgeType='eat',checked=false,selectedCard=null,ignoreCardClick=null;
  let teacherRows=[],selectedGroup=1,projecting=false,teacherPIN=null,teacherPoll=null,saveTimer=null,saveChain=Promise.resolve(),toastTimer=null;
  // 현재 모둠의 먹이그물 작업만 메모리에 보관. 모둠 전환·새로고침 시 초기화.
  const HISTORY_LIMIT=50;
  let undoStack=[],redoStack=[];
  const esc=s=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getItem=id=>ITEMS.find(item=>item.id===id);
  const image=id=>`assets/${id}.webp`;
  const localKey=n=>`ecosystem-group-${n}-v1`;
  const normal=v=>{
    const a={...DEFAULT(),...(v && typeof v==='object'?v:{})};
    a.members=Array.isArray(a.members)?a.members:[];
    a.classifications=a.classifications && typeof a.classifications==='object'?a.classifications:{};
    // 기존 16장 버전에서 정답을 제출한 기록은 유지하되 28장 채점 완료 상태는 해제합니다.
    if(a.classificationResult?.submitted && (a.classificationResult.total!==ITEM_COUNT || ITEMS.some(x=>!a.classifications[x.id]))) {
      a.classificationResult=null;
    }

    a.nodes=(Array.isArray(a.nodes)?a.nodes:[]).filter(n=>getItem(n.id)?.category!=='nonliving'&&getItem(n.id));
    const ids=new Set(a.nodes.map(n=>n.id));
    a.edges=(Array.isArray(a.edges)?a.edges:[]).filter(e=>ids.has(e.from)&&ids.has(e.to)&&e.from!==e.to&&e.type in EDGE);
    return a;
  };
  const getLocal=n=>normal(JSON.parse(localStorage.getItem(localKey(n))||'null'));
  const toast=(msg)=>{const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)};
  const banner=()=>`<span class="badge ${cloud?'':'local'}">${cloud?'Supabase 연결 설정됨':(!config.SUPABASE_URL&&config.SUPABASE_PUBLISHABLE_KEY?'Supabase URL 미입력 · 기기 간 공유 안 됨':'로컬 체험 · 다른 기기와 공유되지 않음')}</span>`;
  const btn=(text,action,cls='',disabled=false)=>`<button type="button" class="btn ${cls}" data-action="${action}" ${disabled?'disabled':''}>${text}</button>`;
  function refreshWebStage(){
    const shell=document.querySelector('#stage .canvas-shell');
    const left=shell?.scrollLeft||0,top=shell?.scrollTop||0;
    renderStage();
    const next=document.querySelector('#stage .canvas-shell');
    if(next){next.scrollLeft=left;next.scrollTop=top;}
  }
  const boardSnapshot=()=>JSON.stringify({nodes:state.nodes,edges:state.edges});
  function rememberBoardEdit(before){
    if(before===boardSnapshot())return false;
    undoStack.push(before);
    if(undoStack.length>HISTORY_LIMIT)undoStack.shift();
    redoStack=[]; // 새 작업을 하면 다시 실행 기록은 사라짐
    save();
    return true;
  }
  function restoreBoardSnapshot(snapshot){
    const previous=JSON.parse(snapshot);
    state.nodes=previous.nodes;
    state.edges=previous.edges;
    from=null;
    save();
    refreshWebStage();
  }
  function undoBoard(){
    if(!undoStack.length){toast('되돌릴 작업이 없어요.');return;}
    const now=boardSnapshot();
    redoStack.push(now);
    restoreBoardSnapshot(undoStack.pop());
    toast('이전 작업으로 되돌렸어요.');
  }
  function redoBoard(){
    if(!redoStack.length){toast('다시 실행할 작업이 없어요.');return;}
    const now=boardSnapshot();
    undoStack.push(now);
    restoreBoardSnapshot(redoStack.pop());
    toast('작업을 다시 실행했어요.');
  }
  function clearBoard(){
    if(!state.nodes.length&&!state.edges.length){toast('활동판에 지울 카드가 없어요.');return;}
    const question=`활동판의 생물 카드 ${state.nodes.length}개와 화살표 ${state.edges.length}개를 모두 지울까요?\n\n분류 결과와 모둠의 설명은 유지됩니다. 지운 뒤에는 '되돌리기'로 복원할 수 있어요.`;
    if(!confirm(question))return;
    const before=boardSnapshot();
    state.nodes=[];
    state.edges=[];
    from=null;
    rememberBoardEdit(before);
    refreshWebStage();
    toast('활동판을 모두 지웠어요. 되돌리기로 복원할 수 있어요.');
  }
  function topbar(title,subtitle='',back='landing'){
    return `<div class="topbar"><div class="brand"><span class="mark" aria-hidden="true">✳</span><div><strong>생태계 탐험 교실</strong><small>${esc(title)}${subtitle?' · '+esc(subtitle):''}</small></div></div><div class="row">${banner()}${btn('처음으로','go-'+back,'ghost sm')}</div></div>`;
  }
  function view(body){app.innerHTML=`<main class="container">${body}</main>`;window.scrollTo({top:0,behavior:'auto'});}
  function landing(){mode='landing';removeChannel();teacherPIN=null;projecting=false;view(`${topbar('함께 탐험하는 생태계')}<section class="hero"><div class="eyebrow">ECOSYSTEM LAB</div><h1>우리 모둠이 만드는<br>생태계 먹이그물</h1></section><div class="grid2"><button class="panel mode-card" data-action="student-select"><span class="mode-icon" aria-hidden="true">🌿</span><h2>학생 모드</h2></button><button class="panel mode-card" data-action="teacher-login"><span class="mode-icon" aria-hidden="true">🖥️</span><h2>교사 모드</h2></button></div>`);}
  function studentSelect(){mode='select';view(`${topbar('학생 모드','모둠 고르기')}<div class="eyebrow">STEP 0</div><h1>우리 모둠을 골라 주세요</h1><p class="lead" style="margin-bottom:24px">모둠 번호를 선택하면 모둠원의 이름을 적고 활동을 시작할 수 있어요.</p><div class="grid3">${[1,2,3,4,5,6].map(n=>`<button class="group-btn" data-action="join-group" data-number="${n}"><strong>${n}모둠</strong><span class="muted small">모둠 활동 시작하기 →</span></button>`).join('')}</div>`);}
  async function joinGroup(n){
    if(n<1||n>6)return;
    if(cloud){
      try{
        const {data:{user}}=await supa.auth.getUser();
        // 모둠원은 아이디·비밀번호를 입력하지 않습니다. 기기별 익명 세션만 내부적으로 사용합니다.
        if(!user||!user.is_anonymous){if(user)await supa.auth.signOut();const res=await supa.auth.signInAnonymously();if(res.error)throw res.error;}
        const {data:{user:current}}=await supa.auth.getUser();
        const membership=await supa.from('group_memberships').upsert({user_id:current.id,group_no:n},{onConflict:'user_id'});
        if(membership.error)throw membership.error;
        const res=await supa.from('group_work').select('members,activity').eq('group_no',n).single();
        if(res.error)throw res.error;
        state=normal(res.data.activity);state.members=Array.isArray(res.data.members)?res.data.members:[];
      }catch(e){toast('모둠 연결 실패: '+e.message);return;}
    }else state=getLocal(n);
    groupNo=n;undoStack=[];redoStack=[];tab='classify';checked=Boolean(state.classificationResult?.submitted);selectedCard=null;mode='members';members();
  }
  function members(){mode='members';view(`${topbar('학생 모드',groupNo+'모둠')}<div class="authbox" style="margin-top:5vh"><div class="panel"><div class="eyebrow">STEP 1 · MEET THE TEAM</div><h2 style="margin-top:8px">${groupNo}모둠 친구들을 소개해 주세요</h2><p class="muted small" style="margin:10px 0 16px">모둠원 이름이나 별칭을 쉼표 또는 줄바꿈으로 나누어 입력하세요.</p><label for="members">모둠원 이름</label><textarea id="members" rows="4" placeholder="예: 하늘, 나무, 별이">${esc(state.members.join(', '))}</textarea><p class="tip" style="margin-top:12px">개인정보 보호를 위해 본명 대신 별칭을 사용할 수 있어요.</p><div class="row" style="margin-top:20px">${btn('활동 시작하기','start-student')}${btn('모둠 다시 선택','student-select','ghost')}</div></div></div>`);}
  function parseMembers(v){return [...new Set(v.split(/[,\n、]+/).map(s=>s.trim().slice(0,30)).filter(Boolean))].slice(0,12);}
  function startStudent(){state.members=parseMembers(document.getElementById('members').value);if(state.members.length===0){toast('모둠원 이름 또는 별칭을 1명 이상 적어 주세요.');return;}save();student();listenStudent();}
  function student(){mode='student';view(`${topbar('학생 모드',groupNo+'모둠')}<div class="row spread"><div><h1>${groupNo}모둠의 생태계 탐험</h1><p class="muted small">모둠원: ${esc(state.members.join(', '))}</p></div><div class="row"><small id="saveStatus">${cloud?'저장됨':'이 기기에 저장'}</small>${btn('모둠원 수정','edit-members','ghost sm')}</div></div><div class="tabs"><button class="tab ${tab==='classify'?'active':''}" data-action="tab-classify">① 구성요소 분류</button><button class="tab ${tab==='web'?'active':''}" data-action="tab-web">② 먹이사슬·먹이그물</button></div><div id="stage"></div>`);renderStage();}
  function classCard(x){
    const placed=state.classifications[x.id]||null;
    const result=checked?(placed===x.category?'is-correct':'is-wrong'):'';
    const flag=checked?`<span class="answer-flag ${result}">${result==='is-correct'?'정답':'오답'}</span>`:'';
    return `<button type="button" class="sort-card ${result} ${selectedCard===x.id?'is-selected':''}" data-class-card="${x.id}" aria-pressed="${selectedCard===x.id}" aria-label="${esc(x.name)} 카드, ${placed?CATEGORY[placed]:'미분류'}${checked?(result==='is-correct'?', 정답':', 오답'):''}" ${checked?'disabled':''}><img src="${image(x.id)}" alt="" draggable="false"><span class="sort-card-name">${esc(x.name)}</span>${flag}</button>`;
  }
  function dropZone(category, heading, explanation=''){
    const placed=ITEMS.filter(x=>state.classifications[x.id]===category);
    return `<section class="sort-zone ${category}" data-drop-category="${category}" tabindex="0" role="button" aria-label="${heading} 분류 영역"><div class="zone-head"><h3>${heading}</h3><span class="zone-total">${placed.length}개</span></div>${explanation?`<p class="zone-hint">${explanation}</p>`:''}<div class="zone-content">${placed.length?placed.map(classCard).join(''):'<span class="zone-placeholder">여기로 카드를 끌어 놓으세요</span>'}</div></section>`;
  }
  function renderStage(){
    if(mode!=='student')return;
    const stage=document.getElementById('stage');if(!stage)return;
    if(tab==='classify'){
      checked=Boolean(state.classificationResult?.submitted);
      const count=ITEMS.filter(x=>state.classifications[x.id]).length;
      const correct=ITEMS.filter(x=>state.classifications[x.id]===x.category).length;
      const bank=ITEMS.filter(x=>!state.classifications[x.id]);
      stage.innerHTML=`<div class="panel classify-panel"><div class="eyebrow">ACTIVITY 01</div><h2>생태계의 구성요소 분류하기</h2><p class="muted small" style="margin-top:7px">카드를 알맞은 칸으로 끌어 놓으세요. <strong>태블릿에서는 카드를 한 번 누른 뒤 원하는 분류 칸을 누르는 방식</strong>도 편리해요.</p>
      <div class="statline"><span class="stat">분류 ${count}/${ITEMS.length}</span>${checked?`<span class="stat">정답 ${correct}/${ITEMS.length}</span>`:''}</div>
      ${checked?`<div class="result-panel ${correct===ITEMS.length?'all-correct':''}" role="status"><strong>${correct===ITEMS.length?'모두 정답이에요!':'정답 '+correct+'개 · 오답 '+(ITEMS.length-correct)+'개'}</strong><span>${correct===ITEMS.length?'생태계 요소를 정확하게 분류했어요.':'초록색은 정답, 빨간색은 오답이에요. 다시 도전해 보세요.'}</span></div>`:''}
      <section class="sort-bank" data-drop-category="" tabindex="0" role="button" aria-label="분류 전 카드 놓는 곳"><div class="zone-head"><h3>분류할 카드</h3><div class="bank-controls"><span class="zone-total">${bank.length}개 남음</span><button type="button" class="bank-scroll-btn" data-action="scroll-bank-up" aria-label="카드 목록 위로 스크롤">↑</button><button type="button" class="bank-scroll-btn" data-action="scroll-bank-down" aria-label="카드 목록 아래로 스크롤">↓</button></div></div><div class="bank-content">${bank.length?bank.map(classCard).join(''):'<span class="zone-placeholder">모든 카드를 분류했어요!</span>'}</div></section>
      <div class="ecosystem-sort"><div class="biotic-area"><div class="zone-group-heading"><h2>생물 요소</h2><p>살아 있는 생물들</p></div><div class="biotic-zones">${dropZone('producer','생산자','스스로 양분을 만드는 생물')}${dropZone('consumer','소비자','다른 생물을 먹는 생물')}${dropZone('decomposer','분해자','죽은 생물이나 배설물 등을 분해하는 생물')}</div></div><div class="abiotic-area"><div class="zone-group-heading"><h2>비생물 요소</h2><p>생물의 생활에 영향을 주는 환경</p></div>${dropZone('nonliving','빛 · 물 · 공기 · 흙 등')}</div></div>
      <div class="row classify-actions">${checked?`${btn('틀린 카드 다시 도전','retry-wrong')}${btn('처음부터 다시 분류','reset-classification','ghost')}`:`${btn('분류 결과 제출하기','check-classification')}`}${btn('먹이사슬·먹이그물 만들기 →','tab-web','secondary')}</div></div>`;
      bindClassifyDrag(stage);
    } else {
      const living=ITEMS.filter(x=>x.category!=='nonliving');
      stage.innerHTML=`<div class="panel" style="margin-bottom:15px"><div class="eyebrow">ACTIVITY 02</div><h2>먹이사슬과 먹이그물 만들기</h2><p class="muted small" style="margin-top:7px">생물 카드만 배치해요. 화살표 연결 모드에서 <b>먹히는 생물 → 먹는 생물</b> 순서로 누르세요. 분해 관계는 분해자로 연결하세요. 서로 다른 서식지의 생물을 무조건 연결하지 말고 근거를 찾아보세요.</p><div class="statline"><span class="stat">배치 ${state.nodes.length}개</span><span class="stat">연결 ${state.edges.length}개</span></div><div class="legend"><span><i style="border-color:#2e8063"></i> 먹이 관계</span><span><i class="dotted" style="border-color:#a67735"></i> 분해 관계</span></div></div><div class="work-layout"><aside class="panel palette"><h3>생물 카드 도구함 (${LIVING_COUNT}종)</h3><p class="muted small">필요한 생물만 골라 활동판에 배치해요.</p><div class="palette-list">${['producer','consumer','decomposer'].map(kind=>`<div class="palette-group"><h4>${CATEGORY[kind].replace('생물 · ','')} <small>${living.filter(x=>x.category===kind).length}종</small></h4><div class="palette-grid">${living.filter(x=>x.category===kind).map(x=>`<button class="palette-card" data-action="add-node" data-id="${x.id}"><img src="${image(x.id)}" alt=""><span>${esc(x.name)}<br><small>+ 배치</small></span></button>`).join('')}</div></div>`).join('')}</div></aside><div class="panel"><div class="toolbar"><button class="btn ${connecting?'active':'secondary'} sm" data-action="toggle-connect">${connecting?'연결 모드 사용 중':'화살표 연결 모드'}</button><select id="edge-type" aria-label="연결 관계 종류">${Object.entries(EDGE).map(([k,v])=>`<option value="${k}" ${edgeType===k?'selected':''}>${v.name}</option>`).join('')}</select>${btn('↶ 되돌리기','undo-web','ghost sm',!undoStack.length)}${btn('↷ 다시 실행','redo-web','ghost sm',!redoStack.length)}${btn('화살표만 지우기','clear-edges','ghost sm',!state.edges.length)}${btn('전체 지우기','clear-board','danger sm',!state.nodes.length&&!state.edges.length)}</div><div id="connectHint" class="tip" style="margin-bottom:10px">${connecting?(from?'도착 카드를 눌러 주세요.':'출발 카드를 눌러 주세요.'):'카드를 손가락이나 마우스로 끌어서 이동할 수 있어요.'}</div><div class="canvas-shell"><div class="board" id="studentBoard"></div></div><div class="board-info">활동판은 좌우·위아래로 스크롤할 수 있어요. 태블릿에서는 빈 공간을 밀어서 이동하고, 카드를 눌러 연결하거나 끌어서 위치를 바꿔 주세요. 삭제는 카드 오른쪽 위 ×를 누르세요. <b>되돌리기</b>는 이 화면에서 실행한 최근 50단계까지 가능해요.</div></div></div><div class="panel" style="margin-top:15px"><h3 class="section-title">우리 모둠의 설명</h3><label class="small" for="note">어떤 생물이 서로 연결되어 있나요? 하나가 사라지면 어떤 변화가 생길까요?</label><textarea id="note" rows="3" placeholder="우리 모둠의 생각을 써 보세요.">${esc(state.note)}</textarea><div class="row" style="margin-top:12px">${btn(state.finished?'활동 완료 표시 해제':'활동 완료 표시하기','toggle-finished',state.finished?'secondary':'')}${state.finished?'<span class="badge">활동 완료</span>':''}</div></div>`;
      drawBoard(document.getElementById('studentBoard'),state,false);
    }
  }
  function assignClass(id, category){
    if(checked)return;
    if(!getItem(id)|| (category && !Object.hasOwn(CATEGORY,category)))return;
    if(category)state.classifications[id]=category;else delete state.classifications[id];
    state.classificationResult=null;selectedCard=null;save();renderStage();
  }
  function bindClassifyDrag(stage){
    if(checked)return;
    // HTML drag-and-drop 대신 Pointer Events를 사용하므로 터치 태블릿에서도 동작합니다.
    stage.querySelectorAll('[data-class-card]').forEach(card=>{
      card.addEventListener('pointerdown',event=>{
        if(event.button!==0||checked)return;
        const id=card.dataset.classCard;
        const initialX=event.clientX,initialY=event.clientY;
        let ghost=null,hovered=null,moving=false;
        const move=ev=>{
          if(ev.pointerId!==event.pointerId)return;
          if(!moving && Math.hypot(ev.clientX-initialX,ev.clientY-initialY)<7)return;
          if(!moving){moving=true;ghost=card.cloneNode(true);ghost.classList.add('drag-ghost');ghost.removeAttribute('disabled');document.body.appendChild(ghost);card.classList.add('being-dragged');}
          ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';
          const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('[data-drop-category]');
          if(hovered!==target){hovered?.classList.remove('drag-over');hovered=target;hovered?.classList.add('drag-over');}
          // 화면 하단/상단에 가까우면 태블릿에서 스크롤해 아래쪽 분류 영역에 도착할 수 있게 함
          if(ev.clientY>window.innerHeight-72)window.scrollBy(0,14);
          else if(ev.clientY<90)window.scrollBy(0,-14);
        };
        const done=ev=>{
          if(ev.pointerId!==event.pointerId)return;
          document.removeEventListener('pointermove',move);
          document.removeEventListener('pointerup',done);
          document.removeEventListener('pointercancel',cancel);
          hovered?.classList.remove('drag-over');
          ghost?.remove();card.classList.remove('being-dragged');
          if(moving){ignoreCardClick=id;window.setTimeout(()=>{if(ignoreCardClick===id)ignoreCardClick=null},120);if(hovered)assignClass(id,hovered.dataset.dropCategory);}
        };
        const cancel=ev=>{if(ev.pointerId!==event.pointerId)return;document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',done);document.removeEventListener('pointercancel',cancel);hovered?.classList.remove('drag-over');ghost?.remove();card.classList.remove('being-dragged');};
        document.addEventListener('pointermove',move);
        document.addEventListener('pointerup',done);
        document.addEventListener('pointercancel',cancel);
      });
    });
  }
  function drawBoard(board,data,readonly){if(!board)return;const nodes=(Array.isArray(data.nodes)?data.nodes:[]).filter(n=>getItem(n.id)?.category!=='nonliving'&&getItem(n.id)),edges=(Array.isArray(data.edges)?data.edges:[]).filter(e=>e.type in EDGE);const pos=Object.fromEntries(nodes.map(n=>[n.id,n]));
    let svg=`<svg viewBox="0 0 1050 880" aria-label="카드 관계 연결선"><defs>`;
    for(const [k,v] of Object.entries(EDGE))svg+=`<marker id="arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${v.color}"/></marker>`;
    svg+='</defs>';
    edges.forEach((edge,i)=>{const a=pos[edge.from],b=pos[edge.to];if(!a||!b||a.id===b.id)return;const type=EDGE[edge.type]||EDGE.eat;const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;const nx=dx/dist,ny=dy/dist;const x1=a.x+66+nx*64,y1=a.y+66+ny*61,x2=b.x+66-nx*73,y2=b.y+66-ny*69;svg+=`<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${type.color}" stroke-width="3.5" ${edge.type==='eat'?'':'stroke-dasharray="9 6"'} marker-end="url(#arrow-${edge.type in EDGE?edge.type:'eat'})"/>${readonly?'':`<line class="edge-hit" data-edge="${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`}${type.label?`<text class="edge-label" x="${(x1+x2)/2}" y="${(y1+y2)/2-8}" text-anchor="middle">${type.label}</text>`:''}</g>`;});svg+='</svg>';
    board.classList.toggle('board-readonly',readonly);
    board.innerHTML=svg+nodes.map(n=>{const item=getItem(n.id);return item?`<div class="node ${!readonly&&from===n.id?'selected':''}" data-node="${n.id}" style="left:${Math.max(0,Math.min(918,+n.x||0))}px;top:${Math.max(0,Math.min(747,+n.y||0))}px"><img src="${image(n.id)}" alt=""><strong>${esc(item.name)}</strong>${readonly?'':`<button class="node-remove" data-remove="${n.id}" aria-label="${esc(item.name)} 카드 삭제">×</button>`}</div>`:''}).join('');
    if(!readonly)bindBoard(board);
  }
  function bindBoard(board){
    board.querySelector('svg').addEventListener('click',e=>{const hit=e.target.closest('[data-edge]');if(!hit)return;const i=Number(hit.dataset.edge);if(confirm('이 화살표를 지울까요?')){const before=boardSnapshot();state.edges.splice(i,1);rememberBoardEdit(before);refreshWebStage();}});
    for(const el of board.querySelectorAll('.node')){
      el.addEventListener('click',e=>{if(e.target.closest('[data-remove]')||!connecting)return;const id=el.dataset.node;if(!from){from=id;drawBoard(board,state,false);updateConnectHint();return;}
        if(from===id){from=null;drawBoard(board,state,false);updateConnectHint();return;}
        const a=getItem(from),b=getItem(id);
        if(a.category==='nonliving'||b.category==='nonliving'){toast('먹이그물은 생물 카드끼리만 연결해요.');return;}
        if(edgeType==='decompose'&&b.category!=='decomposer') {toast('분해 관계의 도착점은 버섯이나 세균이에요.');return;}
        const before=boardSnapshot();
        if(!state.edges.some(x=>x.from===from&&x.to===id&&x.type===edgeType))state.edges.push({from,to:id,type:edgeType});
        from=null;rememberBoardEdit(before);refreshWebStage();updateConnectHint();
      });
      el.addEventListener('pointerdown',e=>{
        if(connecting||e.target.closest('[data-remove]')||e.button>0)return;
        const node=state.nodes.find(n=>n.id===el.dataset.node);if(!node)return;
        e.preventDefault();el.setPointerCapture(e.pointerId);const before=boardSnapshot(),startX=e.clientX,startY=e.clientY,origX=node.x,origY=node.y;
        const move=ev=>{if(ev.pointerId!==e.pointerId)return;node.x=Math.round(Math.max(0,Math.min(918,origX+ev.clientX-startX)));node.y=Math.round(Math.max(0,Math.min(747,origY+ev.clientY-startY)));el.style.left=node.x+'px';el.style.top=node.y+'px';redrawLines(board);};
        const up=ev=>{if(ev.pointerId!==e.pointerId)return;el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);if(ev.type==='pointercancel'){node.x=origX;node.y=origY;drawBoard(board,state,false);return;}const changed=rememberBoardEdit(before);if(changed)refreshWebStage();else drawBoard(board,state,false);};
        el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
      });
    }
  }
  function redrawLines(board){const old=board.querySelector('svg');const temp=document.createElement('div');drawBoard(temp,state,true);const svg=temp.querySelector('svg');if(old&&svg)old.replaceWith(svg);const fresh=board.querySelector('svg');fresh?.addEventListener('click',e=>{const hit=e.target.closest('[data-edge]');if(hit){const i=Number(hit.dataset.edge);if(confirm('이 화살표를 지울까요?')){const before=boardSnapshot();state.edges.splice(i,1);rememberBoardEdit(before);refreshWebStage();}}});}
  function updateConnectHint(){const el=document.getElementById('connectHint');if(el)el.textContent=connecting?(from?'이제 도착 카드를 눌러 주세요.':'출발 카드를 눌러 주세요.'):'카드를 손가락이나 마우스로 끌어서 이동할 수 있어요.';}
  function addNode(id){if(!getItem(id)||getItem(id).category==='nonliving')return;if(state.nodes.some(x=>x.id===id)){toast('이미 활동판에 있는 카드예요.');return;}const before=boardSnapshot(),idx=state.nodes.length;state.nodes.push({id,x:30+(idx%5)*197,y:32+Math.floor(idx/5)*165});rememberBoardEdit(before);refreshWebStage();}
  function removeNode(id){if(!state.nodes.some(n=>n.id===id))return;const before=boardSnapshot();state.nodes=state.nodes.filter(n=>n.id!==id);state.edges=state.edges.filter(e=>e.from!==id&&e.to!==id);if(from===id)from=null;rememberBoardEdit(before);refreshWebStage();}
  function save(){
    if(!groupNo)return;
    state.finished=Boolean(state.finished);
    const payload=JSON.parse(JSON.stringify(state));
    const savingGroup=groupNo;
    if(!cloud){localStorage.setItem(localKey(groupNo),JSON.stringify(payload));setStatus('이 기기에 저장됨');return;}
    setStatus('저장 중…');clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{
      const n=savingGroup;const snapshot=JSON.parse(JSON.stringify(payload));
      saveChain=saveChain.catch(()=>{}).then(async()=>{
        const res=await supa.from('group_work').update({members:snapshot.members,activity:{classifications:snapshot.classifications,classificationResult:snapshot.classificationResult,nodes:snapshot.nodes,edges:snapshot.edges,note:snapshot.note,finished:snapshot.finished},updated_at:new Date().toISOString()}).eq('group_no',n);
        if(res.error)throw res.error;
        setStatus('자동 저장됨');
      }).catch(e=>{setStatus('저장 실패');toast('저장 오류: '+e.message);});
    },550);
  }
  function setStatus(txt){const el=document.getElementById('saveStatus');if(el)el.textContent=txt;}
  function removeChannel(){if(teacherPoll){clearInterval(teacherPoll);teacherPoll=null;}}
  function listenStudent(){removeChannel();}
  function teacherLogin(){
    mode='teacher-login';removeChannel();teacherPIN=null;
    view(`${topbar('교사 모드','입장코드 입력')}<div class="authbox"><div class="panel"><div class="eyebrow">TEACHER MODE</div><h2 style="margin:8px 0">교사용 입장코드</h2><form id="teacherForm"><div class="field"><label for="teacherPassword">입장코드</label><input type="password" id="teacherPassword" inputmode="numeric" pattern="[0-9]{5}" minlength="5" maxlength="5" autocomplete="off" required placeholder="숫자 5자리" autofocus></div><button class="btn block" type="submit">교사 화면 들어가기</button><div class="error" id="loginError" aria-live="polite"></div></form>${cloud?'':'<div class="notice">현재는 체험 모드입니다. 이 브라우저에 저장된 모둠 활동만 확인할 수 있습니다.</div>'}</div></div>`);
    document.getElementById('teacherPassword')?.focus();
  }
  async function doTeacherLogin(){
    const pwd=document.getElementById('teacherPassword').value;
    const errorEl=document.getElementById('loginError');
    errorEl.textContent='확인 중…';
    try{
      if(!cloud && pwd!=='00000')throw new Error('입장코드가 올바르지 않습니다.');
      teacherPIN=pwd;
      selectedGroup=1;
      await loadTeacherRows();
      teacher();
      listenTeacher();
    }catch(e){teacherPIN=null;errorEl.textContent=e.message||'입장코드 확인에 실패했습니다.';}
  }
  async function loadTeacherRows(){
    if(!cloud){
      teacherRows=[1,2,3,4,5,6].map(n=>({group_no:n,members:getLocal(n).members,activity:getLocal(n),updated_at:null}));
      return;
    }
    if(!teacherPIN)throw new Error('교사용 입장코드를 입력해 주세요.');
    // Supabase DB 함수가 비밀번호를 검사한 뒤 6개 모둠의 읽기 전용 자료만 돌려줍니다.
    const res=await supa.rpc('teacher_snapshot',{p_pin:teacherPIN});
    if(res.error)throw new Error(/invalid|password|비밀번호|28000/i.test(res.error.message)?'입장코드가 올바르지 않습니다.':res.error.message);
    teacherRows=Array.isArray(res.data)?res.data:[];
  }
  function listenTeacher(){
    removeChannel();
    if(!cloud)return;
    // 교사 화면은 로그인 없이 DB 함수에 접근하므로 3초마다 자동 새로고침합니다.
    teacherPoll=setInterval(async()=>{
      if(mode!=='teacher')return;
      try{
        const old=JSON.stringify(teacherRows);
        await loadTeacherRows();
        if(JSON.stringify(teacherRows)!==old)teacher(true);
      }catch(e){console.error('교사 화면 업데이트 실패',e);}
    },3000);
  }
  function teacher(preserveScroll=false){mode='teacher';const y=preserveScroll?window.scrollY:0;const row=teacherRows.find(r=>r.group_no===selectedGroup);const curr=normal(row?.activity);curr.members=row?.members||[];
    view(`<div id="teacherRoot" class="${projecting?'projecting':''}">${topbar('교사 모드','모둠 활동 실시간 공유')}<div class="teacher-overview"><div class="eyebrow">TEACHER DASHBOARD</div><div class="row spread" style="margin:8px 0 20px"><div><h1>우리 반 생태계 관찰실</h1><p class="muted small">6개 모둠을 확인하고 발표할 모둠을 선택하세요.${cloud?' (3초마다 자동 갱신)':''}</p></div><div class="row">${btn('새로고침','refresh-teacher','secondary sm')}${btn('로그아웃','teacher-logout','ghost sm')}</div></div></div><div class="teacher-grid">${[1,2,3,4,5,6].map(n=>{const r=teacherRows.find(x=>x.group_no===n),a=normal(r?.activity),mem=r?.members||[],cls=Object.keys(a.classifications||{}).filter(k=>a.classifications[k]).length;return `<button class="group-tile ${n===selectedGroup?'selected':''}" data-action="teacher-select" data-number="${n}"><div class="row spread"><h3>${n}모둠</h3>${a.finished?'<span class="badge">활동 완료</span>':'<span class="badge">활동 중</span>'}</div><div class="tile-names">${esc(mem.join(', ')||'아직 접속하지 않았어요')}</div><div class="row"><span class="stat">분류 ${cls}/${ITEM_COUNT}</span>${a.classificationResult?.submitted?`<span class="stat">정답 ${a.classificationResult.correctCount}/${ITEM_COUNT}</span>`:''}<span class="stat">카드 ${a.nodes.length}개</span><span class="stat">연결 ${a.edges.length}개</span></div></button>`}).join('')}</div><section class="teacher-detail"><div class="panel"><div class="detail-top"><div><div class="eyebrow">GROUP SHARING</div><h2 style="margin-top:6px">${selectedGroup}모둠의 먹이그물</h2><p class="muted small">모둠원: ${esc(curr.members.join(', ')||'미입력')}</p></div><div class="row">${btn(projecting?'발표 화면 닫기':'발표 화면 크게 보기','toggle-project','secondary sm')}${projecting?btn('다음 모둠 →','teacher-next','ghost sm'):''}</div></div><div class="canvas-shell"><div class="board" id="teacherBoard"></div></div><div class="legend" style="margin-top:12px"><span><i style="border-color:#2e8063"></i> 먹이 관계</span><span><i class="dotted" style="border-color:#a67735"></i> 분해 관계</span></div><div class="tip" style="margin-top:14px"><b>모둠의 생각:</b> ${esc(curr.note||'아직 작성하지 않았어요.')}</div><div class="row" style="margin-top:12px"><span class="stat">분류: ${Object.keys(curr.classifications).filter(k=>curr.classifications[k]).length} / ${ITEM_COUNT}</span>${curr.classificationResult?.submitted?`<span class="stat">정답: ${curr.classificationResult.correctCount}/${ITEM_COUNT}</span>`:''}<span class="stat">배치: ${curr.nodes.length}개</span><span class="stat">관계: ${curr.edges.length}개</span>${curr.finished?'<span class="badge">활동 완료</span>':''}</div></div></section></div>`);
    drawBoard(document.getElementById('teacherBoard'),curr,true);if(preserveScroll)window.scrollTo(0,y);
  }
  async function teacherLogout(){removeChannel();teacherPIN=null;teacherRows=[];landing();}
  function changeTab(t){tab=t;from=null;connecting=false;checked=Boolean(state.classificationResult?.submitted);selectedCard=null;student();}
  async function handleAction(e){
    const remove=e.target.closest('[data-remove]');if(remove){e.stopPropagation();removeNode(remove.dataset.remove);return;}
    if(mode==='student' && tab==='classify' && !checked){
      const card=e.target.closest('[data-class-card]');
      if(card){if(ignoreCardClick===card.dataset.classCard){ignoreCardClick=null;return;}selectedCard=selectedCard===card.dataset.classCard?null:card.dataset.classCard;renderStage();return;}
      const zone=e.target.closest('[data-drop-category]');
      if(zone&&selectedCard){assignClass(selectedCard,zone.dataset.dropCategory);return;}
    }
    const el=e.target.closest('[data-action]');if(!el)return;
    const act=el.dataset.action;
    try{
      if(act==='go-landing'||act==='landing'){landing();return;}
      if(act==='student-select'){studentSelect();return;}
      if(act==='teacher-login'){teacherLogin();return;}
      if(act==='join-group'){await joinGroup(Number(el.dataset.number));return;}
      if(act==='start-student'){startStudent();return;}
      if(act==='edit-members'){members();return;}
      if(act==='tab-classify'||act==='tab-web'){changeTab(act.slice(4));return;}
      if(act==='scroll-bank-up'||act==='scroll-bank-down'){
        document.querySelector('.sort-bank .bank-content')?.scrollBy({top:act==='scroll-bank-down'?320:-320,behavior:'smooth'});
        return;
      }
      if(act==='check-classification'){
        const count=ITEMS.filter(x=>state.classifications[x.id]).length;
        if(count!==ITEMS.length){toast(`아직 ${ITEMS.length-count}개의 카드를 분류하지 않았어요.`);return;}
        const correct=ITEMS.filter(x=>state.classifications[x.id]===x.category).length;
        state.classificationResult={submitted:true,correctCount:correct,total:ITEMS.length};
        checked=true;selectedCard=null;save();renderStage();return;
      }
      if(act==='retry-wrong'){
        for(const item of ITEMS)if(state.classifications[item.id]!==item.category)delete state.classifications[item.id];
        checked=false;selectedCard=null;state.classificationResult=null;save();renderStage();return;
      }
      if(act==='reset-classification'){
        state.classifications={};state.classificationResult=null;checked=false;selectedCard=null;save();renderStage();return;
      }
      if(act==='add-node'){addNode(el.dataset.id);return;}
      if(act==='toggle-connect'){connecting=!connecting;from=null;renderStage();return;}
      if(act==='undo-web'){if(mode==='student'&&tab==='web')undoBoard();return;}
      if(act==='redo-web'){if(mode==='student'&&tab==='web')redoBoard();return;}
      if(act==='clear-board'){if(mode==='student'&&tab==='web')clearBoard();return;}
      if(act==='clear-edges'){if(state.edges.length&&confirm('연결된 화살표만 모두 지울까요?')){const before=boardSnapshot();state.edges=[];from=null;rememberBoardEdit(before);refreshWebStage();}return;}
      if(act==='toggle-finished'){state.finished=!state.finished;save();renderStage();toast(state.finished?'활동 완료로 표시했어요.':'활동 완료 표시를 해제했어요.');return;}
      if(act==='teacher-select'){selectedGroup=Number(el.dataset.number);teacher(true);return;}
      if(act==='refresh-teacher'){await loadTeacherRows();teacher(true);return;}
      if(act==='toggle-project'){projecting=!projecting;teacher(true);if(projecting&&document.documentElement.requestFullscreen){document.documentElement.requestFullscreen().catch(()=>{});}else if(document.fullscreenElement){document.exitFullscreen().catch(()=>{});}return;}
      if(act==='teacher-next'){selectedGroup=selectedGroup%6+1;teacher(true);return;}
      if(act==='teacher-logout'){await teacherLogout();return;}
    }catch(err){toast('오류: '+err.message);}
  }
  document.addEventListener('click',handleAction);
  document.addEventListener('keydown',e=>{
    if(mode==='student'&&tab==='web'&&(e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='z'&&!e.target.closest('input,textarea,select,[contenteditable]')){
      e.preventDefault();
      if(e.shiftKey)redoBoard();else undoBoard();
      return;
    }
    if(mode==='student'&&tab==='classify'&&!checked&&selectedCard&&(e.key==='Enter'||e.key===' ')){const zone=e.target.closest('[data-drop-category]');if(zone){e.preventDefault();assignClass(selectedCard,zone.dataset.dropCategory);}}});
  document.addEventListener('change',e=>{
    if(e.target.id==='edge-type'){edgeType=e.target.value;from=null;updateConnectHint();drawBoard(document.getElementById('studentBoard'),state,false);}
    if(e.target.id==='note'){state.note=e.target.value.slice(0,2000);save();}
  });
  document.addEventListener('input',e=>{if(e.target.id==='note'){state.note=e.target.value.slice(0,2000);save();}});
  document.addEventListener('submit',e=>{if(e.target.id==='teacherForm'){e.preventDefault();doTeacherLogin();}});
  // 체험 모드에서는 같은 컴퓨터의 다른 탭에서 변경된 데이터도 읽어 옵니다.
  window.addEventListener('storage',e=>{
    if(cloud||mode!=='teacher'||!e.key?.startsWith('ecosystem-group-'))return;
    loadTeacherRows().then(()=>teacher(true)).catch(console.error);
  });
  landing();
})();
