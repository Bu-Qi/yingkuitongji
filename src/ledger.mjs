export const SCALE=10n**18n;
export function units(value){
 const s=String(value??'');if(!/^-?\d+(?:\.\d{1,18})?$/.test(s))throw Error('金额格式不正确，最多支持 18 位小数');
 const neg=s.startsWith('-'),[a,b='']=s.replace(/^-/,'').split('.');return (BigInt(a)*SCALE+BigInt(b.padEnd(18,'0')))*(neg?-1n:1n);
}
export function money(v,precision=6){if(v===null||v===undefined)return '—';const n=typeof v==='bigint'?v:units(v);const sign=n<0n?'-':'';const a=n<0n?-n:n;const whole=(a/SCALE).toString();const frac=(a%SCALE).toString().padStart(18,'0').slice(0,precision).replace(/0+$/,'');return sign+whole+(frac?'.'+frac:'');}
export function dayOf(at){const d=new Date(at);if(!Number.isFinite(d.valueOf()))throw Error('交易时间无效');const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}
export function validate(data){
 if(!data||!Array.isArray(data.transactions)||data.transactions.length>20000)throw Error('请导入包含 transactions 数组的 JSON 账本（最多 20,000 笔）');
 const seen=new Set();const transactions=data.transactions.map(r=>{
  if(!/^0x[0-9a-fA-F]{64}$/.test(r.hash)||seen.has(r.hash.toLowerCase()))throw Error('交易哈希无效或重复');seen.add(r.hash.toLowerCase());dayOf(r.at);
  if(!['success','reverted','failed'].includes(r.status))throw Error('交易状态无效');
  if(units(r.gasQKI)<0n)throw Error('Gas 成本不能小于零');
  for(const k of ['grossUSDT','grossQKI','qkiPriceUSDT','otherFeesUSDT'])if(r[k]!=null)units(r[k]);
  if(r.qkiPriceUSDT!=null&&units(r.qkiPriceUSDT)<=0n)throw Error('QKI 折算价格必须大于零');
  return {...r,hash:r.hash.toLowerCase()};
 });
 return {...data,transactions};
}
// Only reconciled, same-asset cyclic proceeds qualify as realized gross P&L.
// Deposits, withdrawals, wrapping and other capital movements never count as profit.
export function netUSDT(r){
 if(r.qkiPriceUSDT==null)return null;
 const price=units(r.qkiPriceUSDT),gas=units(r.gasQKI)*price/SCALE;
 if(['transfer','external-transfer','deposit','withdraw','rebalance'].includes(r.kind))return -gas-(r.otherFeesUSDT==null?0n:units(r.otherFeesUSDT));
 if(r.status!=='success')return -gas-(r.otherFeesUSDT==null?0n:units(r.otherFeesUSDT));
 if(r.kind==='approve'||r.kind==='approve-reset')return -gas;
 if(r.kind!=='swap'||r.reconciled!==true||(r.grossUSDT==null&&r.grossQKI==null))return null;
 return (r.grossUSDT==null?0n:units(r.grossUSDT))+(r.grossQKI==null?0n:units(r.grossQKI)*price/SCALE)-gas-(r.otherFeesUSDT==null?0n:units(r.otherFeesUSDT));
}
// QKI and WQKI are counted in the same native unit; no USDT exchange rate is inferred.
export function nativeNet(r){
 if(r.reconciled!==true)return null;
 const gas=units(r.gasQKI),other=r.otherFeesUSDT==null?0n:units(r.otherFeesUSDT);
 if(r.status!=='success'||['approve','approve-reset','withdraw','deposit','rebalance','transfer','external-transfer'].includes(r.kind))return {qki:-gas,usdt:-other};
 if(r.kind!=='swap'||(r.grossQKI==null&&r.grossUSDT==null))return null;
 return {qki:(r.grossQKI==null?0n:units(r.grossQKI))-gas,usdt:(r.grossUSDT==null?0n:units(r.grossUSDT))-other};
}
export function nativeTotals(records){
 let qki=0n,usdt=0n,known=0;
 for(const r of records){const n=nativeNet(r);if(n){known++;qki+=n.qki;usdt+=n.usdt;}}
 return {qki:known===records.length?qki:null,usdt:known===records.length?usdt:null,known,complete:records.length>0&&known===records.length};
}
export function summarize(records){
 const byDay=new Map();for(const r of records){const date=dayOf(r.at);if(!byDay.has(date))byDay.set(date,{date,count:0,swaps:0,success:0,failed:0,gas:0n,net:0n,known:0,records:[]});const d=byDay.get(date),net=netUSDT(r);d.count++;d.swaps+=Number(r.kind==='swap');d.success+=Number(r.status==='success');d.failed+=Number(r.status!=='success');d.gas+=units(r.gasQKI);d.records.push(r);if(net!==null){d.known++;d.net+=net;}}
 return [...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({...d,complete:d.known===d.count,net:d.known===d.count?d.net:null,native:nativeTotals(d.records)}));
}
