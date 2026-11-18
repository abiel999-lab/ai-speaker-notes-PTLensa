import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const src=fs.readFileSync('/source/chat.js','utf8');new vm.Script(src);
const loaders=src.slice(src.indexOf('async function loadHistory()'),src.indexOf("chatInput.addEventListener('input'"));
function setup(){const c=vm.createContext({fetch:null,apiHeaders:x=>x,location:{href:''}});vm.runInContext("let selectedJob='a',historyEpoch=0;let rendered=[];function renderHistory(d,g){rendered.push([d,g]);}",c);vm.runInContext(loaders,c);return c;}
for(const mode of ['after-fetch','after-json','aba','general']){
 const c=setup();let response,body;c.fetch=()=>new Promise(r=>response=r);const task=vm.runInContext(mode==='general'?"selectedJob=null;loadGeneralHistory()":"loadHistory()",c);
 if(mode==='after-json'){response({ok:true,status:200,json:()=>new Promise(r=>body=r)});await new Promise(setImmediate);vm.runInContext("selectedJob='b';historyEpoch++",c);body({owner:'a'});}
 else{vm.runInContext(mode==='aba'?"historyEpoch+=2;selectedJob='a'":"historyEpoch++;selectedJob='b'",c);response({ok:true,status:200,json:async()=>({owner:'a'})});}
 await task;assert.equal(vm.runInContext('rendered.length',c),0,mode);
}
const c=setup();c.fetch=async()=>({ok:true,status:200,json:async()=>({message:'current'})});await vm.runInContext('loadHistory()',c);assert.equal(vm.runInContext('rendered.length',c),1);
const storage=src.slice(src.indexOf('function rememberScope()'),src.indexOf('function stopPolling()'));const sc=vm.createContext({localStorage:{setItem(){throw Error('blocked')},getItem(){throw Error('blocked')}}});vm.runInContext("let selectedJob='a';"+storage,sc);assert.equal(vm.runInContext('rememberScope();recalledScope()',sc),null);
assert.ok(src.includes('async function selectGeneral(){historyEpoch++'));assert.ok(src.includes('async function selectJob(id,job){historyEpoch++'));
console.log(JSON.stringify({passed:true,lateFetch:true,lateJson:true,abaScope:true,generalToDeck:true,currentScopeRenders:true,blockedStorage:true,paidCalls:0}));

