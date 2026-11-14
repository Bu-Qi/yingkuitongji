import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
const snapshot=JSON.parse(fs.readFileSync(new URL('../dist/history.json',import.meta.url)));const count=snapshot.transactions.length,failures=snapshot.transactions.filter(r=>r.status!=='success').length,dates=new Set(snapshot.transactions.map(r=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.at))));
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
function open({blocked=false,corrupt=false,scripts=true}={}){
 const errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://fixture.invalid/',runScripts:scripts?'dangerously':'outside-only',virtualConsole:console,beforeParse(window){
  window.fetch=()=>{throw Error('Secondary network requests are unavailable');};
  window.HTMLElement.prototype.scrollIntoView=()=>{};
  if(blocked)Object.defineProperty(window,'localStorage',{get(){throw new window.DOMException('Storage blocked','SecurityError');}});
  else if(corrupt)window.localStorage.setItem('qki-ledger-import-v1','broken json');
 }});
 return {dom,d:dom.window.document,errors};
}
test('default details remain readable without JavaScript or secondary network resources',()=>{
 const {dom,d}=open({scripts:false});try{assert.equal(d.querySelectorAll('#transaction-body tr').length,count);assert.equal(d.querySelectorAll('#daily-body tr').length,dates.size);assert.match(d.querySelector('#gas').textContent,/QKI/);assert.equal(d.querySelectorAll('script[src],link[rel=stylesheet]').length,0);}finally{dom.window.close();}
});
for(const options of [{},{blocked:true},{corrupt:true}])test('ledger initializes and filters with '+JSON.stringify(options),()=>{
 const {dom,d,errors}=open(options);try{
 assert.deepEqual(errors,[]);assert.match(d.querySelector('#records-count').textContent,new RegExp('共 '+count+' 笔'));assert.equal(d.querySelectorAll('#transaction-body tr').length,8);
 const hash=d.querySelector('[data-hash]').dataset.hash;d.querySelector('#next').click();assert.equal(d.querySelector('#page-label').textContent,'2 / '+Math.ceil(count/8));assert.notEqual(d.querySelector('[data-hash]').dataset.hash,hash);
 const filter=d.querySelector('#status-filter');filter.value='failed';filter.dispatchEvent(new dom.window.Event('change'));assert.equal(d.querySelectorAll('#transaction-body tr').length,Math.min(8,failures));assert.match(d.querySelector('#records-count').textContent,new RegExp('共 '+failures+' 笔'));
 filter.value='all';filter.dispatchEvent(new dom.window.Event('change'));d.querySelector('[data-day="2026-11-11"]').click();assert.equal(d.querySelectorAll('#transaction-body tr').length,3);d.querySelector('#clear-day').click();assert.match(d.querySelector('#records-count').textContent,new RegExp('共 '+count+' 笔'));
 const search=d.querySelector('#search');search.value=hash;search.dispatchEvent(new dom.window.Event('input'));assert.equal(d.querySelectorAll('#transaction-body tr').length,1);assert.equal(d.querySelector('[data-hash]').dataset.hash,hash);
 }finally{dom.window.close();}
});
