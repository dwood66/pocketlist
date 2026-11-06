// Pocketlist M0 data test: how much jazz personnel do MusicBrainz and Discogs actually have?
// Run: node datatest.mjs > results.json   (progress goes to stderr)
// No keys needed. Discogs is used unauthenticated (25 req/min); its artist IDs come from
// MusicBrainz's own links, because Discogs search requires a token.

const UA = 'Pocketlist-datatest/0.1 (portfolio prototype; https://github.com/dwood66)';
const PLAYERS = [
  { name: 'Paul Chambers', hint: 'bass' },
  { name: 'Ron Carter', hint: 'bass' },
  { name: 'Elvin Jones', hint: 'drum' },
  { name: 'Bill Evans', hint: 'pian' },
  { name: 'Walter Kane', hint: '' },
];
const SAMPLE_RECORDINGS = 15;
const SAMPLE_RELEASES = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(...a);
let lastMb = 0, lastDg = 0;

async function get(url, kind) {
  const gap = kind === 'mb' ? 1100 : 2600;
  const last = kind === 'mb' ? lastMb : lastDg;
  const wait = last + gap - Date.now();
  if (wait > 0) await sleep(wait);
  if (kind === 'mb') lastMb = Date.now(); else lastDg = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
const mb = (path) => get(`https://musicbrainz.org/ws/2/${path}${path.includes('?') ? '&' : '?'}fmt=json`, 'mb');
const dg = (path) => get(`https://api.discogs.com/${path}`, 'dg');

async function musicbrainz(player) {
  const search = await mb(`artist?query=${encodeURIComponent(`artist:"${player.name}"`)}&limit=8`);
  const candidates = search.artists.map((a) => ({
    id: a.id, name: a.name, score: a.score, disambiguation: a.disambiguation ?? '',
    lifeSpan: a['life-span'] ?? {}, tags: (a.tags ?? []).map((t) => t.name),
  }));
  const exact = candidates.filter((c) => c.name.toLowerCase() === player.name.toLowerCase());
  const pick =
    (player.hint && exact.find((c) => (c.disambiguation + ' ' + c.tags.join(' ')).toLowerCase().includes(player.hint))) ||
    exact[0] || candidates[0];
  if (!pick) return { candidates, pick: null };

  const artist = await mb(`artist/${pick.id}?inc=recording-rels+url-rels`);
  const rels = (artist.relations ?? []).filter((r) => r['target-type'] === 'recording');
  const instruments = {};
  for (const r of rels) for (const i of r.attributes ?? []) instruments[i] = (instruments[i] ?? 0) + 1;
  const discogsUrl = (artist.relations ?? []).find((r) => r.type === 'discogs')?.url?.resource ?? null;

  const collaborators = {};
  const sampled = [];
  const seen = new Set();
  for (const r of rels) {
    if (sampled.length >= SAMPLE_RECORDINGS) break;
    const rec = r.recording;
    if (!rec || seen.has(rec.id)) continue;
    seen.add(rec.id);
    try {
      const full = await mb(`recording/${rec.id}?inc=artist-rels`);
      const others = (full.relations ?? []).filter((x) => x['target-type'] === 'artist' && x.artist?.id !== pick.id);
      for (const o of others) {
        const k = o.artist.name;
        collaborators[k] = collaborators[k] ?? { count: 0, roles: new Set() };
        collaborators[k].count++;
        collaborators[k].roles.add([o.type, ...(o.attributes ?? [])].join(':'));
      }
      sampled.push({ title: rec.title, otherCredits: others.length });
      log(`  mb ${player.name}: ${rec.title} (${others.length} other credits)`);
    } catch (e) { log('  mb error', e.message); }
  }
  return {
    candidates, pick,
    recordingRelationships: rels.length,
    uniqueRecordings: new Set(rels.map((r) => r.recording?.id)).size,
    instruments,
    discogsUrl,
    sampled,
    sampledWithZeroOtherCredits: sampled.filter((s) => s.otherCredits === 0).length,
    topCollaborators: Object.entries(collaborators)
      .sort((a, b) => b[1].count - a[1].count).slice(0, 15)
      .map(([name, v]) => ({ name, count: v.count, roles: [...v.roles] })),
  };
}

async function discogs(discogsUrl, name) {
  const id = discogsUrl?.match(/artist\/(\d+)/)?.[1];
  if (!id) return { note: 'no Discogs link on the MusicBrainz artist' };
  const list = await dg(`artists/${id}/releases?per_page=100&sort=year`);
  const items = list.releases ?? [];
  const byRole = {};
  for (const r of items) byRole[r.role] = (byRole[r.role] ?? 0) + 1;
  const collaborators = {};
  const sampled = [];
  const picks = items.filter((r) => r.role === 'Main' || r.role === 'Appearance').slice(0, SAMPLE_RELEASES);
  for (const r of picks) {
    try {
      const rel = r.type === 'master'
        ? await dg(`releases/${(await dg(`masters/${r.id}`)).main_release}`)
        : await dg(`releases/${r.id}`);
      const credits = [...(rel.extraartists ?? []),
        ...(rel.tracklist ?? []).flatMap((t) => t.extraartists ?? [])];
      const trackLevel = (rel.tracklist ?? []).some((t) => (t.extraartists ?? []).length > 0);
      for (const c of credits) {
        if (String(c.id) === id) continue;
        collaborators[c.name] = collaborators[c.name] ?? { count: 0, roles: new Set() };
        collaborators[c.name].count++;
        collaborators[c.name].roles.add(c.role);
      }
      sampled.push({ title: rel.title, year: rel.year, credits: credits.length, trackLevelCredits: trackLevel });
      log(`  discogs ${name}: ${rel.title} (${credits.length} credits)`);
    } catch (e) { log('  discogs error', e.message); }
  }
  return {
    discogsId: id, totalListed: list.pagination?.items ?? items.length, firstPageByRole: byRole, sampled,
    topCollaborators: Object.entries(collaborators)
      .sort((a, b) => b[1].count - a[1].count).slice(0, 15)
      .map(([n, v]) => ({ name: n, count: v.count, roles: [...v.roles] })),
  };
}

const out = [];
for (const p of PLAYERS) {
  log(`== ${p.name}`);
  const m = await musicbrainz(p).catch((e) => ({ error: e.message }));
  const d = await discogs(m.discogsUrl, p.name).catch((e) => ({ error: e.message }));
  out.push({ player: p, musicbrainz: m, discogs: d });
}
console.log(JSON.stringify(out, null, 2));
