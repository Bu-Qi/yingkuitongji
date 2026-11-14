import {validate,summarize,netUSDT,nativeNet,nativeTotals,units,money,dayOf} from './ledger.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateTime=at=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(at));
const kindNames={swap:'套利兑换',approve:'代币授权','approve-reset':'重置授权',withdraw:'WQKI 提取',deposit:'QKI 包装',rebalance:'资金调整','external-transfer':'外部转账',transfer:'外部转账'};
let initial,data,selectedDay='',page=1;const PAGE_SIZE=8;
const storage={get(){try{return localStorage.getItem('qki-ledger-import-v1');}catch{return null;}},set(value){try{localStorage.setItem('qki-ledger-import-v1',value);return true;}catch{return false;}},remove(){try{localStorage.removeItem('qki-ledger-import-v1');}catch{}}};
let toastTimer;function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
function currentRecords(){const from=$('#date-from').value,to=$('#date-to').value;return data.transactions.filter(r=>{const d=dayOf(r.at);return(!from||d>=from)&&(!to||d<=to)});}
function range(){const all=summarize(data.transactions);return {min:all[0]?.date??dayOf(data.asOf),max:dayOf(data.asOf??new Date().toISOString())};}
function applyRange(value){const {min,max}=range();$('#date-to').value=max;if(value==='all')$('#date-from').value=min;else{const d=new Date(max+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-Number(value)+1);$('#date-from').value=d.toISOString().slice(0,10);}$$('[data-range]').forEach(b=>b.classList.toggle('selected',b.dataset.range===value));selectedDay='';page=1;render();}
function pnlCell(value){return value===null?'<span class="zero-note" title="缺少实际成交收支或同期折算价">待核算</span>':`<span class="amount ${value>=0n?'pnl-positive':'pnl-negative'}">${value>0n?'+':''}${money(value)}</span>`;}
function nativeCell(n){return n===null?pnlCell(null):pnlCell(n.qki)+' <small>QKI</small><br>'+pnlCell(n.usdt)+' <small>USDT</small>';}
function render(){
 const rows=currentRecords(),days=summarize(rows),count=rows.length,success=rows.filter(r=>r.status==='success').length,failed=count-success,gas=rows.reduce((s,r)=>s+units(r.gasQKI),0n),native=nativeTotals(rows),known=native.known;
 const complete=native.complete;
 $('#net').innerHTML=nativeCell(complete?native:null);
 $('#net-detail').innerHTML=complete?'<span class="tag green">原币已核算</span> 已扣 Gas；QKI 含 WQKI，不与 USDT 强行合并':`<span class="tag amber">待核算</span> ${count-known} 笔金额未齐，不按零计算`;
 $('#gas').innerHTML=money(gas)+' <small>QKI</small>';$('#count').innerHTML=count+' <small>笔</small>';
 $('#count-detail').textContent=`其中 ${rows.filter(r=>r.kind==='swap').length} 笔套利兑换 · 其余为授权或资金操作`;
 $('#success').innerHTML=(count?(success/count*100).toFixed(1):'—')+' <small>%</small>';
 $('#success-detail').textContent=`${success} 笔成功 / ${failed} 笔失败 · 非盈利胜率`;
 $('#verified-count').textContent=known;$('#local-count').textContent=count+' 笔';$('#missing-count').textContent=(count-known)+' 笔';$('#ring').style.background=`conic-gradient(#688b50 ${count?known/count*360:0}deg,#edf0e9 0deg)`;
 $('#day-count').textContent=days.length+' 个有本地记录的日期';
 $('#daily-body').innerHTML=days.length?[...days].reverse().map(d=>`<tr><td><button class="date-button" data-day="${d.date}">${d.date}</button></td><td>${d.count} <span class="zero-note">/ ${d.swaps}</span></td><td>${d.success} <span class="zero-note">/ ${d.failed}</span></td><td class="amount">${money(d.gas)}</td><td>${nativeCell(d.native.complete?d.native:null)}</td><td><span class="tag ${d.native.complete?'green':'amber'}">${d.native.complete?'原币已核算':`待补全 ${d.count-d.native.known} 笔`}</span></td><td><button class="date-button" aria-label="查看 ${d.date} 的交易" data-day="${d.date}">↗</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty-cell">这个日期范围没有本地交易记录。</td></tr>';
 $$('[data-day]').forEach(b=>b.addEventListener('click',()=>{selectedDay=b.dataset.day;page=1;renderTransactions();$('#transactions').scrollIntoView({behavior:'smooth'});}));
 renderChart(days);renderTransactions();
 const notice=$('#notice');notice.hidden=false;notice.innerHTML=complete?'<div><strong>实际收支已核对，按原币显示盈亏</strong><p>按链上转账日志核对投入和到账，已扣除实际 Gas。QKI 包含 WQKI 等值数量；没有历史汇率时，两种币分别展示。仅覆盖机器人本地记录，当前为快照。</p></div>':'<div><strong>仍有收支待核对</strong><p>未核对的交易不按零计算，完整日盈亏需等全部收支核对后显示。</p></div>';
 $('#data-updated').textContent='快照时间：'+dateTime(data.asOf??initial.asOf);
 $('#snapshot-time').textContent='快照 · '+dateTime(data.asOf??initial.asOf).slice(0,10);
 $('#data-source').textContent=data===initial?'来源：机器人本地历史 + 链上回执核对':'来源：本浏览器导入的账本 · 不会上传到服务器';
 $('#reset-data').hidden=data===initial;if(data!==initial)$('#sync-status').textContent='正在查看本浏览器导入账本，暂停跟随服务器';
}
function renderChart(days){
 if(!days.length){$('#chart').innerHTML='<div class="loading">暂无可绘制的本地记录</div>';return;}
 const start=new Date((days[0].date)+'T00:00:00Z'),end=new Date(days.at(-1).date+'T00:00:00Z'),map=new Map(days.map(d=>[d.date,d]));
 const dates=[];for(let d=new Date(start);d<=end&&dates.length<366;d.setUTCDate(d.getUTCDate()+1))dates.push(d.toISOString().slice(0,10));
 const w=700,h=210,left=43,right=15,top=24,bottom=35,max=Math.max(...days.map(d=>Number(money(d.gas,12))),.01)*1.18,plotH=h-top-bottom,plotW=w-left-right;
 let svg=`<svg role="img" aria-label="${esc(days.map(d=>d.date+' Gas '+money(d.gas)+' QKI').join('；'))}" viewBox="0 0 ${w} ${h}">`;
 for(let i=0;i<4;i++){const value=max*i/3,y=h-bottom-plotH*i/3;svg+=`<line x1="${left}" x2="${w-right}" y1="${y}" y2="${y}" stroke="#eef1e9" stroke-dasharray="3 4"/><text x="${left-10}" y="${y+3}" text-anchor="end">${value.toFixed(2)}</text>`;}
 dates.forEach((date,i)=>{const d=map.get(date),x=left+plotW*(i+.5)/dates.length,barW=Math.min(60,plotW/dates.length*.4),value=d?Number(money(d.gas,12)):0,height=plotH*value/max;
  if(d)svg+=`<rect class="bar" x="${x-barW/2}" y="${h-bottom-height}" width="${barW}" height="${Math.max(2,height)}" rx="3" fill="#b6c99e"><title>${date}：${money(d.gas)} QKI · ${d.count} 笔交易</title></rect><text x="${x}" y="${h-bottom-height-9}" text-anchor="middle" style="fill:#718263">${money(d.gas,3)}</text>`;
  else svg+=`<rect x="${x-barW/2}" y="${h-bottom-3}" width="${barW}" height="3" rx="1" fill="#e8ece2"/><text x="${x}" y="${h-bottom-14}" text-anchor="middle" font-size="8">无本地记录</text>`;
  if(dates.length<15||i%Math.ceil(dates.length/10)===0)svg+=`<text x="${x}" y="${h-12}" text-anchor="middle">${date.slice(5).replace('-',' / ')}</text>`;
 });$('#chart').innerHTML=svg+'</svg>';
}
function detailRecords(){
 const query=$('#search').value.trim().toLowerCase(),status=$('#status-filter').value;
 return currentRecords().filter(r=>(!selectedDay||dayOf(r.at)===selectedDay)&&(!query||r.hash.includes(query))&&(status==='all'||(status==='success'?r.status==='success':r.status!=='success'))).sort((a,b)=>b.at.localeCompare(a.at));
}
function renderTransactions(){
 const rows=detailRecords();
 const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.max(1,Math.min(page,pages));
 $('#transaction-body').innerHTML=rows.length?rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(r=>{const stamp=dateTime(r.at).split(' ');return `<tr><td>${esc(stamp[0])}<span class="time-sub">${esc(stamp[1])}</span></td><td><button class="hash-button" data-hash="${r.hash}" title="复制完整交易哈希">${r.hash.slice(0,9)}…${r.hash.slice(-7)} ⧉</button></td><td>${esc(kindNames[r.kind]??'其他操作')}</td><td><span class="tag ${r.status==='success'?'green':'red'}">${r.status==='success'?'成功':'失败'}</span></td><td class="amount">${money(r.gasQKI)}</td><td>${r.inputAmount==null?'—':esc(r.inputAmount)+' '+esc(r.baseSymbol)}<span class="time-sub">${r.outputAmount==null?(r.reconciled?'无套利成交收支':'收支待核对'):'到账 '+esc(r.outputAmount)+' '+esc(r.outputAsset)}</span></td><td>${nativeCell(nativeNet(r))}</td></tr>`;}).join(''):'<tr><td colspan="7" class="empty-cell">没有符合筛选条件的交易。</td></tr>';
 $('#detail-day').textContent=selectedDay||'';$('#clear-day').hidden=!selectedDay;$('#records-count').textContent=`共 ${rows.length} 笔本地记录 · 点击哈希复制`;
 $('#page-label').textContent=page+' / '+pages;$('#prev').disabled=page<=1;$('#next').disabled=page>=pages;
 $$('[data-hash]').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.hash);toast('完整交易哈希已复制');}catch{toast('当前浏览器不允许复制，请导出 CSV 获取完整哈希');}}));
}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvCell(value){let s=String(value??'');if(/^[=+@\t\r-]/.test(s)&&!/^[-+]?\d+(\.\d+)?$/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
$('#export-btn').addEventListener('click',()=>{const rows=detailRecords(),header=['北京时间日期','区块确认时间UTC','交易哈希','类型','状态','Gas_QKI','投入数量','投入币种','实际到账','到账币种','净盈亏_QKI含WQKI','净盈亏_USDT','金额完整性'];const values=rows.map(r=>{const n=nativeNet(r);return [dayOf(r.at),r.at,r.hash,kindNames[r.kind]??r.kind,r.status,money(r.gasQKI,18),r.inputAmount??'',r.baseSymbol??'',r.outputAmount??'',r.outputAsset??'',n===null?'':money(n.qki,18),n===null?'':money(n.usdt,18),n===null?'待核算':'原币已核算'];});download('qki-daily-ledger.csv','\ufeff'+[header,...values].map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');toast(`已导出 ${rows.length} 笔记录；未知盈亏保留为空`);});
$('#import-btn').addEventListener('click',()=>$('#import-file').click());
$('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>15*1024*1024)throw Error('账本文件请小于 15 MB');const next=validate(JSON.parse(await file.text()));if(!next.asOf||!Number.isFinite(new Date(next.asOf).valueOf()))throw Error('账本缺少有效的 asOf 快照时间');data=next;const saved=storage.set(JSON.stringify(next));selectedDay='';page=1;applyRange('all');toast(saved?'账本已导入，仅保存在当前浏览器':'账本已载入；浏览器限制存储，刷新后需重新导入');}catch(error){toast('导入失败：'+error.message);}e.target.value='';});
$('#reset-data').addEventListener('click',()=>{storage.remove();data=initial;selectedDay='';page=1;applyRange('all');toast('已恢复服务器快照');});
$$('[data-range]').forEach(b=>b.addEventListener('click',()=>applyRange(b.dataset.range)));
['#date-from','#date-to'].forEach(s=>$(s).addEventListener('change',()=>{if($('#date-from').value&&$('#date-to').value&&$('#date-from').value>$('#date-to').value){toast('开始日期不能晚于结束日期');return;}$$('[data-range]').forEach(b=>b.classList.remove('selected'));selectedDay='';page=1;render();}));
$('#search').addEventListener('input',()=>{page=1;renderTransactions();});$('#status-filter').addEventListener('change',()=>{page=1;renderTransactions();});$('#prev').addEventListener('click',()=>{page--;renderTransactions();});$('#next').addEventListener('click',()=>{page++;renderTransactions();});$('#clear-day').addEventListener('click',()=>{selectedDay='';page=1;renderTransactions();});
$$('.sidebar nav a').forEach(a=>a.addEventListener('click',()=>{$$('.sidebar nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active');}));
try{initial=validate(JSON.parse($('#ledger-snapshot').textContent));data=initial;try{const stored=storage.get();if(stored){const cached=validate(JSON.parse(stored));if(!cached.asOf||!Number.isFinite(new Date(cached.asOf).valueOf()))throw Error('导入快照时间无效');data=cached;}}catch{storage.remove();}applyRange('all');}catch(error){$('#notice').innerHTML='<div><strong>交互功能加载失败，默认明细仍可查看</strong><p>'+esc(error.message)+'，请刷新页面或导入账本。</p></div>';toast(error.message);}

let synchronizing=false;
async function syncLedger(){
 if(synchronizing||data!==initial||document.hidden)return;
 synchronizing=true;
 try{
  const response=await fetch('https://raw.githubusercontent.com/Bu-Qi/yingkuitongji/ledger-data/history.json?refresh='+Math.floor(Date.now()/60000),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('同步接口 HTTP '+response.status);
  const next=validate(await response.json());if(!next.asOf||!Number.isFinite(Date.parse(next.asOf)))throw Error('同步数据时间无效');
  if(Date.parse(next.asOf)<Date.parse(initial.asOf))throw Error('接口返回了旧账本');
  const followedEnd=$('#date-to').value===dayOf(initial.asOf);
  initial=next;data=initial;if(followedEnd)$('#date-to').value=dayOf(next.asOf);render();
  const stale=Date.now()-Date.parse(next.asOf)>15*60*1000;
  const automatic=next.syncMode==='automatic';
  $('#sync-status').textContent=next.syncStatus==='blocked-cloudflare'?'自动同步受阻 · 显示最近手动更新':!automatic?'已手动更新 · 自动同步未启用':stale?'已超过 15 分钟未更新':'自动同步正常 · 约每 5 分钟采集';
  $('#sync-status').className=automatic&&!stale?'pnl-positive':'amber-text';
 }catch(error){$('#sync-status').textContent='同步暂不可用，保留上次有效账本';$('#sync-status').className='amber-text';}
 finally{synchronizing=false;}
}
if(typeof fetch==='function'){syncLedger();setInterval(syncLedger,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncLedger();});}
