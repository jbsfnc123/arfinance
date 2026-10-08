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
  await click('Buka konsultan chat');
  const frame=host.querySelector('iframe')!;
  expect(frame.getAttribute('src')).toBe(CONSULTANT_URL);
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(host.querySelector('a[target="_blank"]')).toBeNull();
  expect(host.firstElementChild?.getAttribute('style')).not.toContain('--dock-reserve');
  await click('Tutup chat');expect(host.querySelector('section')?.hidden).toBe(true);
  await click('Buka konsultan chat');expect(host.querySelector('iframe')).toBe(frame);
  expect(host.querySelector('section')?.hidden).toBe(false);
});
it('returns focus when closed by Escape',async()=>{
  await click('Buka konsultan chat');
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(host.querySelector('section')?.hidden).toBe(true);
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Buka konsultan chat');
});
it('passes only the account display name for greeting lookup, safely encoded', async()=>{
  await act(async()=>root.render(<ConsultantChat key="account-a" accountName="Mando & Tim" />));
  await click('Buka konsultan chat');
  const url=new URL(host.querySelector('iframe')!.getAttribute('src')!);
  expect(url.searchParams.get('account')).toBe('Mando & Tim');
  expect([...url.searchParams.keys()]).toEqual(['account']);
});
it('clears the embedded conversation when the account changes',async()=>{
  await click('Buka konsultan chat');
  await act(async()=>root.render(<ConsultantChat key="account-b" />));
  expect(host.querySelector('iframe')).toBeNull();
});

it('does not close chat when Escape belongs to a newer modal',async()=>{
  await click('Buka konsultan chat');
  const modal=layerStack.push('modal');
  try {
    await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    expect(host.querySelector('section')?.hidden).toBe(false);
  } finally {layerStack.remove(modal);}
});

it('scopes browser memory by account ID even when display names match', async()=>{
  await act(async()=>root.render(<ConsultantChat key="a" accountName="Mando" accountId="11111111-1111-4111-8111-111111111111" />));
  await click('Buka konsultan chat');
  const first=new URL(host.querySelector('iframe')!.getAttribute('src')!);
  expect(first.searchParams.get('accountId')).toBe('11111111-1111-4111-8111-111111111111');
  await act(async()=>root.render(<ConsultantChat key="b" accountName="Mando" accountId="22222222-2222-4222-8222-222222222222" />));
  expect(host.querySelector('iframe')).toBeNull();
  await click('Buka konsultan chat');
  const second=new URL(host.querySelector('iframe')!.getAttribute('src')!);
  expect(second.searchParams.get('accountId')).not.toBe(first.searchParams.get('accountId'));
  expect([...second.searchParams.keys()].sort()).toEqual(['account','accountId']);
});
