self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data;try{data=event.data?.json();}catch{return;}if(!data?.id)return;
  const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const foreground=tabs.find(tab=>tab.visibilityState==='visible'&&tab.focused);
  if(foreground){foreground.postMessage({type:'PROSPECTA_PUSH',data});return;}
  await self.registration.showNotification(data.title||'Nova mensagem',{body:data.body||'Abra o bate-papo da Prospecta.',icon:'/android-chrome-192x192.png',badge:'/favicon-32x32.png',tag:data.tag||'prospecta-chat',data:{url:'/?chat=open'}});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});const tab=tabs.find(client=>new URL(client.url).origin===self.location.origin);
  if(tab){await tab.focus();tab.postMessage({type:'PROSPECTA_OPEN_CHAT'});}else await self.clients.openWindow('/?chat=open');
 })());
});
