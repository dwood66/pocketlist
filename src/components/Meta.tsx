// A line of metadata, "a · b · c", where each part carries a title saying what it is, so
// pointing at "33 sessions" or "1959–2015" explains it. Empty parts are dropped.
import { Fragment, type ReactNode } from "react";

export type MetaPart = readonly [value: ReactNode, title: string] | false | "" | 0 | null | undefined;

export function Meta({ parts, sep = " · " }: { parts: MetaPart[]; sep?: string }) {
  const shown = parts.filter((p): p is readonly [ReactNode, string] => !!p && p[0] !== "" && p[0] !== null && p[0] !== undefined);
  return (
    <>
      {shown.map(([value, title], i) => (
        <Fragment key={i}>
          {i > 0 && sep}
          <span title={title}>{value}</span>
        </Fragment>
      ))}
    </>
  );
}
