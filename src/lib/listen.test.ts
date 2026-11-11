import { test } from "node:test";
import assert from "node:assert/strict";
import { bandcampUrl, formatLength, listenQuery, SERVICES, textListLine } from "./listen.ts";

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

test("the recording's own artist is searched for first", () => {
  assert.equal(listenQuery({ title: "Joshua", album: "Seven Steps", albumArtist: "Miles Davis", artist: "Miles Davis Quintet" }, []), "Joshua Miles Davis Quintet Seven Steps");
});

test("lengths read like a track list", () => {
  assert.equal(formatLength(565_000), "9:25");
  assert.equal(formatLength(65_400), "1:05");
  assert.equal(formatLength(3_725_000), "1:02:05");
  assert.equal(formatLength(undefined), "");
});

test("text list lines for TuneMyMusic and Soundiiz", () => {
  assert.equal(textListLine({ title: "So What (alternate take)", artist: "Miles Davis" }, []), "Miles Davis - So What");
  assert.equal(textListLine({ title: "Blue Day", albumArtist: "The Smoking Section" }, []), "The Smoking Section - Blue Day");
  assert.equal(textListLine({ title: "Driving" }, ["Damon Wood"]), "Damon Wood - Driving");
});

test("Bandcamp looks for the album by its artist, or the song when there's no album", () => {
  assert.equal(bandcampUrl({ title: "Hanging Out", album: "Live in New York", albumArtist: "Bob Reynolds", artist: "Bob Reynolds" }, []),
    "https://bandcamp.com/search?q=Live%20in%20New%20York%20Bob%20Reynolds&item_type=a");
  assert.equal(bandcampUrl({ title: "So What (alternate take)", artist: "Miles Davis" }, []),
    "https://bandcamp.com/search?q=So%20What%20Miles%20Davis&item_type=t");
  assert.equal(bandcampUrl({ title: "Teen Town", album: "Smooth Sailing", albumArtist: "Various Artists" }, []),
    "https://bandcamp.com/search?q=Smooth%20Sailing&item_type=a");
});
