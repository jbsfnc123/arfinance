// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { layerStack } from "./use-dialog";
import { ConsultantChat, CONSULTANT_URL } from "./consultant-chat";
let host: HTMLDivElement; let root: Root;
beforeEach(async()=>{
  (window as unknown as {happyDOM: {settings: {disableIframePageLoading: boolean}}}).happyDOM.settings.disableIframePageLoading = true;
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  await act(async()=>root.render(<ConsultantChat key="account-a" />));
});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const click=async(label:string)=>act(async()=>host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
it('starts collapsed with no external iframe request, opens and keeps the same frame when minimized',async()=>{
  expect(host.querySelector('iframe')).toBeNull();
  await click('Buka AR Helpdesk');
  const frame=host.querySelector('iframe')!;
  expect(frame.getAttribute('src')).toBe(CONSULTANT_URL);
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  // Satu-satunya tautan keluar: "Powered by otomatisasi.store" di header panel.
  expect([...host.querySelectorAll('a[target="_blank"]')].map((a)=>a.getAttribute('href'))).toEqual(['https://otomatisasi.store']);
  expect(host.querySelector('a[target="_blank"]')?.getAttribute('rel')).toContain('noopener');
  expect(host.firstElementChild?.getAttribute('style')).not.toContain('--dock-reserve');
  await click('Tutup chat');expect(host.querySelector('section')?.hidden).toBe(true);
  await click('Buka AR Helpdesk');expect(host.querySelector('iframe')).toBe(frame);
  expect(host.querySelector('section')?.hidden).toBe(false);
});
it('returns focus when closed by Escape',async()=>{
  await click('Buka AR Helpdesk');
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(host.querySelector('section')?.hidden).toBe(true);
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Buka AR Helpdesk');
});
it('passes only the account display name for greeting lookup, safely encoded', async()=>{
  await act(async()=>root.render(<ConsultantChat key="account-a" accountName="Mando & Tim" />));
  await click('Buka AR Helpdesk');
  const url=new URL(host.querySelector('iframe')!.getAttribute('src')!);
  expect(url.searchParams.get('account')).toBe('Mando & Tim');
  expect([...url.searchParams.keys()]).toEqual(['account']);
});
it('clears the embedded conversation when the account changes',async()=>{
  await click('Buka AR Helpdesk');
  await act(async()=>root.render(<ConsultantChat key="account-b" />));
  expect(host.querySelector('iframe')).toBeNull();
});

it('does not close chat when Escape belongs to a newer modal',async()=>{
  await click('Buka AR Helpdesk');
  const modal=layerStack.push('modal');
  try {
    await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    expect(host.querySelector('section')?.hidden).toBe(false);
  } finally {layerStack.remove(modal);}
});

it('scopes browser memory by account ID even when display names match', async()=>{
  await act(async()=>root.render(<ConsultantChat key="a" accountName="Mando" accountId="11111111-1111-4111-8111-111111111111" />));
  await click('Buka AR Helpdesk');
  const first=new URL(host.querySelector('iframe')!.getAttribute('src')!);
  expect(first.searchParams.get('accountId')).toBe('11111111-1111-4111-8111-111111111111');
  await act(async()=>root.render(<ConsultantChat key="b" accountName="Mando" accountId="22222222-2222-4222-8222-222222222222" />));
  expect(host.querySelector('iframe')).toBeNull();
  await click('Buka AR Helpdesk');
  const second=new URL(host.querySelector('iframe')!.getAttribute('src')!);
  expect(second.searchParams.get('accountId')).not.toBe(first.searchParams.get('accountId'));
  expect([...second.searchParams.keys()].sort()).toEqual(['account','accountId']);
});
it('uses the new name AR Helpdesk', async()=>{
  await click('Buka AR Helpdesk');
  expect(host.querySelector('section')?.getAttribute('aria-label')).toBe('AR Helpdesk');
  expect(host.textContent).toContain('Powered by otomatisasi.store');
  expect(host.querySelector('button[title="AR Helpdesk"]')).not.toBeNull();
  expect(host.querySelector('iframe')?.getAttribute('title')).toBe('Percakapan dengan AR Helpdesk');
});
it('answers page-context requests only from the Apps Script origin inside its own frame', async()=>{
  await click('Buka AR Helpdesk');
  const frameWin = host.querySelector('iframe')!.contentWindow!;
  const sent: unknown[] = [];
  const source = { postMessage: (m: unknown) => sent.push(m) } as unknown as Window;
  // Bukan origin Google → diabaikan
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'qna:context:request', id: 'x1' }, origin: 'https://evil.example.com', source: frameWin }));
  // Origin Google tetapi bukan frame chat → diabaikan
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'qna:context:request', id: 'x2' }, origin: 'https://n-x-script.googleusercontent.com', source }));
  expect(sent).toEqual([]);
});
it('can be dragged to the other edge without opening, remembers the spot, and still opens on a plain click', async()=>{
  localStorage.removeItem('prefs:chatPos');
  const btn=()=>host.querySelector<HTMLButtonElement>('button[aria-label="Buka AR Helpdesk"]')!;
  const fire=(type:string,x:number,y:number)=>act(async()=>{btn().dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:7,button:0,clientX:x,clientY:y}));});
  btn().getBoundingClientRect=()=>({left:innerWidth-52,top:innerHeight-52,right:innerWidth-8,bottom:innerHeight-8,width:44,height:44,x:0,y:0,toJSON(){}}) as DOMRect;
  await fire('pointerdown',innerWidth-30,innerHeight-30);
  await fire('pointermove',40,innerHeight-300);
  await fire('pointerup',40,innerHeight-300);
  await act(async()=>btn().click()); // klik setelah geser diabaikan
  expect(host.querySelector('iframe')).toBeNull();
  expect(JSON.parse(localStorage.getItem('prefs:chatPos')!).side).toBe('left');
  expect(btn().style.left).not.toBe('');
  await act(async()=>btn().click());
  expect(host.querySelector('section')?.hidden).toBe(false);
  localStorage.removeItem('prefs:chatPos');
});
