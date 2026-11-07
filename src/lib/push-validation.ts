export function validPushEndpoint(value:unknown):value is string{
 if(typeof value!=='string'||value.length>4096)return false;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&!url.hash&&(url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.services.mozilla.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.notify.windows.com'));}catch{return false;}
}
export function validPushKeys(keys:unknown):keys is {p256dh:string;auth:string}{
 if(!keys||typeof keys!=='object')return false;const value=keys as Record<string,unknown>;
 return typeof value.p256dh==='string'&&/^[A-Za-z0-9_-]{87,88}$/.test(value.p256dh)&&typeof value.auth==='string'&&/^[A-Za-z0-9_-]{22,24}$/.test(value.auth);
}
