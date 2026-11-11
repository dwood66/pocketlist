// Links to find a song on the streaming services, by search. See PlaylistView.

export const SERVICES = [
  { name: "Spotify", url: (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
  { name: "Apple Music", url: (q: string) => `https://music.apple.com/us/search?term=${encodeURIComponent(q)}` },
  { name: "YouTube Music", url: (q: string) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}` },
];

/** Bandcamp: where people buy records, so look for the album. Its search wants few words: "album
 *  artist" finds the record, but add the song title and it finds nothing. With no album, the song
 *  and who's on it, as a track search. */
export function bandcampUrl(track: { title: string; album?: string; albumArtist?: string; artist?: string }, who: string[]) {
  // A compilation's "Various Artists" only gets in the way of the album's title.
  const artist = (track.albumArtist ?? track.artist ?? who[0] ?? "").replace(/^various artists$/i, "");
  const [q, type] = track.album ? [`${track.album} ${artist}`, "a"] : [`${bareTitle(track.title)} ${track.artist ?? who[0] ?? ""}`, "t"];
  return `https://bandcamp.com/search?q=${encodeURIComponent(q.replace(/\s+/g, " ").trim())}&item_type=${type}`;
}

/** What to search for: the title without "(alternate take)" and the like, plus the album, or failing that, who's on it. */
export function listenQuery(track: { title: string; album?: string; albumArtist?: string; artist?: string }, who: string[]) {
  const title = bareTitle(track.title);
  if (track.album) return `${title} ${track.artist ?? track.albumArtist ?? ""} ${track.album}`.replace(/\s+/g, " ").trim();
  return `${title} ${track.artist ?? who.slice(0, 2).join(" ")}`.trim();
}

const bareTitle = (t: string) => t.replace(/\s*[([][^)\]]*[)\]]/g, "").trim() || t;

/** 565000 → "9:25"; an hour or more → "1:02:05". */
export function formatLength(ms?: number) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** One line for TuneMyMusic or Soundiiz: "Artist - Title", which both read when you paste a list. */
export function textListLine(track: { title: string; artist?: string; albumArtist?: string }, who: string[]) {
  return `${track.artist ?? track.albumArtist ?? who[0] ?? ""} - ${bareTitle(track.title)}`.replace(/^ - /, "");
}

