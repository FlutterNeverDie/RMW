// History Map World 유튜브 채널 업로드 (YouTube Data API v3, 추가 패키지 없이 fetch만)
//
// 처음 한 번:  node scripts/youtube.mjs auth
//   브라우저에서 사이트 계정 → History Map World 채널 → 허용. 받은 갱신 토큰을 secrets/token.json에 저장
// 확인:       node scripts/youtube.mjs whoami
// 올리기:     node scripts/youtube.mjs upload out/a.mp4 meta.json
//   meta.json = { title, description, tags[], privacy: "private"|"unlisted"|"public", publishAt?: ISO 시각 }
//   publishAt을 주면 비공개로 올렸다가 그 시각에 유튜브가 공개한다
// 예약 묶음: node scripts/youtube.mjs queue   (uploads/schedule.json)
//   [{ video: "out/a.mp4", meta: "uploads/a.json", publishAt: "2026-10-27T13:00:00Z" }, ...]
//   아직 안 올린 항목만 publishAt을 붙여 올리고, 올린 영상 id를 그 항목에 적어 둔다 (다시 돌려도 두 번 안 올림)
//   ※ API 감사 통과 전에는 유튜브가 API 업로드를 비공개로 잠가서 예약 공개도 안 된다
//
// 열쇠 순서: 환경변수(YT_CLIENT_ID · YT_CLIENT_SECRET · YT_REFRESH_TOKEN, 깃허브 Actions용) → secrets/ 파일
import { createServer } from "node:http";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";

const SECRETS = new URL("../secrets/", import.meta.url);
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

const readJson = async (name) => JSON.parse(await readFile(new URL(name, SECRETS), "utf8"));

async function client() {
  if (process.env.YT_CLIENT_ID) return { id: process.env.YT_CLIENT_ID, secret: process.env.YT_CLIENT_SECRET };
  const { installed } = await readJson("client_secret.json");
  return { id: installed.client_id, secret: installed.client_secret };
}

async function refreshToken() {
  if (process.env.YT_REFRESH_TOKEN) return process.env.YT_REFRESH_TOKEN;
  return (await readJson("token.json")).refresh_token;
}

async function accessToken() {
  const { id, secret } = await client();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: await refreshToken(), grant_type: "refresh_token" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`토큰 갱신 실패: ${body.error} ${body.error_description ?? ""}`);
  return body.access_token;
}

// 내 맥의 임시 주소(127.0.0.1)로 구글이 돌려보내는 코드를 받는다
async function auth() {
  const { id, secret } = await client();
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const redirect = `http://127.0.0.1:${server.address().port}`;
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({ client_id: id, redirect_uri: redirect, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent" });
  const code = await new Promise((resolve, reject) => {
    server.on("request", (req, res) => {
      const q = new URL(req.url, redirect).searchParams;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(q.get("code") ? "<h2>완료 - 이 창은 닫아도 됩니다</h2>" : `<h2>실패: ${q.get("error")}</h2>`);
      q.get("code") ? resolve(q.get("code")) : reject(new Error(q.get("error") ?? "코드 없음"));
    });
    execFile("open", [url]);
    console.log("브라우저에서 허용해 주세요. 창이 안 뜨면 이 주소를 여세요:\n" + url);
  });
  server.close();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  const body = await res.json();
  if (!body.refresh_token) throw new Error(`갱신 토큰을 못 받음: ${body.error ?? JSON.stringify(Object.keys(body))}`);
  await writeFile(new URL("token.json", SECRETS), JSON.stringify({ refresh_token: body.refresh_token }), { mode: 0o600 });
  console.log("secrets/token.json 저장");
  await whoami();
}

async function whoami() {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { authorization: `Bearer ${await accessToken()}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body.error));
  for (const c of body.items ?? []) console.log(`채널: ${c.snippet.title} (${c.id})`);
}

// 이어 올리기(resumable): 세션을 연 뒤 파일을 한 번에 보낸다
async function upload(file, metaPath) {
  const meta = JSON.parse(await readFile(metaPath, "utf8"));
  const token = await accessToken();
  const size = (await stat(file)).size;
  const status = { privacyStatus: meta.publishAt ? "private" : (meta.privacy ?? "private"), selfDeclaredMadeForKids: false };
  if (meta.publishAt) status.publishAt = meta.publishAt;
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(size),
      "x-upload-content-type": "video/mp4",
    },
    body: JSON.stringify({
      snippet: { title: meta.title, description: meta.description ?? "", tags: meta.tags ?? [], categoryId: meta.categoryId ?? "27" },
      status,
    }),
  });
  if (!init.ok) throw new Error(`업로드 세션 실패: ${init.status} ${await init.text()}`);
  const res = await fetch(init.headers.get("location"), {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "video/mp4", "content-length": String(size) },
    body: await readFile(file),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`업로드 실패: ${res.status} ${JSON.stringify(body.error)}`);
  console.log(`올림: https://youtu.be/${body.id} · ${body.status.privacyStatus}${body.status.publishAt ? ` · 공개 예약 ${body.status.publishAt}` : ""}`);
  return body;
}

async function queue(path = "uploads/schedule.json") {
  const list = JSON.parse(await readFile(path, "utf8"));
  for (const item of list) {
    if (item.id) continue;
    const meta = JSON.parse(await readFile(item.meta, "utf8"));
    const tmp = `${item.meta}.queued.json`;
    await writeFile(tmp, JSON.stringify({ ...meta, publishAt: item.publishAt }));
    const body = await upload(item.video, tmp);
    await rm(tmp);
    item.id = body.id;
    await writeFile(path, JSON.stringify(list, null, 1));
  }
}

const [cmd, ...args] = process.argv.slice(2);
const run = { auth, whoami, upload, queue }[cmd];
if (!run) {
  console.log("사용법: node scripts/youtube.mjs auth | whoami | upload <영상.mp4> <meta.json> | queue [schedule.json]");
  process.exit(1);
}
await run(...args);
