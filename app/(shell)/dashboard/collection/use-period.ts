"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getToken, onVersionChange } from "@/lib/cache/versions";
import type { CollectionPeriod } from "@/lib/modules/collection/closing";

export function useCollectionPeriod(month: string) {
  const client = useMemo(() => createClient(), []);
  const [state,setState] = useState<{ data: CollectionPeriod | null; error: string | null; loading: boolean }>({data:null,error:null,loading:true});
  const serial = useRef(0);
  const invalidate = useCallback(() => { ++serial.current; }, []);
  const reload = useCallback(async () => {
    const n = ++serial.current;
    setState(s => ({...s,loading:true,error:null}));
    try {
      const {data,error} = await client.rpc("collection_period_get", {p_month:month});
      if (error) throw error;
      if(n===serial.current) setState({data:data as unknown as CollectionPeriod,error:null,loading:false});
    } catch(e) {
      if(n===serial.current) setState({data:null,error:(e as Error).message,loading:false});
    }
  },[client,month]);
  useEffect(() => {
    let active=true, token="", timer: ReturnType<typeof setTimeout> | undefined;
    const initial = setTimeout(() => { void reload(); }, 0);
    const deps=["collection_closing","aging","targets","activity","erp","settings"];
    async function check() {
      if (!active) return;
      try {
        if(document.visibilityState!=="hidden") {
          const next=await getToken(client,deps);
          if(active && token && next!==token) void reload();
          token=next;
        }
      } finally { if(active) timer=setTimeout(() => {void check().catch(()=>{});},15000); }
    }
    void check().catch(()=>{});
    const off=onVersionChange(k => {if(deps.includes(k)) void reload();});
    const focus=()=>{void reload();};
    window.addEventListener("focus",focus);
    return()=>{active=false;invalidate();clearTimeout(initial);clearTimeout(timer);off();window.removeEventListener("focus",focus);};
  },[client,reload,invalidate]);
  return {...state,data:state.data?.month===month?state.data:null,reload};
}
