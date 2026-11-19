import { expect, test } from 'bun:test';
import { extractTriggers, triggerSpecToFlatEntry, triggerSpecToOnRunEntry } from '../triggers';
import { validateTriggers } from '@kortix/manifest-schema';
import { draftToSpec, parseTriggerDraft, specToBody } from './trigger-draft';
const chain = ['claude-agent/sonnet', 'codex/gpt-6.1-sol'];
const entry = {slug:'digest',type:'cron',cron:'0 0 9 * * *',prompt:'Write summary',model:'claude-agent/opus',capacity_fallback_models:chain};
test('manifest opt-in survives flat and on/run roundtrip; intended model preserved', () => {
 const first=extractTriggers({raw:{triggers:[entry]},path:'kortix.yaml'}); expect(first.errors).toEqual([]);
 const spec=first.specs[0]; expect(spec?.capacityFallbackModels).toEqual(chain);
 if(!spec) throw new Error('missing spec');
 expect(triggerSpecToFlatEntry(spec).capacity_fallback_models).toEqual(chain);
 expect(extractTriggers({raw:{triggers:[triggerSpecToOnRunEntry(spec)]},path:'kortix.yaml'}).specs[0]).toEqual(spec);
 expect(spec.model).toBe('claude-agent/opus');
});
test('CRUD parse and unrelated PATCH preserve policy',()=>{
 const parsed=parseTriggerDraft({...entry,name:'Digest',prompt_template:entry.prompt}, {existingSlug:null});
 if('error' in parsed) throw new Error(parsed.error);
 const spec=draftToSpec(parsed); expect(spec.capacityFallbackModels).toEqual(chain);
 const patched=parseTriggerDraft({...specToBody(spec),name:'New name'}, {existingSlug:spec.slug});
 if('error' in patched) throw new Error(patched.error);
 expect(draftToSpec(patched).capacityFallbackModels).toEqual(chain);
});
test('no opt-in stays absent; unsupported chains and nonClaude model refused',()=>{
 for(const capacity_fallback_models of [[],['codex/gpt-6.1-terra'],['claude-agent/sonnet','codex/gpt-6.1-sol','codex/gpt-6.1-sol'],[{},{}]]) expect(extractTriggers({raw:{triggers:[{...entry,capacity_fallback_models}]},path:'kortix.yaml'}).errors.length).toBeGreaterThan(0);
 expect(extractTriggers({raw:{triggers:[{...entry,model:'claude-agent/unknown'}]},path:'kortix.yaml'}).errors.length).toBeGreaterThan(0);
});

test('canonical manifest validator accepts opt-in in on/run and rejects invalid fallback', () => {
 const issues: Parameters<typeof validateTriggers>[2] = [];
 validateTriggers([{slug:'digest',on:{cron:entry.cron},run:{prompt:entry.prompt,model:entry.model,capacity_fallback_models:chain}}], 'triggers', issues);expect(issues).toEqual([]);
 validateTriggers([{...entry,capacity_fallback_models:['codex/gpt-6.1-terra']}], 'triggers', issues);expect(issues.some(issue=>issue.path.endsWith('capacity_fallback_models'))).toBe(true);
});
