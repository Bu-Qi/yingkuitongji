import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {units,money,dayOf,validate,summarize,netUSDT} from '../dist/ledger.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/local-history.json',import.meta.url)));
test('real server records reconcile to exact daily gas totals',()=>{const data=validate(fixture),days=summarize(data.transactions);assert.equal(data.transactions.length,33);assert.equal(money(days.reduce((s,d)=>s+d.gas,0n)),'3.981042');assert.deepEqual(days.map(d=>[d.date,d.count,money(d.gas)]),[['2026-11-11',3,'0.285672'],['2026-11-13',30,'3.69537']]);assert.equal(days.reduce((s,d)=>s+d.failed,0),2);assert.ok(days.every(d=>d.net===null));});
test('Beijing day boundary uses UTC+8',()=>{assert.equal(dayOf('2026-11-12T16:00:00.000Z'),'2026-11-13');assert.equal(dayOf('2026-11-12T15:59:59.999Z'),'2026-11-12');});
test('fees and different asset units are handled without floats',()=>{const r={kind:'swap',status:'success',reconciled:true,grossUSDT:'1.1',gasQKI:'0.13',qkiPriceUSDT:'0.8'};assert.equal(money(netUSDT(r)),'0.996');assert.equal(money(netUSDT({...r,grossUSDT:null,grossQKI:'0.5'})),'0.296');assert.equal(netUSDT({...r,reconciled:false}),null);assert.equal(netUSDT({...r,qkiPriceUSDT:null}),null);});
test('failed transactions consume gas and capital movements count only their costs',()=>{const r={kind:'swap',status:'reverted',gasQKI:'0.2',qkiPriceUSDT:'0.5'};assert.equal(money(netUSDT(r)),'-0.1');assert.equal(money(netUSDT({...r,status:'success',kind:'external-transfer',grossUSDT:'1000',reconciled:true})),'-0.1');assert.equal(money(netUSDT({...r,status:'success',kind:'withdraw',grossQKI:'100'})),'-0.1');});
test('a partial day never becomes an apparently complete P&L figure',()=>{const records=[{at:'2026-11-12T20:00:00Z',kind:'swap',status:'success',reconciled:true,grossUSDT:'2',gasQKI:'0.1',qkiPriceUSDT:'1'},{at:'2026-11-12T21:00:00Z',kind:'swap',status:'success',gasQKI:'0.1'}];const [d]=summarize(records);assert.equal(d.net,null);assert.equal(d.known,1);assert.equal(d.complete,false);});
test('import rejects duplicate hashes and malformed or negative costs',()=>{assert.throws(()=>validate({...fixture,transactions:[fixture.transactions[0],fixture.transactions[0]]}));assert.throws(()=>units('1e9'));assert.throws(()=>validate({...fixture,transactions:[{...fixture.transactions[0],gasQKI:'-1'}]}));assert.equal(money(units('0.000000000000000001'),18),'0.000000000000000001');});

test('native units show QKI gains less actual Gas without requiring a historical exchange rate',async()=>{
 const {nativeNet}=await import('../src/ledger.mjs');const n=nativeNet({kind:'swap',status:'success',reconciled:true,grossQKI:'1.1',gasQKI:'0.2'});assert.equal(money(n.qki),'0.9');assert.equal(money(n.usdt),'0');
});
test('USDT profit and QKI Gas stay separate; principal redemption cannot inflate profits',async()=>{
 const {nativeNet}=await import('../src/ledger.mjs');const r={kind:'swap',status:'success',reconciled:true,grossUSDT:'1.2',gasQKI:'0.3'};assert.deepEqual(nativeNet(r),{qki:units('-0.3'),usdt:units('1.2')});assert.deepEqual(nativeNet({...r,kind:'withdraw',grossQKI:'1000'}),{qki:units('-0.3'),usdt:0n});assert.deepEqual(nativeNet({...r,status:'reverted'}),{qki:units('-0.3'),usdt:0n});assert.equal(nativeNet({...r,reconciled:false}),null);
});
test('one unreconciled trade keeps the entire native total incomplete',async()=>{
 const {nativeTotals}=await import('../src/ledger.mjs');const t=nativeTotals([{kind:'swap',status:'success',reconciled:true,grossQKI:'1',gasQKI:'0.1'},{kind:'swap',status:'success',gasQKI:'0.1'}]);assert.equal(t.complete,false);assert.equal(t.known,1);assert.equal(t.qki,null);
});

test('current snapshot matches actual input/output differences and deducts every receipt Gas exactly once',async()=>{
 const {nativeTotals}=await import('../src/ledger.mjs');const d=validate(JSON.parse(fs.readFileSync(new URL('./fixtures/reconciled-history-42.json',import.meta.url))));assert.equal(d.transactions.length,42);
 for(const r of d.transactions){assert.equal(r.reconciled,true);assert.match(r.blockHash,/^0x[0-9a-fA-F]{64}$/);assert(Number.isInteger(r.blockNumber));if(r.kind==='swap'&&r.status==='success'){const gross=units(r.outputAmount)-units(r.inputAmount);assert.equal(gross,units(r.baseSymbol==='USDT'?r.grossUSDT:r.grossQKI));}}
 const n=nativeTotals(d.transactions);assert(n.complete);assert.equal(money(n.qki,18),'2.035200588040390065');assert.equal(money(n.usdt,18),'23.636503');
});
