import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {createTRPCProxyClient,httpLink} from '@trpc/client';
import superjson from 'superjson';
import type {AppRouter} from '../../../server/routers';
import {readLocalEnvironment} from '../environment.mjs';

export async function openLocalApi() {
 const env=await readLocalEnvironment(process.cwd());
 const account=JSON.parse(await fs.readFile('.acervo82-local/test-account.json','utf8'));
 assert.equal(account.supabaseUrl,env.SUPABASE_URL);
 const auth=createClient(env.SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const signed=await auth.auth.signInWithPassword({email:account.email,password:account.password});
 if(signed.error)throw signed.error;
 assert.equal(signed.data.user.id,account.id);
 const app=`http://127.0.0.1:${env.PORT}`;
 const bridge=await fetch(`${app}/api/auth/supabase-session`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({access_token:signed.data.session.access_token})});
 assert.equal(bridge.status,200);
 const cookie=bridge.headers.get('set-cookie')!.split(';')[0];
 const api=createTRPCProxyClient<AppRouter>({links:[httpLink({url:`${app}/api/trpc`,transformer:superjson,headers:{Cookie:cookie}})]});
 assert.equal((await api.auth.me.query())?.id,account.id);
 return {api,actor:account.id,app,cookie,close:async()=>{await auth.auth.signOut({scope:'local'});}};
}
