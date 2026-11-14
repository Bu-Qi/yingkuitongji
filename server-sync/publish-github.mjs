import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root='/var/lib/qki-ledger-github',repo=path.join(root,'repository');
const key=path.join(root,'id_ed25519'),hosts=path.join(root,'known_hosts');
const remote='git@github.com:Bu-Qi/yingkuitongji.git';
const snapshot='/var/lib/qki-arbitrage/pnl-github-cache.json';
// This module only reads the reconciled public snapshot and pushes to one repository.
// The key and known_hosts must be provisioned separately; they never enter Git.
if(!fs.existsSync(key)||!fs.existsSync(hosts))throw Error('GitHub deploy key/verified known_hosts not provisioned');
const env={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_SSH_COMMAND:`ssh -i ${key} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${hosts}`};
function git(args,options={}){return execFileSync('git',args,{cwd:repo,env,encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe'],...options}).trim();}
const data=JSON.parse(fs.readFileSync(snapshot,'utf8'));
if(data.syncMode!=='automatic'||data.syncStatus!=='ok'||!Array.isArray(data.transactions)||!data.transactions.length||!Number.isFinite(Date.parse(data.asOf)))throw Error('Invalid reconciled snapshot');
if(Math.abs(Date.now()-Date.parse(data.asOf))>10*60*1000)throw Error('Collector snapshot is stale');
const allowedRoot=['version','syncMode','syncStatus','source','asOf','timezone','accountingStatus','coverage','transactions'];
if(Object.keys(data).some(k=>!allowedRoot.includes(k)))throw Error('Unexpected snapshot fields');
const allowedRow=['hash','kind','status','gasQKI','at','reconciled','localAt','blockNumber','blockHash','grossQKI','grossUSDT','reconciliation','baseSymbol','path','inputAmount','outputAmount','outputAsset','reconciliationError'];
if(data.transactions.some(r=>Object.keys(r).some(k=>!allowedRow.includes(k))))throw Error('Unexpected transaction fields');
fs.mkdirSync(repo,{recursive:true,mode:0o700});
if(!fs.existsSync(path.join(repo,'.git'))){git(['init']);git(['checkout','-b','ledger-data']);git(['remote','add','origin',remote]);}
if(git(['remote','get-url','origin'])!==remote)throw Error('Unexpected GitHub repository');
const refs=git(['ls-remote','--heads','origin','refs/heads/ledger-data']);
if(refs){git(['fetch','origin','ledger-data']);git(['checkout','-B','ledger-data','FETCH_HEAD']);}
fs.writeFileSync(path.join(repo,'history.json'),JSON.stringify(data,null,2)+'\n',{mode:0o600});
git(['add','--','history.json']);
if(git(['diff','--cached','--name-only'])){
 git(['-c','user.name=QKI ledger sync','-c','user.email=qki-ledger-sync@users.noreply.github.com','commit','-m','Update reconciled QKI ledger '+data.asOf]);
 git(['push','origin','HEAD:refs/heads/ledger-data']);
}
console.log(JSON.stringify({event:'github-ledger-published',asOf:data.asOf,count:data.transactions.length}));
