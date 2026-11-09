import { pathToFileURL } from 'node:url';

export const PAGE = 'https://verbier4vallees.ch/fr/shop-en-ligne/activites/opening-session-saint-nicolas-express_activity_426820';
const BASE = 'https://verbier4vallees.ch';
const DATES = '/fr/shop/product/available-dates-times?activity_id=426820';
const PRICING = '/fr/shop/product/pricing?activity_id=426820&date=2026-12-05&startTime=07%3A00&endTime=19%3A30';
const STATE = '.monitor-state.json';
export function localDay(now) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function eligible(now) {
  const weekday = new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Zurich',weekday:'short'}).format(now);
  return !['Sat','Sun'].includes(weekday) && localDay(now) <= '2026-12-04';
}
export function dateAvailable(data) {
  const row = data?.availabilityByDate?.['426820-2026-12-05'];
  return data?.success === true && row?.date === '2026-12-05' && row.start === '07:00' && row.end === '19:30'
    && Number.isInteger(row.available) && row.available >= 2 && ['success','warning'].includes(row.status);
}
export function priceAvailable(data) {
  return data?.success === true && Number.isInteger(data.available) && data.available >= 2 && ['success','warning'].includes(data.status)
    && Array.isArray(data.priceGroups) && data.priceGroups.some(p => p.id === '0866401' && p.title === 'Participant' && p.price === 5
      && (p.availability === undefined || (Number.isInteger(p.availability) && p.availability >= 2)));
}
// Implements robots wildcard/end matching, with longest-match precedence.
export function robotsAllowed(text, path) {
  const groups = []; let group = null; let rulesStarted = false;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.split('#')[0].trim(); const i = clean.indexOf(':'); if (i < 0) continue;
    const key = clean.slice(0,i).toLowerCase(); const value = clean.slice(i+1).trim();
    if (key === 'user-agent') {
      if (!group || rulesStarted) {group = {agents:[],rules:[]}; groups.push(group); rulesStarted=false;}
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow','disallow'].includes(key)) { rulesStarted=true; group.rules.push({key,value}); }
  }
  const specific = groups.filter(g=>g.agents.some(a=>a !== '*' && 'verbierticketmonitor'.includes(a)));
  const selected = specific.length ? specific : groups.filter(g=>g.agents.includes('*'));
  let result = true, length = -1;
  for (const r of selected.flatMap(g=>g.rules)) {
    if (!r.value) continue;
    const end = r.value.endsWith('$'); const body = end ? r.value.slice(0,-1) : r.value;
    const pattern = '^' + body.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*') + (end?'$':'');
    if (new RegExp(pattern).test(path) && (body.length > length || (body.length === length && r.key === 'allow'))) {
      length=body.length; result=r.key === 'allow';
    }
  }
  return result;
}

async function main() {
  const now = new Date();
  if (!eligible(now)) {console.log('Outside monitoring dates/weekdays (Europe/Zurich).'); return;}
  if (process.env.MONITOR_ENABLED !== 'true') {console.log('Inactive: configure email secrets, then set MONITOR_ENABLED=true.'); return;}
  for (const name of ['BREVO_API_KEY','MAIL_FROM','MAIL_TO','GH_TOKEN','GITHUB_REPOSITORY']) {
    if (!process.env[name]) throw new Error(`Missing configuration: ${name}`);
  }
  let state; let sha;
  const ghUrl = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/${STATE}`;
  const ghHeaders = {Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  const existing = await fetch(ghUrl,{headers:ghHeaders,signal:AbortSignal.timeout(20000)});
  if (existing.status === 404) state = {};
  else {
    if (!existing.ok) throw new Error(`Cannot read persistent state: ${existing.status}`);
    const blob = await existing.json(); sha=blob.sha; state=JSON.parse(Buffer.from(blob.content,'base64').toString());
  }
  async function save() {
    const response = await fetch(ghUrl,{method:'PUT',headers:ghHeaders,body:JSON.stringify({message:'Update monitor state [skip ci]',content:Buffer.from(JSON.stringify(state,null,2)+'\n').toString('base64'),...(sha?{sha}:{})}),signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error(`Cannot persist state: ${response.status}`);
    sha=(await response.json()).content.sha;
  }
  if (state.halted) throw new Error('Monitoring paused after access restriction. Review site rules, then clear halted in state.');
  if (Date.now() < (state.nextCheck || 0)) {console.log('Rate-limit cooldown active.'); return;}
  // Persist before website requests, including manual runs. Missing write permission fails closed.
  // Allow one minute of runner-start jitter between nominal five-minute triggers.
  state.nextCheck=Date.now()+240000; await save();
  async function site(path, json=false) {
    const r = await fetch(BASE+path,{redirect:'manual',headers:{'User-Agent':'VerbierTicketMonitor/1.0 (+https://github.com/'+process.env.GITHUB_REPOSITORY+')','Cache-Control':'no-cache',Accept:json?'application/json':'text/html,text/plain'},signal:AbortSignal.timeout(20000)});
    if ([401,403].includes(r.status)) {state.halted=true; await save(); throw new Error('Site denied access; stopped without bypass.');}
    if (r.status === 429 || r.status === 503) {
      const raw=r.headers.get('retry-after'); const seconds=Number(raw); const until=raw && !Number.isFinite(seconds)?Date.parse(raw):Date.now()+(Number.isFinite(seconds)?seconds:3600)*1000;
      state.nextCheck=Math.max(Date.now()+3600000,Number.isFinite(until)?until:0); await save(); throw new Error('Website requested backoff.');
    }
    if (!r.ok) throw new Error(`Website returned ${r.status}; no alert.`);
    const age = Number(r.headers.get('age') || 0);
    if (!Number.isFinite(age) || age > 60) throw new Error('Stale response; no alert.');
    if (json && !r.headers.get('content-type')?.includes('application/json')) throw new Error('Unexpected response or bot challenge; no alert.');
    return json ? r.json() : r.text();
  }
  const robots=await site('/robots.txt');
  for (const path of [new URL(PAGE).pathname,DATES,PRICING]) {
    if (!robotsAllowed(robots,path)) {state.halted=true; await save(); throw new Error('robots.txt disallows access; monitor paused.');}
  }
  const html=await site(new URL(PAGE).pathname);
  if (!html.includes('data-activity-ticket-config-id="426820"') || !html.includes('05.12.2026') || !html.includes('Saint-Nicolas Express')) throw new Error('Product identity changed; no alert.');
  const dates=await site(DATES,true);
  if (!dateAvailable(dates)) {console.log('Two places not confirmed; no email.'); return;}
  const prices=await site(PRICING,true);
  if (!priceAvailable(prices)) {console.log('Price/quantity not confirmed; no email.'); return;}
  // A second read after pricing avoids relying solely on the first inventory snapshot.
  if (!dateAvailable(await site(DATES,true))) {console.log('Availability changed; no email.'); return;}
  const day=localDay(now);
  if (state.alertAttemptDay === day) {console.log('One email attempt already made today.'); return;}
  // Mark BEFORE send: a crash/ambiguous provider response cannot cause repeated messages.
  state.alertAttemptDay=day; state.emailStatus='attempting'; await save();
  const mail=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':process.env.BREVO_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({sender:{email:process.env.MAIL_FROM,name:'Alerte Verbier'},to:[{email:process.env.MAIL_TO}],subject:'Verbier : 2 billets train + ski disponibles — 5 décembre 2026',textContent:`La billetterie officielle vient d’indiquer au moins 2 places pour Opening Session + Saint-Nicolas Express le 05.12.2026 (07:00–19:30), au tarif Participant de 5 CHF par personne.\nVérifié à ${new Date().toISOString()}.\n${PAGE}\n\nDisponibilité constatée, sans réservation : elle peut changer avant votre achat. Aucun paiement effectué.`}),signal:AbortSignal.timeout(20000)});
  state.emailStatus=mail.ok?'accepted':'failed'; await save();
  if (!mail.ok) throw new Error(`Email provider returned ${mail.status}; inspect configuration before manually clearing alertAttemptDay.`);
  console.log('Availability email accepted by provider.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e=>{console.error(e.message);process.exitCode=1;});
