import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({getUser:vi.fn(),access:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:m.getUser}})}));
vi.mock('./env',()=>({ENV:{supabaseUrl:'http://localhost.invalid',supabaseServiceRoleKey:'test-only'}}));
vi.mock('./appAccess',()=>({hasPostSparkAccess:m.access}));
vi.mock('./localAuthDiagnostic',()=>({recordLocalAuth:vi.fn()}));
vi.mock('./cookies',()=>({getSessionCookieOptions:()=>({httpOnly:true})}));
import { registerSupabaseAuthRoutes } from './supabaseAuth';
import { sdk } from './sdk';
import { COOKIE_NAME } from '@shared/const';
const handlers=new Map<string,Function>();
registerSupabaseAuthRoutes({post:(path:string,handler:Function)=>handlers.set(path,handler)} as any);
beforeEach(()=>{
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({data:{user:{id:'a',email:'a@example.test',user_metadata:{role:'admin'}}},error:null});
  m.access.mockResolvedValue(true);
});
async function bridge(){
  const res={status:vi.fn(),json:vi.fn(),cookie:vi.fn()};res.status.mockReturnValue(res);
  await handlers.get('/api/auth/supabase-session')!({body:{access_token:'test-token'}},res);
  return res;
}
it('invalid sessions never reach app authorization or receive a cookie',async()=>{
  m.getUser.mockResolvedValue({data:{user:null},error:{message:'invalid'}});
  const res=await bridge();expect(res.status).toHaveBeenCalledWith(401);
  expect(m.access).not.toHaveBeenCalled();expect(res.cookie).not.toHaveBeenCalled();
});
it('valid identity without permission is denied even with admin user metadata',async()=>{
  m.access.mockResolvedValue(false);
  const res=await bridge();expect(res.status).toHaveBeenCalledWith(403);
  expect(m.access).toHaveBeenCalledWith('a');expect(res.cookie).not.toHaveBeenCalled();
});
it('issues a cookie for authorized identity but rejects it on the next request after revocation',async()=>{
  const res=await bridge();expect(res.cookie).toHaveBeenCalledWith(COOKIE_NAME,'test-token',expect.objectContaining({httpOnly:true}));
  const req={headers:{cookie:`${COOKIE_NAME}=test-token`}} as any;
  expect((await sdk.authenticateRequest(req)).id).toBe('a');
  m.access.mockResolvedValue(false);
  await expect(sdk.authenticateRequest(req)).rejects.toThrow('PostSpark access required');
});
