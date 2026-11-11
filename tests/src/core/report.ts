/**
 * Report generation. results.json is the contract; report.html is a pure,
 * self-contained projection (no framework, no network) that opens from file://
 * or as a CI artifact. Hierarchy: domain → flow ID → step → req/res + assertions.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseTestCaseId, testCaseLogFile } from "@kortix/api-contract/test-case";
import type { FlowResult, RunResult, StepResult } from "./result";
import { scrubValue } from "./scrub";

/** The case log of a case id, relative to `resultsDir`, when the API wrote one. */
function existingCaseLog(resultsDir: string, caseId: string | undefined): string | undefined {
  const id = parseTestCaseId(caseId);
  if (!id) return undefined;
  const file = testCaseLogFile(id);
  return existsSync(join(resultsDir, file)) ? file : undefined;
}

/**
 * Link every step (and every flow body, step 0) to the case log the API wrote
 * for it under `<resultsDir>/case-logs/`. An API without the local test
 * profile writes none, so a missing file leaves no link.
 */
export function attachCaseLogs(result: RunResult, resultsDir: string): RunResult {
  return {
    ...result,
    flows: result.flows.map((f): FlowResult => ({
      ...f,
      caseLog: existingCaseLog(resultsDir, f.caseId),
      steps: f.steps.map((st): StepResult => ({ ...st, caseLog: existingCaseLog(resultsDir, st.caseId) })),
    })),
  };
}

/** The `x-request-id` of every response a step received, in order. */
export function stepRequestIds(step: Pick<StepResult, "requests">): string[] {
  return step.requests.map((r) => r.res.headers?.["x-request-id"]).filter((v): v is string => Boolean(v));
}

/**
 * One block per failed flow for the terminal: the reason, the failing step,
 * its last request, the response's `x-request-id`, and the case log.
 */
export function renderFailureLines(result: RunResult, resultsDir?: string): string[] {
  const lines: string[] = [];
  for (const f of result.flows) {
    if (f.status !== "fail") continue;
    lines.push(`FAIL ${f.id}: ${f.reason ?? "failed"}`);
    const failed = f.steps.find((st) => st.status === "fail");
    if (failed) {
      lines.push(`  step: ${failed.name}`);
      const last = failed.requests.at(-1);
      if (last) lines.push(`  request: ${last.req.method} ${last.req.url} -> ${last.res.status}`);
      const ids = stepRequestIds(failed);
      if (ids.length) lines.push(`  x-request-id: ${ids.join(", ")}`);
    }
    const log = failed?.caseLog ?? f.caseLog;
    if (log) lines.push(`  case log: ${resultsDir ? join(resultsDir, log) : log}`);
    else if (failed?.caseId ?? f.caseId) lines.push(`  case: ${failed?.caseId ?? f.caseId} (the API wrote no case log)`);
  }
  return lines;
}

export function writeResults(result: RunResult, jsonPath: string, htmlPath: string): RunResult {
  // Both files are uploaded as public workflow artifacts. Scrub by shape here,
  // after every capture-time key mask, so no path into the tree can carry a
  // token out (see scrub.ts).
  const safe = attachCaseLogs(scrubValue(result), dirname(jsonPath));
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(safe, null, 2));
  writeFileSync(htmlPath, renderHtml(safe));
  return safe;
}

function targetLine(result: RunResult): string {
  const parts: string[] = [];
  if (result.targetKind) {
    parts.push(`target ${result.targetKind}: ${result.scheduled?.length ?? result.flows.length} scheduled, ${result.excludedFlows?.length ?? 0} excluded with a reason`);
  }
  for (const [kind, c] of Object.entries(result.targets ?? {})) {
    parts.push(`${kind}: ${c.declared} declared, ${c.skipped.length} skip`);
  }
  return parts.join(" · ");
}

/** Compact GitHub step-summary markdown (flow-ID matrix). */
export function renderStepSummary(result: RunResult): string {
  const s = result.summary;
  const byDomain = new Map<string, typeof result.flows>();
  for (const f of result.flows) {
    if (!byDomain.has(f.domain)) byDomain.set(f.domain, []);
    byDomain.get(f.domain)!.push(f);
  }
  const icon = (st: string) => (st === "pass" ? "✅" : st === "fail" ? "❌" : st === "skip" ? "⚪" : "🟡");
  let md = `## ke2e — ${result.target} (${result.apiUrl})\n\n`;
  md += `**${s.passed}/${s.total} passed** · ${s.failed} failed · ${s.skipped} skipped · ${s.todo} todo · ${(s.durationMs / 1000).toFixed(1)}s\n\n`;
  const targets = targetLine(result);
  if (targets) md += `${targets}\n\n`;
  for (const e of result.excludedFlows ?? []) md += `- excluded \`${e.id}\`: ${e.reason}\n`;
  if (result.excludedFlows?.length) md += "\n";
  for (const [domain, flows] of [...byDomain].sort()) {
    md += `### ${domain}\n`;
    md += flows
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      .map((f) => `${icon(f.status)} \`${f.id}\``)
      .join(" · ");
    md += "\n\n";
  }
  return md;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function renderHtml(result: RunResult): string {
  const data = JSON.stringify(result).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ke2e report — ${result.target}</title>
<style>
:root{--bg:#0b0d10;--panel:#14181d;--mut:#8a94a6;--line:#222a33;--pass:#2ea043;--fail:#f85149;--skip:#8a94a6;--todo:#d29922;--fg:#e6edf3}
*{box-sizing:border-box}body{margin:0;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--bg);color:var(--fg)}
header{padding:16px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
h1{font-size:15px;margin:0 0 6px}.meta{color:var(--mut);font-size:12px}
.summary{margin-top:10px;display:flex;gap:14px;flex-wrap:wrap}.summary b{font-weight:700}
.matrix{padding:12px 20px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:6px}
.chip{padding:2px 7px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid var(--line)}
.pass{color:var(--pass)}.fail{color:var(--fail)}.skip{color:var(--skip)}.todo{color:var(--todo)}
.chip.pass{background:rgba(46,160,67,.12)}.chip.fail{background:rgba(248,81,73,.15)}.chip.skip{background:rgba(138,148,166,.12)}.chip.todo{background:rgba(210,153,34,.14)}
main{padding:12px 20px;max-width:1100px}
details{border:1px solid var(--line);border-radius:7px;margin:8px 0;background:var(--panel)}
summary{padding:9px 12px;cursor:pointer;list-style:none;display:flex;gap:10px;align-items:center}
summary::-webkit-details-marker{display:none}
.dom{font-weight:700;font-size:13px}.dur{color:var(--mut);margin-left:auto;font-size:11px}
.flow summary{font-size:12px}.id{font-weight:700}
.step{margin:0 12px 8px;border-left:2px solid var(--line);padding-left:10px}
.req{background:#0d1117;border:1px solid var(--line);border-radius:6px;padding:8px;margin:6px 0;overflow:auto}
.req .ln{white-space:pre-wrap;word-break:break-all}.url{color:#79c0ff}
.assert{font-size:12px;margin:3px 0}.assert.fail{color:var(--fail)}.assert.pass{color:var(--mut)}
.reason{color:var(--fail);font-size:12px;padding:4px 12px}
a{color:#79c0ff}
.tag{color:var(--mut);font-size:10px;border:1px solid var(--line);border-radius:4px;padding:0 5px;margin-left:4px}
button.copy{font:inherit;font-size:10px;background:#21262d;color:var(--fg);border:1px solid var(--line);border-radius:4px;padding:1px 6px;cursor:pointer;float:right}
</style></head><body>
<header>
<h1>ke2e report — <span class="${result.summary.failed ? "fail" : "pass"}">${result.summary.failed ? "FAILED" : "GREEN"}</span></h1>
<div class="meta">target <b>${result.target}</b> · ${result.apiUrl} · ${result.gitSha ?? "no-sha"} · ${result.startedAt}</div>
<div class="summary">
<span class="pass">✓ <b id="s-pass"></b> passed</span>
<span class="fail">✗ <b id="s-fail"></b> failed</span>
<span class="skip">○ <b id="s-skip"></b> skipped</span>
<span class="todo">● <b id="s-todo"></b> todo</span>
<span class="meta"><b id="s-dur"></b></span>
</div>
<div class="meta" id="targets">${escapeHtml(targetLine(result))}</div></header>
<div class="matrix" id="matrix"></div>
<main id="root"></main>
<script>
const DATA = ${data};
const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
document.getElementById('s-pass').textContent = DATA.summary.passed;
document.getElementById('s-fail').textContent = DATA.summary.failed;
document.getElementById('s-skip').textContent = DATA.summary.skipped;
document.getElementById('s-todo').textContent = DATA.summary.todo;
document.getElementById('s-dur').textContent = (DATA.summary.durationMs/1000).toFixed(1)+'s';
const mat = document.getElementById('matrix');
for (const f of DATA.flows) {
  const c = document.createElement('span');
  c.className = 'chip ' + f.status; c.textContent = f.id; c.title = f.reason || f.status;
  c.onclick = () => { const el = document.getElementById('flow-'+f.id); if (el){el.open=true; el.scrollIntoView({behavior:'smooth',block:'center'});} };
  mat.appendChild(c);
}
const domains = {};
for (const f of DATA.flows) (domains[f.domain] ||= []).push(f);
const root = document.getElementById('root');
const shq = s => "'"+String(s).replace(/'/g, "'\\\\''")+"'";
function curlOf(r){
  let s = 'curl -X '+r.req.method+' '+shq(r.req.url);
  for (const [k,v] of Object.entries(r.req.headers||{})) s += " \\\\\\n  -H "+shq(k+': '+v);
  if (r.req.body) s += " \\\\\\n  -d "+shq(r.req.body);
  return s;
}
for (const [dom, flows] of Object.entries(domains).sort()) {
  const d = document.createElement('details'); d.open = flows.some(f=>f.status==='fail');
  const fails = flows.filter(f=>f.status==='fail').length;
  d.innerHTML = '<summary><span class="dom">'+dom+'</span><span class="'+(fails?'fail':'pass')+'">'+(flows.length-fails)+'/'+flows.length+'</span><span class="dur">'+flows.length+' flows</span></summary>';
  for (const f of flows.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}))) {
    const fd = document.createElement('details'); fd.className='flow'; fd.id='flow-'+f.id; fd.open = f.status==='fail';
    let h = '<summary><span class="id '+f.status+'">'+(f.status==='pass'?'✓':f.status==='fail'?'✗':f.status==='skip'?'○':'●')+' '+f.id+'</span>';
    h += (f.tags||[]).map(t=>'<span class="tag">'+t+'</span>').join('');
    h += '<span class="dur">'+(f.durationMs/1000).toFixed(2)+'s'+(f.attempts>1?' · '+f.attempts+'×':'')+'</span></summary>';
    fd.innerHTML = h;
    if (f.reason) { const r=document.createElement('div'); r.className='reason'; r.textContent=f.reason; fd.appendChild(r); }
    if (f.status==='fail' && f.caseLog) { const c=document.createElement('div'); c.className='reason'; c.innerHTML='flow body case log <a class="caselog" href="'+esc(f.caseLog)+'">'+esc(f.caseLog)+'</a>'; fd.appendChild(c); }
    for (const st of (f.steps||[])) {
      const sd = document.createElement('div'); sd.className='step';
      sd.innerHTML = '<div class="'+st.status+'">'+(st.status==='pass'?'✓':'✗')+' '+esc(st.name)+' <span class="dur">'+(st.durationMs/1000).toFixed(2)+'s</span></div>';
      if (st.status==='fail') {
        const ev = document.createElement('div'); ev.className='evidence';
        const rids = (st.requests||[]).map(r=>(r.res.headers||{})['x-request-id']).filter(Boolean);
        ev.innerHTML = (st.error?'<div class="reason">'+esc(st.error.message)+'</div>':'')
          + (st.caseLog?'<div class="ln meta">case log <a class="caselog" href="'+esc(st.caseLog)+'">'+esc(st.caseLog)+'</a></div>'
                       :(st.caseId?'<div class="ln meta">case '+esc(st.caseId)+' (the API wrote no case log)</div>':''))
          + (rids.length?'<div class="ln meta">x-request-id '+rids.map(esc).join(', ')+'</div>':'');
        sd.appendChild(ev);
      }
      for (const r of (st.requests||[])) {
        const rq = document.createElement('div'); rq.className='req';
        const id='c'+Math.random().toString(36).slice(2);
        rq.innerHTML = '<button class="copy" onclick="navigator.clipboard.writeText(window[\\''+id+'\\'])">copy curl</button>'
          + '<div class="ln"><span class="'+(r.res.status>=400?'fail':'pass')+'">'+r.res.status+'</span> <b>'+r.req.method+'</b> <span class="url">'+esc(r.req.url)+'</span> <span class="dur">'+r.ms.toFixed(0)+'ms</span></div>'
          + (r.req.body?'<div class="ln meta">→ '+esc(r.req.body)+'</div>':'')
          + '<div class="ln meta">← '+esc((r.res.bodyText||'').slice(0,2000))+'</div>';
        window[id]=curlOf(r); sd.appendChild(rq);
      }
      for (const a of (st.assertions||[])) {
        const ad = document.createElement('div'); ad.className='assert '+(a.pass?'pass':'fail');
        ad.textContent = (a.pass?'✓ ':'✗ ')+a.description+(a.pass?'':' → got '+JSON.stringify(a.actual));
        sd.appendChild(ad);
      }
      fd.appendChild(sd);
    }
    d.appendChild(fd);
  }
  root.appendChild(d);
}
</script></body></html>`;
}
