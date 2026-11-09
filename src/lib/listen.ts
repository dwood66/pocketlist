// Links to find a song on the streaming services, by search. See PlaylistView.

export const SERVICES = [
  { name: "Spotify", url: (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
  { name: "Apple Music", url: (q: string) => `https://music.apple.com/us/search?term=${encodeURIComponent(q)}` },
  { name: "YouTube Music", url: (q: string) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}` },
];

/** What to search for: the title without "(alternate take)" and the like, plus the album, or failing that, who's on it. */
export function listenQuery(track: { title: string; album?: string; albumArtist?: string }, who: string[]) {
  const title = track.title.replace(/\s*[([][^)\]]*[)\]]/g, "").trim() || track.title;
  if (track.album) return `${title} ${track.albumArtist ?? ""} ${track.album}`.replace(/\s+/g, " ").trim();
  return `${title} ${who.slice(0, 2).join(" ")}`.trim();
}

