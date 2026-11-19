import { expect, mock, test } from 'bun:test';
const secrets = await import('../secrets/account-resource');
mock.module('../secrets/account-resource',()=>({...secrets,readAccountSecret:()=> 'synthetic-token'}));
const { readSubscriptionCapacity } = await import('./subscription-usage');
const row: Parameters<typeof readSubscriptionCapacity>[0] = {secretId:'synthetic',accountId:'synthetic-account',projectId:'synthetic-project',providerId:'claude-agent',valueEnc:'synthetic',createdBy:'synthetic-user',updatedAt:new Date(),usageCheckedAt:new Date(),providerAccount:{email:'test@example.test',plan:'max',checked_at:new Date().toISOString()},usage:{limited:true,observed_at:new Date(Date.now()-120000).toISOString(),source:'response',windows:[{id:'weekly',window_minutes:10080,used_percent:100,resets_at:new Date(Date.now()+3600000).toISOString()}]}};
test('strict capacity read never falls back to cached exhaustion after 401 or failed provider body',async()=>{
 expect(await readSubscriptionCapacity(row,async()=>new Response('',{status:401}))).toBeNull();
 expect(await readSubscriptionCapacity(row,async()=>Response.json({error:'unavailable'}))).toBeNull();
});
test('strict capacity read uses successful provider data instead of cached limited snapshot',async()=>{
 expect(await readSubscriptionCapacity(row,async()=>Response.json({seven_day:{utilization:10,resets_at:new Date(Date.now()+3600000).toISOString()}}))).toMatchObject({limited:false,source:'usage_endpoint'});
});
