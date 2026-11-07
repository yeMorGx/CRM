export function pushSupported(){return typeof window!=='undefined'&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;}
export async function enrollPush(subscription:PushSubscription){const response=await fetch('/api/push/subscription',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(subscription.toJSON())});const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível ativar os avisos.');}
export async function disconnectPush(){
 if(!pushSupported())return;
 const registration=await navigator.serviceWorker.getRegistration('/');const subscription=await registration?.pushManager.getSubscription();if(!subscription)return;
 try{await fetch('/api/push/subscription',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:subscription.endpoint}),signal:AbortSignal.timeout(5000)});}finally{await subscription.unsubscribe();}
}
export async function enablePush(publicKey:string){
 if(!pushSupported())throw Error('Este navegador não oferece avisos fora do site.');
 const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('A permissão não foi concedida. Você pode alterá-la nas configurações do navegador.');
 const registration=await navigator.serviceWorker.register('/push-sw.js',{scope:'/'});await navigator.serviceWorker.ready;
 const encoded=publicKey.replace(/-/g,'+').replace(/_/g,'/');const decoded=atob(encoded+'='.repeat((4-encoded.length%4)%4));const key=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 const existing=await registration.pushManager.getSubscription();const subscription=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 try{await enrollPush(subscription);}catch(cause){await subscription.unsubscribe();throw cause;}
}
