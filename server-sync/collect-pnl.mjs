import fs from 'node:fs';
import path from 'node:path';
import {formatUnits,Interface} from 'ethers';
import {networkRPC,atomicJSON} from './control.mjs';
import {CHAIN,RPCS} from '../lib/config.mjs';
import {routerABI} from '../lib/engine.mjs';
const data=process.env.QKI_DATA_DIR??'/var/lib/qki-arbitrage';
const config=JSON.parse(fs.readFileSync('/etc/qki-arbitrage/config.json'));
const owner=config.scan.owner.toLowerCase(),rpc=config.scan.rpc==='auto'?'https://rpc1.qkiscan.io':config.scan.rpc;
if(!RPCS.some(u=>new URL(u).href===new URL(rpc).href))throw Error('Unexpected ledger RPC');
const eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const erc=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const cacheFile=path.join(data,'pnl-github-cache.json');
let cache={transactions:[]};try{cache=JSON.parse(fs.readFileSync(cacheFile));}catch(e){if(e.code!=='ENOENT')throw e;}
const records=new Map(cache.transactions.map(r=>[r.hash.toLowerCase(),r]));
const state=JSON.parse(fs.readFileSync(path.join(data,'execution-state.json')));
const [chain,head]=await Promise.all([networkRPC(rpc,'eth_chainId'),networkRPC(rpc,'eth_getBlockByNumber',['latest',false])]);
if(BigInt(chain)!==BigInt(CHAIN.id))throw Error('Wrong reconciliation chain');
const age=Date.now()/1000-Number(BigInt(head.timestamp));if(age>120||age< -10)throw Error('Stale ledger RPC');
const blocks=new Map(),errors=[];
for(const original of state.history??[]){
 const existing=records.get(original.hash.toLowerCase());
 if(existing?.reconciled&&Number(BigInt(head.number))-existing.blockNumber>=12)continue;
 const row={hash:original.hash,kind:original.kind,status:original.status,gasQKI:original.gasQKI,at:original.at,reconciled:false};
 try{
  const [tx,receipt]=await Promise.all([networkRPC(rpc,'eth_getTransactionByHash',[row.hash]),networkRPC(rpc,'eth_getTransactionReceipt',[row.hash])]);
  if(!tx||!receipt||!eq(tx.from,owner)||!eq(receipt.transactionHash,row.hash))throw Error('Missing or mismatched receipt');
  let block=blocks.get(receipt.blockNumber);if(!block){block=await networkRPC(rpc,'eth_getBlockByNumber',[receipt.blockNumber,false]);blocks.set(receipt.blockNumber,block);}
  if(!eq(block.hash,receipt.blockHash))throw Error('Receipt not canonical');
  Object.assign(row,{localAt:original.at,at:new Date(Number(BigInt(block.timestamp))*1000).toISOString(),blockNumber:Number(BigInt(receipt.blockNumber)),blockHash:receipt.blockHash,gasQKI:formatUnits(BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice??tx.gasPrice),18),status:BigInt(receipt.status)===1n?'success':'reverted',grossQKI:'0',grossUSDT:'0',reconciled:true,reconciliation:'canonical-receipt'});
  if(row.status==='success'&&row.kind==='swap'){
   if(!eq(tx.to,CHAIN.router))throw Error('Unknown swap destination');
   const parsed=routerABI.parseTransaction({data:tx.input??tx.data,value:tx.value});
   const native=parsed.name==='swapExactQKIForTokensSupportingFeeOnTransferTokens';
   if(!native&&parsed.name!=='swapExactTokensForTokensSupportingFeeOnTransferTokens')throw Error('Unsupported swap selector');
   const a=parsed.args,route=[...(native?a[1]:a[2])],recipient=native?a[2]:a[3];
   if(!eq(recipient,owner)||!eq(route[0],route.at(-1)))throw Error('Not a closed self-recipient cycle');
   const base=eq(route[0],CHAIN.wqki)?(native?'QKI':'WQKI'):eq(route[0],CHAIN.usdt)?'USDT':null;
   if(!base||native&&base!=='QKI')throw Error('Unknown input asset');
   const token=base==='USDT'?CHAIN.usdt:CHAIN.wqki;let delta=0n;
   for(const log of receipt.logs??[]){if(!eq(log.address,token))continue;try{const event=erc.parseLog(log);if(eq(event.args.to,owner))delta+=event.args.value;if(eq(event.args.from,owner))delta-=event.args.value;}catch{}}
   const input=BigInt(native?tx.value:a[0]),output=delta+(native?0n:input),decimals=base==='USDT'?6:18;
   if(input<=0n||output<=0n)throw Error('Missing actual input/output');
   Object.assign(row,{baseSymbol:base,path:route,inputAmount:formatUnits(input,decimals),outputAmount:formatUnits(output,decimals),outputAsset:base==='USDT'?'USDT':'WQKI',grossQKI:base==='USDT'?'0':formatUnits(delta-(native?input:0n),18),grossUSDT:base==='USDT'?formatUnits(delta,6):'0',reconciliation:'canonical-receipt-and-token-transfers'});
  }else if(row.status==='success'&&!['approve','approve-reset','withdraw','deposit','rebalance'].includes(row.kind))throw Error('Unknown non-swap operation');
  records.set(row.hash.toLowerCase(),row);
 }catch(error){errors.push({hash:row.hash,error:error.message});if(existing?.reconciled)throw Error('Could not reconfirm recent history; retaining last published ledger');row.reconciled=false;delete row.grossQKI;delete row.grossUSDT;row.reconciliationError=error.message;records.set(row.hash.toLowerCase(),row);}
}
const transactions=[...records.values()].sort((a,b)=>a.at.localeCompare(b.at));
if(transactions.length===0||transactions.length>20000)throw Error('Empty or oversized ledger');
const snapshot={version:3,syncMode:'automatic',syncStatus:'ok',source:'server-history-and-canonical-chain-receipts',asOf:new Date().toISOString(),timezone:'Asia/Shanghai',accountingStatus:errors.length?'partially-reconciled':'native-currency-reconciled',coverage:'Robot local history only; incremental sync; QKI/WQKI and USDT remain separate',transactions};
const body=JSON.stringify(snapshot);if(Buffer.byteLength(body)>8000000)throw Error('Ledger exceeds sync size limit');
atomicJSON(cacheFile,snapshot);
console.log(JSON.stringify({event:'pnl-collected',asOf:snapshot.asOf,count:transactions.length,unreconciled:errors.length}));
