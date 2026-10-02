import {
  recoveryLogoutGenerationKey,
  recoveryLogoutIntentKey,
} from "./browser-recovery";
import { adminDocumentSessionKey } from "./admin-document-session";

/** Inline head script: it executes before body parsing and async island code.
 * Its fence covers SSR, serialized island props and later streamed content.
 * Auth/logout documents deliberately omit it so explicit cleanup stays usable. */
export function adminDocumentBootstrap(destination: string): string {
  const literal = (value: string) =>
    JSON.stringify(value).replace(/</g, "\\u003c");
  return `(function(w,d){
var key=${literal(recoveryLogoutGenerationKey)},intent=${literal(recoveryLogoutIntentKey)},slot=${literal(adminDocumentSessionKey)},next=${literal(destination)},pending=false;
if(w[slot])return;
var baseline=null,activeIntent=null,available=true;
try{baseline=w.localStorage.getItem(key);activeIntent=w.localStorage.getItem(intent);}catch(e){available=false;}
var state={locked:false,reason:'locked',lock:lock};
Object.defineProperties(state,{generation:{value:baseline},storageAvailable:{value:available}});
w[slot]=state;
function fallback(){
 if(!d.body)return;
 var main=d.querySelector('[data-admin-session-reentry]');
 if(!main){
  main=d.createElement('main');main.className='admin-standalone';main.setAttribute('data-admin-session-reentry','');
  var heading=d.createElement('h1');heading.textContent='Session ended';main.appendChild(heading);
  var reload=d.createElement('a');main.appendChild(reload);
  var change=d.createElement('a');change.href='/auth/logout';change.textContent='Sign out to change account';main.appendChild(change);
  d.body.appendChild(main);
 }
 var unfinished=true;try{unfinished=w.localStorage.getItem(intent)!==null;}catch(e){}
 var primary=main.querySelector('a'),href=unfinished?'/auth/logout':next,label=unfinished?'Finish sign out':'Sign in again';
 if(primary.getAttribute('href')!==href)primary.setAttribute('href',href);
 if(primary.textContent!==label)primary.textContent=label;
}
function purge(){
 pending=false;
 if(!state.locked)return;
 var roots=d.querySelectorAll('[data-admin-private-document]');
 for(var i=0;i<roots.length;i++){
  var islands=roots[i].querySelectorAll('astro-island');
  for(var j=islands.length-1;j>=0;j--){
   islands[j].removeAttribute('ssr');
   islands[j].dispatchEvent(new CustomEvent('astro:unmount'));
  }
  if(roots[i].firstChild)roots[i].replaceChildren();
  for(var k=0;k<islands.length;k++)islands[k].removeAttribute('props');
 }
 fallback();
}
function fence(){
 if(!state.locked)return;
 d.documentElement.setAttribute('data-admin-document-locked','');
 var roots=d.querySelectorAll('[data-admin-private-document]');
 for(var i=0;i<roots.length;i++){roots[i].inert=true;roots[i].setAttribute('inert','');}
 fallback();
 if(!pending){pending=true;queueMicrotask(purge);}
}
function lock(reason){state.locked=true;if(reason==='logout')state.reason='logout';fence();}
function compare(){
 try{if(!available)lock('locked');else if(activeIntent!==null)lock('logout');else if(w.localStorage.getItem(intent)!==null||w.localStorage.getItem(key)!==baseline)lock('logout');}catch(e){lock('locked');}
}
w.addEventListener(key,function(){lock('logout');});
w.addEventListener(intent,function(){lock('logout');});
w.addEventListener('storage',function(e){if(e.key===key||e.key===intent||e.key===null)lock('logout');});
w.addEventListener('pagehide',function(){lock('locked');});
w.addEventListener('pageshow',function(e){compare();if(e.persisted)lock('locked');});
d.addEventListener('DOMContentLoaded',function(){compare();fence();},{once:true});
new MutationObserver(fence).observe(d.documentElement,{childList:true,subtree:true});
if(!available)lock('locked');else if(activeIntent!==null)lock('logout');
})(window,document);`;
}
