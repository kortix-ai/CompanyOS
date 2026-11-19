import { expect, mock, test } from 'bun:test';
let ids: string[] = ['shared'];
let snapshots: unknown[] = [];
let refused = false;
const scopes: unknown[] = [];
const queries: unknown[] = [];
mock.module('../../secrets/account-resource',()=>({listUsableGatewaySecrets:async(input:unknown)=>{scopes.push(input);return ids.map(secretId=>({secretId}));}}));
mock.module('../../shared/db',()=>({db:{select:()=>({from:()=>({where:async(query:unknown)=>{queries.push(query);return ids.map(secretId=>({secretId,needsReauthAt:refused?new Date():null}));}})})}}));
mock.module('../../llm-gateway/subscription-usage',()=>({readSubscriptionCapacity:async(row:{secretId:string})=>snapshots[ids.indexOf(row.secretId)]}));
mock.module('../../llm-gateway/models/servable-catalog',()=>({servableProjectCatalog:async(input:unknown)=>{scopes.push(input);return {models:{'codex/gpt-6.1-sol':{enabled:true,available:true}}};}}));
const { triggerCapacityModel } = await import('./trigger-capacity-runtime');
const input={accountId:'account-test',projectId:'project-test',actor:'automation-test',model:'claude-agent/opus',fallbacks:['claude-agent/sonnet','codex/gpt-6.1-sol']};
const usage=(limited:boolean)=>({limited,observed_at:new Date().toISOString(),windows:[{id:'weekly',used_percent:limited?100:20,resets_at:new Date(Date.now()+3600000).toISOString()}]});
test('shared-only runtime resolves exhaustion then restores intended after reset',async()=>{
 snapshots=[usage(true)]; expect(await triggerCapacityModel(input)).toMatchObject({model:'codex/gpt-6.1-sol',reason:'claude-exhausted'});
 expect(scopes[0]).toMatchObject({grantUserId:null,providerId:'claude-agent',accountId:input.accountId,projectId:input.projectId});
 expect(scopes[1]).toMatchObject({personalUserId:null}); expect(queries.length).toBe(1);
 snapshots=[usage(false)];expect(await triggerCapacityModel(input)).toEqual({model:input.model});
});
test('no shared account, unknown usage and refused authentication hold',async()=>{
 ids=[];await expect(triggerCapacityModel(input)).rejects.toThrow('project-shared');
 ids=['shared'];snapshots=[null];await expect(triggerCapacityModel(input)).rejects.toThrow('invalid');
 refused=true;await expect(triggerCapacityModel(input)).rejects.toThrow('reconnection');refused=false;
});
test('no opt-in and security do not perform provider reads',async()=>{
 const count=scopes.length;expect(await triggerCapacityModel({...input,fallbacks:undefined})).toEqual({model:input.model});
 expect(await triggerCapacityModel({...input,model:'morph/model'})).toEqual({model:'morph/model'});expect(scopes.length).toBe(count);
});
