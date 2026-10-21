"use strict";

// Offline regression of the ACTUAL GitSync.pushLocalChanges implementation.
// Local Git history is real; remote fetch/push never contacts GitHub.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const io = fs.promises;
const path = require("node:path");
const os = require("node:os");
const { test, before, after } = require("node:test");
const { build } = require("esbuild");
const git = require("isomorphic-git");

const author = { name: "Offline test", email: "test@example.invalid" };
const card = "01_Карточки/Тест/058 — Карточка.md";
const index = "90_Индексы/Авторы.md";
const outside = ["PROJECT_RULES.md", "tools/validate_corpus.py", "schema/card.schema.json"];
const originals = new Map([
  [card, "id: 058\noriginal card text\n"],
  [index, "# Authors\n"],
  [outside[0], "# Rules\n"],
  [outside[1], "print('validator')\n"],
  [outside[2], '{"type":"object"}\n'],
]);
let GitSync, buildPath, remotePushCount = 0;
const realPush = git.push;

before(async () => {
  buildPath = path.join(process.cwd(), "node_modules", ".carmina-push-regression.cjs");
  await build({
    entryPoints: ["src/sync/git-sync.ts"],
    outfile: buildPath,
    bundle: true, platform: "node", format: "cjs",
    external: ["isomorphic-git"], logLevel: "silent",
    plugins: [{ name: "no-network-obsidian", setup(b) {
      b.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "offline" }));
      b.onLoad({ filter: /.*/, namespace: "offline" }, () => ({
        contents: 'module.exports = { requestUrl() { throw Error("NETWORK FORBIDDEN IN TEST"); } };',
        loader: "js",
      }));
    } }],
  });
  ({ GitSync } = require(buildPath));
  git.push = async (options) => {
    assert.equal(options.force, false);
    remotePushCount++;
    return { ok: true };
  };
});

after(async () => {
  git.push = realPush;
  if (buildPath) await io.rm(buildPath, { force: true });
});

function adapterFor(root) {
  const local = (p) => path.join(root, p);
  const mkdirParent = (p) => io.mkdir(path.dirname(local(p)), { recursive: true });
  return {
    async readBinary(p) {
      const b = await io.readFile(local(p));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
    async write(p, str) { await mkdirParent(p); await io.writeFile(local(p), str); },
    async writeBinary(p, b) { await mkdirParent(p); await io.writeFile(local(p), Buffer.from(b)); },
    async remove(p) { await io.rm(local(p), { force: true }); },
    async mkdir(p) { await io.mkdir(local(p), { recursive: true }); },
    async list(p) {
      const entries = await io.readdir(local(p), { withFileTypes: true });
      const rel = (name) => p ? p + "/" + name : name;
      return {
        files: entries.filter((e) => e.isFile()).map((e) => rel(e.name)),
        folders: entries.filter((e) => e.isDirectory()).map((e) => rel(e.name)),
      };
    },
    async stat(p) {
      try {
        const s = await io.stat(local(p));
        return { type: s.isFile() ? "file" : "folder", size: s.size, mtime: s.mtimeMs, ctime: s.ctimeMs };
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
  };
}

async function fixture(t) {
  const dir = await io.mkdtemp(path.join(os.tmpdir(), "carmina-offline-push-"));
  t.after(() => io.rm(dir, { force: true, recursive: true }));
  await git.init({ fs, dir, defaultBranch: "main" });
  for (const [p, contents] of originals) {
    await io.mkdir(path.dirname(path.join(dir, p)), { recursive: true });
    await io.writeFile(path.join(dir, p), contents);
    if (p === outside[1]) await io.chmod(path.join(dir, p), 0o755);
    await git.add({ fs, dir, filepath: p });
  }
  const baseline = await git.commit({ fs, dir, author, message: "isolated baseline" });
  // Absent on Android is NOT a canonical deletion.
  for (const p of outside) await io.unlink(path.join(dir, p));
  const sync = new GitSync(
    adapterFor(dir), dir, "FAKE-NOT-USED", "offline",
    "test-owner", "test-repo", "main", () => false, "carmina-mobile"
  );
  sync.fetchRemote = async () => baseline;
  remotePushCount = 0;
  return { dir, baseline, sync };
}

async function assertPreservedOutside(dir, before, afterCommit) {
  for (const filepath of outside) {
    const b = await git.readBlob({ fs, dir, oid: before, filepath });
    const a = await git.readBlob({ fs, dir, oid: afterCommit, filepath });
    assert.deepEqual(Buffer.from(a.blob), Buffer.from(b.blob), filepath);
  }
  // Compare the actual Git tree mode; a 100755 -> 100644 change has identical blob OIDs
  // and escaped the original blob-only regression coverage.
  const changedModes = await git.walk({
    fs, dir, trees: [git.TREE({ ref: before }), git.TREE({ ref: afterCommit })],
    map: async (filepath, [a, b]) => {
      if (!outside.includes(filepath)) return;
      return {
        filepath, beforeMode: await a?.mode(), afterMode: await b?.mode(),
      };
    },
  });
  for (const row of changedModes.filter(Boolean)) {
    assert.equal(row.afterMode, row.beforeMode, `unexpected mode change: ${row.filepath}`);
  }
}

test("mobile Push of one edited card preserves every unmaterialized canonical file", async (t) => {
  const { dir, baseline, sync } = await fixture(t);
  await io.writeFile(path.join(dir, card), "id: 058\nedited card text\n");
  const result = await sync.pushLocalChanges("single card test");
  assert.equal(result.success, true, result.error || result.message);
  assert.equal(remotePushCount, 1);
  const head = await git.resolveRef({ fs, dir, ref: "main" });
  assert.notEqual(head, baseline);
  assert.deepEqual((await git.listFiles({ fs, dir, ref: head })).sort(), [...originals.keys()].sort());
  await assertPreservedOutside(dir, baseline, head);
  const changed = await git.walk({ fs, dir, trees: [git.TREE({ ref: baseline }), git.TREE({ ref: head })],
    map: async (p, [a, b]) => {
      if (p === "." || (await a?.type()) === "tree" || (await b?.type()) === "tree") return;
      return (await a?.oid()) !== (await b?.oid()) ? p : undefined;
    },
  });
  assert.deepEqual(changed.filter(Boolean), [card]);
});

test("in-profile deletion commits only that deletion, not missing development files", async (t) => {
  const { dir, baseline, sync } = await fixture(t);
  await io.unlink(path.join(dir, index));
  const result = await sync.pushLocalChanges("delete index in fixture");
  assert.equal(result.success, true, result.error || result.message);
  assert.equal(remotePushCount, 1);
  const head = await git.resolveRef({ fs, dir, ref: "main" });
  assert.deepEqual((await git.listFiles({ fs, dir, ref: head })).sort(), [...originals.keys()].filter((p) => p !== index).sort());
  await assertPreservedOutside(dir, baseline, head);
});

test("previously staged deletion outside mobile profile blocks Push before commit", async (t) => {
  const { dir, baseline, sync } = await fixture(t);
  await git.remove({ fs, dir, filepath: outside[0] });
  await io.writeFile(path.join(dir, card), "edited locally\n");
  const result = await sync.pushLocalChanges("must block");
  assert.equal(result.success, false);
  assert.match(result.message, /staged changes exist outside/);
  assert.equal(await git.resolveRef({ fs, dir, ref: "main" }), baseline);
  assert.equal(remotePushCount, 0);
});

test("stale out-of-profile mode-only staging is repaired without touching content", async (t) => {
  const { dir, baseline, sync } = await fixture(t);
  const filepath = outside[1];
  const original = await git.readBlob({ fs, dir, oid: baseline, filepath });
  await git.updateIndex({
    fs, dir, filepath, oid: original.oid, mode: 0o100644,
  });
  await io.writeFile(path.join(dir, card), "edited locally\\n");
  const result = await sync.pushLocalChanges("repair mode-only and push card");
  assert.equal(result.success, true, JSON.stringify(result));
  assert.match(result.logs.join("\\n"), /restored out-of-profile index mode from HEAD/);
  assert.equal(remotePushCount, 1);
  const head = await git.resolveRef({ fs, dir, ref: "main" });
  assert.notEqual(head, baseline);
  await assertPreservedOutside(dir, baseline, head);
});

test("mode-only stale index with no in-profile edits creates no commit or Push", async (t) => {
  const { dir, baseline, sync } = await fixture(t);
  const filepath = outside[1];
  const original = await git.readBlob({ fs, dir, oid: baseline, filepath });
  await git.updateIndex({ fs, dir, filepath, oid: original.oid, mode: 0o100644 });
  const result = await sync.pushLocalChanges("repair index only");
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.changed, false);
  assert.equal(await git.resolveRef({ fs, dir, ref: "main" }), baseline);
  assert.equal(remotePushCount, 0);
  assert.deepEqual(await sync.outOfProfileTreeChanges(baseline), []);
});

test("out-of-profile content changes are never repaired or pushed", async (t) => {
  const { dir, baseline, sync } = await fixture(t);
  const filepath = outside[1];
  // Present the file momentarily to let isomorphic-git stage a real content edit.
  await io.writeFile(path.join(dir, filepath), "malicious staged change\\n");
  await git.add({ fs, dir, filepath });
  await io.unlink(path.join(dir, filepath));
  await io.writeFile(path.join(dir, card), "intended mobile edit\\n");
  const result = await sync.pushLocalChanges("must refuse out-of-profile content");
  assert.equal(result.success, false);
  assert.match(result.message, /staged changes exist outside/);
  assert.equal(remotePushCount, 0);
  assert.equal(await git.resolveRef({ fs, dir, ref: "main" }), baseline);
});

test("already committed mode-only change outside profile cannot be pushed", async (t) => {
  const { dir, baseline, sync } = await fixture(t);
  const filepath = outside[1];
  const original = await git.readBlob({ fs, dir, oid: baseline, filepath });
  await git.updateIndex({ fs, dir, filepath, oid: original.oid, mode: 0o100644 });
  const wrongLocalCommit = await git.commit({
    fs, dir, author, message: "pre-existing unsafe local mode change",
  });
  assert.notEqual(wrongLocalCommit, baseline);
  const result = await sync.pushLocalChanges("must block prior mode change");
  assert.equal(result.success, false);
  assert.match(result.message, /outgoing Git history changes files outside/);
  assert.equal(await git.resolveRef({ fs, dir, ref: "main" }), wrongLocalCommit);
  assert.equal(remotePushCount, 0);
});

test("remote branch ahead of mobile branch blocks Push without committing", async (t) => {
  const { dir, baseline, sync } = await fixture(t);
  const remoteFile = "90_Индексы/Remote.md";
  await io.writeFile(path.join(dir, remoteFile), "remote change\n");
  await git.add({ fs, dir, filepath: remoteFile });
  const remote = await git.commit({ fs, dir, author, message: "simulate newer GitHub HEAD" });
  await git.writeRef({ fs, dir, ref: "refs/heads/main", value: baseline, force: true });
  sync.fetchRemote = async () => remote;
  await io.writeFile(path.join(dir, card), "unpublished phone edit\n");
  const result = await sync.pushLocalChanges("must not override remote");
  assert.equal(result.success, false);
  assert.match(result.message, /GitHub changed/);
  assert.equal(await git.resolveRef({ fs, dir, ref: "main" }), baseline);
  assert.equal(remotePushCount, 0);
});

test("unmaterialized mobile-excluded files alone do not produce a Push", async (t) => {
  const { dir, baseline, sync } = await fixture(t);
  const result = await sync.pushLocalChanges("nothing to commit");
  assert.equal(result.success, true, result.error || result.message);
  assert.equal(result.changed, false);
  assert.equal(await git.resolveRef({ fs, dir, ref: "main" }), baseline);
  assert.equal(remotePushCount, 0);
});
