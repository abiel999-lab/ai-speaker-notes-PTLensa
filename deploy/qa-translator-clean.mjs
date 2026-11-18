import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('/source/workspace.js','utf8'),html=fs.readFileSync('/source/production.html','utf8');
for(const blocked of [false,true]){
 const nodes=new Map(),calls=[];function element(){return {hidden:false,value:'',files:[],style:{},options:[],handlers:{},classList:{},addEventListener(n,f){this.handlers[n]=f},add(v){this.options.push(v)},append(){},replaceChildren(){},closest(){return element()},scrollIntoView(){}}}
 const $=s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s)};$('#job-status').hidden=true;
 const api=async url=>{calls.push(url);let data=url==='/api/session'?{authenticated:true,csrf_token:'fixture'}:url==='/api/languages'?{languages:['auto','English','Indonesian']}:url==='/api/account'?{account:{plan:'pro',plan_name:'Pro',credits:{total:746}}}:url==='/api/jobs'?{jobs:[{id:'old-job',status:'completed',filename:'fixture.pptx',target:'English',slides:1}]}:{status:'completed',message:'fixture done'};return {ok:true,status:200,json:async()=>data}};
 const context={document:{querySelector:$,createElement:element},localStorage:{getItem(){if(blocked)throw Error();return'old-job'},removeItem(){if(blocked)throw Error()}},window:{addEventListener(){},dispatchEvent(){}},location:{hash:'',pathname:'/',replace(){}},history:{replaceState(){}},fetch:api,AbortSignal,Option:function(text,value){this.text=text;this.value=value},CustomEvent:class{},crypto:{randomUUID(){return'fixture'}},confirm:()=>false,setTimeout};
 vm.runInNewContext(source,context);for(let i=0;i<5;i++)await new Promise(setImmediate);
 assert.ok(calls.includes('/api/jobs'));assert.ok(!calls.some(p=>p==='/api/jobs/old-job'));assert.equal($('#job-status').hidden,true);assert.equal($('#file').files.length,0);
}
assert.ok(html.includes('<details class="content-card history">'));assert.ok(!html.includes('<details class="content-card history" open'));
console.log('PASS clean start with saved previous job, blocked storage, no automatic result poll, empty file, history collapsed');
