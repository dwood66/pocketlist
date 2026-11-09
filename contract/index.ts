// The contract between the API and the app. Both sides import this file, so a renamed
// field is a compile error on both sides instead of a bug on one.

/** One possible match for a typed name, shown on the "which one?" step. */
export type PlayerCandidate = {
  id: string; // MusicBrainz artist ID
  name: string;
  disambiguation?: string; // MusicBrainz's own note, e.g. "US jazz bassist"
  type?: string; // Person, Group…
  country?: string;
  years?: string; // "1935–1969", from the life span
  /** Set when the name matched through an alias ("Walter Kane" → Wally Kane). */
  matchedAlias?: string;
  /** True when the instrument the user typed appears in the description or tags. */
  instrumentMatch: boolean;
};

export type Player = { id: string; name: string; disambiguation?: string };

export type Collaborator = {
  id: string;
  name: string;
  disambiguation?: string;
  /** Distinct performances shared, after collapsing duplicate recordings. */
  sharedRecordings: number;
  /** Distinct sessions shared: a recording date where known, else an album. */
  sharedSessions: number;
  /** What they played on the shared recordings, most frequent first. */
  instruments: string[];
  firstYear?: number;
  lastYear?: number;
};

export type Progress = {
  /** Recordings this player is credited on. */
  recordingsTotal: number;
  /** Of those, how many have had their full personnel read. */
  recordingsLoaded: number;
  /** True once every recording has been read (or skipped as unreadable). */
  done: boolean;
  /** During a re-read from MusicBrainz: recordings left to re-read. */
  refreshing?: number;
};

/** What the stream sends each time new credits arrive. */
export type Snapshot = {
  player: Player;
  instruments: string[]; // the player's own, most frequent first
  progress: Progress;
  collaborators: Collaborator[];
};

export type SharedRecording = {
  recordingId: string;
  title: string;
  date?: string; // session date where known
  year?: number;
  album?: string;
  albumArtist?: string;
  artist?: string;
  length?: number;
  instruments: { player: string[]; collaborator: string[] };
};

// ---------------------------------------------------------------------------
// Guards. Anything that comes over the network is `unknown` until checked.
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const optStr = (v: unknown) => v === undefined || isStr(v);
const optNum = (v: unknown) => v === undefined || isNum(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

export function isPlayer(v: unknown): v is Player {
  return isObj(v) && isStr(v.id) && isStr(v.name) && optStr(v.disambiguation);
}

export function isPlayerCandidate(v: unknown): v is PlayerCandidate {
  return isObj(v) && typeof v.instrumentMatch === "boolean" &&
    optStr(v.type) && optStr(v.country) && optStr(v.years) && optStr(v.matchedAlias) && isPlayer(v);
}

export function isCollaborator(v: unknown): v is Collaborator {
  return isObj(v) && isNum(v.sharedRecordings) && isNum(v.sharedSessions) &&
    isStrArr(v.instruments) && optNum(v.firstYear) && optNum(v.lastYear) && isPlayer(v);
}

export function isSnapshot(v: unknown): v is Snapshot {
  if (!isObj(v) || !isPlayer(v.player) || !isStrArr(v.instruments) || !isObj(v.progress)) return false;
  const p = v.progress;
  return isNum(p.recordingsTotal) && isNum(p.recordingsLoaded) && typeof p.done === "boolean" && optNum(p.refreshing) &&
    Array.isArray(v.collaborators) && v.collaborators.every(isCollaborator);
}

export function isSharedRecording(v: unknown): v is SharedRecording {
  return isObj(v) && isStr(v.recordingId) && isStr(v.title) && optStr(v.date) && optNum(v.year) &&
    optStr(v.album) && optStr(v.albumArtist) && optStr(v.artist) && optNum(v.length) && isObj(v.instruments) && isStrArr(v.instruments.player) &&
    isStrArr(v.instruments.collaborator);
}

/** One song in a sampler playlist: a performance every seed player is credited on. */
export type PlaylistTrack = {
  recordingId: string;
  title: string;
  album?: string;
  /** The album's artist as printed, e.g. "Miles Davis Quintet". */
  albumArtist?: string;
  /** The recording's own credited artist, as streaming services label the song. */
  artist?: string;
  /** Length in milliseconds: the surest way to tell one take from another. */
  length?: number;
  date?: string;
  year?: number;
  /** What each seed played on it, keyed by player id. */
  instruments: Record<string, string[]>;
};

export type Playlist = {
  seeds: Player[];
  /** How much there was to choose from: distinct performances, and the sessions they came from. */
  performances: number;
  sessions: number;
  tracks: PlaylistTrack[];
};

/** A shortest known chain between two players, one shared recording per link. */
export type Path = {
  players: Player[];
  links: { recordingId: string; title: string; album?: string; year?: number }[];
};

export function isPlaylistTrack(v: unknown): v is PlaylistTrack {
  return isObj(v) && isStr(v.recordingId) && isStr(v.title) && optStr(v.album) && optStr(v.albumArtist) && optStr(v.artist) && optNum(v.length) && optStr(v.date) &&
    optNum(v.year) && isObj(v.instruments) && Object.values(v.instruments).every(isStrArr);
}

export function isPlaylist(v: unknown): v is Playlist {
  return isObj(v) && Array.isArray(v.seeds) && v.seeds.every(isPlayer) && typeof v.performances === "number" &&
    typeof v.sessions === "number" && Array.isArray(v.tracks) && v.tracks.every(isPlaylistTrack);
}

export function isPath(v: unknown): v is Path {
  return isObj(v) && Array.isArray(v.players) && v.players.every(isPlayer) && Array.isArray(v.links) &&
    v.links.every((l) => isObj(l) && isStr(l.recordingId) && isStr(l.title) && optStr(l.album) && optNum(l.year));
}

/** A playlist along a path of players: a few songs for each link, in order. */
export type PathPlaylist = {
  players: Player[];
  links: { from: string; to: string; performances: number; tracks: PlaylistTrack[] }[];
};

export function isPathPlaylist(v: unknown): v is PathPlaylist {
  return isObj(v) && Array.isArray(v.players) && v.players.every(isPlayer) && Array.isArray(v.links) &&
    v.links.every((l) => isObj(l) && isStr(l.from) && isStr(l.to) && typeof l.performances === "number" &&
      Array.isArray(l.tracks) && l.tracks.every(isPlaylistTrack));
}

/** Direct Apple Music links for recordings, matched by title and length. `url: null` means no
 *  confident match (use a search); ids in `pending` are still being looked up. */
export type AppleMatches = {
  found: Record<string, { url: string | null; length?: number }>;
  pending: string[];
};

export function isAppleMatches(v: unknown): v is AppleMatches {
  return isObj(v) && isObj(v.found) && Array.isArray(v.pending) && v.pending.every(isStr) &&
    Object.values(v.found).every((m) => isObj(m) && (m.url === null || isStr(m.url)) && optNum(m.length));
}

/** "Swap this song": another song for the same players, or null when there's nothing else. */
export type Swap = { track: PlaylistTrack | null };
export function isSwap(v: unknown): v is Swap {
  return isObj(v) && (v.track === null || isPlaylistTrack(v.track));
}

/** Players to add to a sampler: who else is on the most of its performances. */
export type AlsoOn = { players: { player: Player; performances: number }[] };
export function isAlsoOn(v: unknown): v is AlsoOn {
  return isObj(v) && Array.isArray(v.players) && v.players.every((p) => isObj(p) && isPlayer(p.player) && isNum(p.performances));
}
