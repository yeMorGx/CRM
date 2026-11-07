const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const Module=require('node:module');const vm=require('node:vm');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {validPushEndpoint,validPushKeys}=require('../src/lib/push-validation.ts');
for(const url of ['https://fcm.googleapis.com/fcm/send/test','https://updates.push.services.mozilla.com/wpush/v2/test','https://web.push.apple.com/test','https://wns2-par02p.notify.windows.com/test'])assert.ok(validPushEndpoint(url));
for(const url of ['http://fcm.googleapis.com/test','https://127.0.0.1/test','https://fcm.googleapis.com.evil.test/test','https://user@fcm.googleapis.com/test','https://fcm.googleapis.com:444/test','https://example.test/test'])assert.equal(validPushEndpoint(url),false);
assert.ok(validPushKeys({p256dh:'x'.repeat(87),auth:'y'.repeat(22)}));assert.equal(validPushKeys({p256dh:'x',auth:'y'}),false);
const sent=[],deleted=[];let fail=0;
const records={profiles:[{id:'allowed'}],push_subscriptions:[{id:'good',user_id:'allowed',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'x'.repeat(87),auth:'y'.repeat(22)},{id:'revoked',user_id:'revoked',endpoint:'https://fcm.googleapis.com/fcm/send/revoked',p256dh:'x'.repeat(87),auth:'y'.repeat(22)},{id:'sender',user_id:'sender',endpoint:'https://fcm.googleapis.com/fcm/send/sender',p256dh:'x'.repeat(87),auth:'y'.repeat(22)},{id:'ssrf',user_id:'allowed',endpoint:'https://127.0.0.1/test',p256dh:'x'.repeat(87),auth:'y'.repeat(22)}],chat_profiles:{full_name:'FIXTURE AUTHOR'}};
const admin={from(table){return {select(){return this;},eq(key,value){if(this.removing)deleted.push(value);return this;},neq(){return this;},delete(){this.removing=true;return this;},async maybeSingle(){return {data:records[table]};},then(resolve){return Promise.resolve({data:records[table]}).then(resolve);}};}};
function loadFile(file,stubs){const targetModule=new Module(file);targetModule.filename=file;targetModule.paths=Module._nodeModulePaths(process.cwd());targetModule.require=name=>Object.hasOwn(stubs,name)?stubs[name]:require(name);targetModule._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return targetModule.exports;}
const server=loadFile('src/lib/web-push-server.ts',{'server-only':{},'./push-validation':{validPushEndpoint,validPushKeys},'web-push':{async sendNotification(subscription,payload,options){sent.push({subscription,payload:JSON.parse(payload),options});if(fail)throw {statusCode:fail};}}});
process.env.WEB_PUSH_PUBLIC_KEY='FIXTURE';process.env.WEB_PUSH_PRIVATE_KEY='FIXTURE';
(async()=>{
 await server.deliverChatPush(admin,{id:'msg',sender_id:'sender'});assert.equal(sent.length,1);assert.equal(sent[0].payload.url,'/?chat=open');assert.equal(sent[0].options.TTL,300);assert.ok(!JSON.stringify(sent[0].payload).includes('private text'));fail=410;await server.deliverChatPush(admin,{id:'expired',sender_id:'sender'});assert.deepEqual(deleted,['good']);
 const handlers={},shown=[],posts=[],opened=[];let tabs=[];
 const worker={addEventListener:(type,handler)=>handlers[type]=handler,clients:{matchAll:async()=>tabs,openWindow:async url=>opened.push(url)},registration:{showNotification:async(title,options)=>shown.push({title,options})},location:{origin:'https://example.test'}};
 vm.runInNewContext(fs.readFileSync('public/push-sw.js','utf8'),{self:worker,URL});
 async function push(data){let pending;handlers.push({data:{json:()=>data},waitUntil:promise=>pending=promise});await pending;}
 await push({id:'1',title:'Fixture',body:'Generic',url:'https://evil.test'});assert.equal(shown.length,1);assert.equal(shown[0].options.data.url,'/?chat=open');
 tabs=[{visibilityState:'visible',focused:true,postMessage:data=>posts.push(data)}];await push({id:'2'});assert.equal(shown.length,1);assert.equal(posts[0].type,'PROSPECTA_PUSH');
 tabs=[];let pending;handlers.notificationclick({notification:{close(){}},waitUntil:promise=>pending=promise});await pending;assert.equal(opened[0],'/?chat=open');
 console.log('PASS: endpoints restritos, chaves, destinatários autorizados, exclusão de remetente, limpeza 410, SW foreground/background e link seguro. Transporte simulado: nenhum push real.');
})().catch(error=>{console.error(error);process.exitCode=1;});
