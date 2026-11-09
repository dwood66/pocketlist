import { test } from "node:test";
import assert from "node:assert/strict";
import { listenQuery, SERVICES } from "./listen.ts";

test("searches for the title and album, without take notes", () => {
  assert.equal(listenQuery({ title: "So What (alternate take)", album: "Kind of Blue" }, ["Miles Davis"]), "So What Kind of Blue");
  assert.equal(listenQuery({ title: "Blue Day [rough mix]", album: "Smooth & Nasty" }, []), "Blue Day Smooth & Nasty");
});

test("adds the album artist when known", () => {
  assert.equal(listenQuery({ title: "Joshua", album: "Seven Steps to Heaven", albumArtist: "Miles Davis" }, []), "Joshua Miles Davis Seven Steps to Heaven");
});

test("falls back to the players when there's no album", () => {
  assert.equal(listenQuery({ title: "Driving (Again)" }, ["Damon Wood", "Kenny Brooks", "Adam Beach"]), "Driving Damon Wood Kenny Brooks");
});

test("keeps a title that is all parentheses", () => {
  assert.equal(listenQuery({ title: "(Untitled)" }, ["X"]), "(Untitled) X");
});

test("service links encode the query", () => {
  assert.equal(SERVICES[0].url("So What & more"), "https://open.spotify.com/search/So%20What%20%26%20more");
});
