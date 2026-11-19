import { expect, mock, test } from 'bun:test';
import type { GitTriggerSpec } from '../trigger-types';
import type { ProjectRow } from './serializers';
let exhausted=true;
let reuse=false;
const creates: Array<Record<string, unknown>>=[];
const continues: Array<Record<string, unknown>>=[];
const database = await import('../../shared/db');
mock.module('../../shared/db',()=>({...database,db:{select:()=>({from:()=>({where:()=>({orderBy:()=>({limit:async()=>reuse?[{sessionId:'synthetic-session'}]:[]}),limit:async()=>[{status:'running',metadata:{},spaceId:null}]})})})}}));
mock.module('../../billing/services/billing-gate',()=>({checkBillingAdmission:async()=>({ok:true})}));
const spaces=await import('../../shared/space-access');
mock.module('../../shared/space-access',()=>({...spaces,privateSpaceMemberIds:async()=>null}));
mock.module('./trigger-space',()=>({liveTriggerSpace:async()=>null,triggerRunSpace:()=>null}));
const lifecycle=await import('../session-lifecycle');
mock.module('../session-lifecycle',()=>({...lifecycle,resolveProjectAutomationActor:async()=> 'automation-test',createSession:async(input:Record<string,unknown>)=>{creates.push(input);return {status:'created',sessionId:'synthetic-session'};},enqueueContinueSessionCommand:async(input:Record<string,unknown>)=>{continues.push(input);return {deduped:false};},drainSessionLifecycleQueue:async()=>{}}));
const execution=await import('../trigger-execution-store');
mock.module('../trigger-execution-store',()=>({...execution,keepRunFailure:async()=>{}}));
mock.module('./trigger-setup-pause',()=>({pauseTriggerOnAccountRefusal:async()=>{}}));
mock.module('./trigger-model-gate',()=>({triggerModelRefusal:async()=>null}));
mock.module('./trigger-capacity-runtime',()=>({triggerCapacityModel:async(input:{model:string})=> exhausted?{model:'codex/gpt-6.1-sol',intendedModel:input.model,reason:'claude-exhausted'}:{model:input.model}}));
mock.module('./trigger-run-caps',()=>({readTriggerAutoPause:async()=>({}),triggerRunCapVerdict:async()=>null,autoPauseTrigger:async()=>false,triggerAutoPauseReason:()=>''}));
mock.module('./trigger-overlap',()=>({triggerChecksOverlap:()=>false,triggerOverlapReason:async()=>null}));
mock.module('./trigger-create-claim',()=>({triggerCreateKey:()=>null,claimTriggerCreate:async()=>true,releaseTriggerCreate:async()=>{}}));
mock.module('../../iam/account-analytics',()=>({captureAccountProductEvent:()=>{}}));
const { fireGitTrigger }=await import('./trigger-fire');
const spec:GitTriggerSpec={slug:'capacity-test',path:'kortix.yaml',name:'Capacity test',type:'cron',agent:'default',model:'claude-agent/opus',capacityFallbackModels:['claude-agent/sonnet','codex/gpt-6.1-sol'],enabled:true,promptTemplate:'synthetic prompt',cron:'0 0 9 * * *',runAt:null,timezone:'UTC',secretEnv:null,sessionMode:'fresh',pinnedSessionId:null,sessionKey:null,filter:null};
const project={projectId:'synthetic-project',accountId:'synthetic-account'} as ProjectRow;
const input={spec,project,payload:{},renderedPrompt:'synthetic prompt',source:'manual' as const,deliberate:true};
test('real fire emits selected create model and durable audit, then restores intended on next fresh fire',async()=>{
 exhausted=true;reuse=false;await fireGitTrigger(input);
 expect(creates[0]).toMatchObject({body:{model:'codex/gpt-6.1-sol',metadata:{trigger_capacity_routing:{intendedModel:'claude-agent/opus',reason:'claude-exhausted'}}}});
 exhausted=false;await fireGitTrigger(input);expect(creates[1]).toMatchObject({body:{model:'claude-agent/opus'}});expect(spec.model).toBe('claude-agent/opus');
});
test('real keyed/reuse fire emits selected continue override and audit then restores Claude',async()=>{
 reuse=true;exhausted=true;const keyed={...input,spec:{...spec,sessionMode:'keyed' as const,sessionKey:'synthetic-key'}};await fireGitTrigger(keyed);
 expect(continues[0]).toMatchObject({overrides:{model:{providerID:'kortix',modelID:'codex/gpt-6.1-sol'}},capacityRouting:{intendedModel:'claude-agent/opus',model:'codex/gpt-6.1-sol',reason:'claude-exhausted'}});
 exhausted=false;await fireGitTrigger(keyed);expect(continues[1]).toMatchObject({overrides:{model:{providerID:'claude-agent',modelID:'opus'}},capacityRouting:{intendedModel:'claude-agent/opus',model:'claude-agent/opus',reason:'claude-available'}});
});

test('continue command builder persists routing audit in durable command result',async()=>{
 const {buildContinueSessionCommandValues}=await import('../session-lifecycle/enqueue-commands');
 const capacityRouting={intendedModel:'claude-agent/opus',model:'codex/gpt-6.1-sol',reason:'claude-exhausted'};
 expect(buildContinueSessionCommandValues({source:'trigger:manual',projectId:'synthetic-project',accountId:'synthetic-account',sessionId:'synthetic-session',actorUserId:'synthetic-actor',text:'synthetic',capacityRouting}).result).toMatchObject({trigger_capacity_routing:capacityRouting});
});
