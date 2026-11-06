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
  return isNum(p.recordingsTotal) && isNum(p.recordingsLoaded) && typeof p.done === "boolean" &&
    Array.isArray(v.collaborators) && v.collaborators.every(isCollaborator);
}

export function isSharedRecording(v: unknown): v is SharedRecording {
  return isObj(v) && isStr(v.recordingId) && isStr(v.title) && optStr(v.date) && optNum(v.year) &&
    optStr(v.album) && isObj(v.instruments) && isStrArr(v.instruments.player) &&
    isStrArr(v.instruments.collaborator);
}
