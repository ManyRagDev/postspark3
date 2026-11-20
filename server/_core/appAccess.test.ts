import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({rpc:mocks.rpc})}));
vi.mock('./env',()=>({ENV:{supabaseUrl:'http://localhost.invalid',supabaseServiceRoleKey:'test-only'}}));
import { hasPostSparkAccess } from './appAccess';
beforeEach(()=>{mocks.rpc.mockReset();vi.spyOn(console,'error').mockImplementation(()=>{});});
it('refills due quotas only after explicit authorization without invoking enrollment',async()=>{
  for(const value of [false,null,undefined,{},[], 'true',1]){
    mocks.rpc.mockResolvedValue({data:value,error:null});
    expect(await hasPostSparkAccess('user-a')).toBe(false);
  }
  expect(mocks.rpc.mock.calls.every(([name])=>name==='has_app_access')).toBe(true);
  mocks.rpc.mockClear();
  mocks.rpc.mockResolvedValue({data:true,error:null});
  expect(await hasPostSparkAccess('user-a')).toBe(true);
  expect(mocks.rpc.mock.calls).toEqual([
    ['has_app_access',{p_user_id:'user-a'}],
    ['refill_pro_sparks',{p_user_id:'user-a'}],
  ]);
});
it('denies access on database failure without leaking error content',async()=>{
  mocks.rpc.mockResolvedValue({data:true,error:{message:'sensitive'}});
  expect(await hasPostSparkAccess('user-a')).toBe(false);
  mocks.rpc.mockRejectedValue(new Error('sensitive'));
  expect(await hasPostSparkAccess('user-a')).toBe(false);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('sensitive');
});
