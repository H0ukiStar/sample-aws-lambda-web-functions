// Event Functions(従来型 Lambda) + Lambda Web Adapter 版の SSE サンプル。
//
// 目的: Web Functions 版と同じ SSE ダッシュボードを、
//       「従来の Lambda + Lambda Web Adapter」で実装したときのパターンを示す。
//
// 重要な違い(観測ポイント):
//   - Event Functions の実行環境は「1度に1リクエスト」しか処理しない。
//     SSE 接続のように開きっぱなしのストリーム1本が実行環境を丸ごと占有する。
//   - そのため複数クライアントが同時に接続すると、接続数ぶんの実行環境が
//     立ち上がり、各環境の activeConnections は必ず 1 となる。
//     並行して張った接続は instanceId が必ず別々になる。
//   - これが Web Functions(1環境が最大128同時接続を相乗り)との対比になる。
//
// アプリのコード自体はほぼ同じ標準 HTTP サーバー。差分は:
//   - listen ポートが AWS_LAMBDA_HTTP_ENDPOINT ではなく、
//     Web Adapter が見る PORT / AWS_LWA_PORT (デフォルト 8080)。
//   - SSE を Function URL 経由で流すには response_stream モードが必要
//     (SAM テンプレート側で設定)。

import http from "node:http";
import crypto from "node:crypto";

// この実行環境(プロセス)を識別する ID。
const INSTANCE_ID = crypto.randomUUID().slice(0, 8);
const BOOTED_AT = new Date().toISOString();

// この環境が保持している SSE 接続。
// Event Functions では通常 1 を超えにくい(1環境1リクエストのため)。
const connections = new Set();

function sseHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
}

function send(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/events") {
    const connId = crypto.randomUUID().slice(0, 6);
    sseHeaders(res);

    const conn = { id: connId, res };
    connections.add(conn);

    send(res, "hello", {
      connectionId: connId,
      instanceId: INSTANCE_ID,
      bootedAt: BOOTED_AT,
      activeConnections: connections.size,
      runtime: "event-function + lambda-web-adapter",
    });

    const timer = setInterval(() => {
      send(res, "tick", {
        connectionId: connId,
        instanceId: INSTANCE_ID,
        bootedAt: BOOTED_AT,
        activeConnections: connections.size,
        connectionIds: [...connections].map((c) => c.id),
        uptimeSec: Math.round((Date.now() - Date.parse(BOOTED_AT)) / 1000),
        now: new Date().toISOString(),
        runtime: "event-function + lambda-web-adapter",
      });
    }, 2000);

    req.on("close", () => {
      clearInterval(timer);
      connections.delete(conn);
    });
    return;
  }

  if (url.pathname === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        instanceId: INSTANCE_ID,
        bootedAt: BOOTED_AT,
        activeConnections: connections.size,
        uptimeSec: Math.round((Date.now() - Date.parse(BOOTED_AT)) / 1000),
        runtime: "event-function + lambda-web-adapter",
      }),
    );
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(DASHBOARD_HTML);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

// Web Adapter 版の作法: アダプターが見る PORT (デフォルト 8080) で listen する。
// AWS_LWA_PORT があればそちら、なければ PORT、どちらも無ければ 8080。
const port = Number(process.env.AWS_LWA_PORT || process.env.PORT || 8080);
server.listen(port, () => {
  console.log(`[event-fn-web-adapter-sse] listening on :${port}`);
  console.log(`[event-fn-web-adapter-sse] instanceId=${INSTANCE_ID}`);
});

const DASHBOARD_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Event Functions + Lambda Web Adapter - SSE デモ</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #1a1206; color: #f5e9d6; }
  header { padding: 20px 24px; background: #2a1d0a; border-bottom: 1px solid #4a3a1a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 4px 0; color: #c9b48c; font-size: 13px; }
  main { padding: 24px; }
  .controls { margin-bottom: 20px; display: flex; gap: 8px; flex-wrap: wrap; }
  button { background: #c2731b; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
  button.secondary { background: #6b5a37; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .card { background: #2a1d0a; border: 1px solid #4a3a1a; border-radius: 10px; padding: 14px; }
  .card h2 { font-size: 13px; margin: 0 0 8px; color: #f0a84b; }
  .kv { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .kv span:first-child { color: #c9b48c; }
  .badge { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 999px; background: #4a3a1a; }
  .big { font-size: 22px; font-weight: 700; color: #f0a84b; }
  .legend { background: #2a1d0a; border: 1px solid #4a3a1a; border-radius: 10px; padding: 14px; margin-bottom: 20px; font-size: 13px; }
  code { background: #1a1206; padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>
<header>
  <h1>Event Functions + Lambda Web Adapter — SSE デモ</h1>
  <p>Web Functions 版と同じ UI ですが、ランタイムは <b>従来型 Lambda + Lambda Web Adapter</b> です。</p>
  <p>★ 対比ポイント: Event Functions は 1環境=1リクエスト。複数接続を並行して開くと <b>instanceId は必ず接続ごとに別々</b>になり、各環境の activeConnections は必ず 1 になります。</p>
</header>
<main>
  <div class="legend">
    <div>観測の見方:</div>
    <div>・ローカルでは1プロセスなので instanceId は揃います(アダプターなしの素の挙動)。</div>
    <div>・実際に Lambda へデプロイすると、各 SSE 接続が別々の実行環境に割り当てられ、instanceId がばらけます。これが Web Functions との違いです。</div>
  </div>
  <div class="controls">
    <button onclick="addConn()">+ 接続を追加</button>
    <button class="secondary" onclick="addMany(5)">+ 5本まとめて</button>
    <button class="secondary" onclick="closeAll()">全接続を閉じる</button>
  </div>
  <div class="grid" id="grid"></div>
</main>
<script>
  let seq = 0;
  // 各接続の AbortController を保持。閉じるときに abort() する。
  const sources = new Map();

  function setStatus(n, text, color) {
    const st = document.getElementById('st-' + n);
    if (!st) return;
    st.textContent = text;
    if (color) st.style.background = color;
  }

  // EventSource ではなく fetch を使う理由:
  // EventSource は HTTP ステータス(429 など)やレスポンスボディを JS から読めない。
  // fetch なら response.status とエラーボディ(lambda-web-error-type を含む)を取得でき、
  // 「429 Too Many Requests」などをカードに明示できる。
  async function addConn() {
    const n = ++seq;
    const ctrl = new AbortController();
    sources.set(n, ctrl);

    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'card-' + n;
    card.innerHTML = \`
      <h2>接続 #\${n} <span class="badge" id="st-\${n}">connecting…</span></h2>
      <div class="kv"><span>instanceId</span><span id="inst-\${n}">—</span></div>
      <div class="kv"><span>activeConnections</span><span class="big" id="ac-\${n}">—</span></div>
      <div class="kv"><span>connectionId</span><span id="cid-\${n}">—</span></div>
      <div class="kv"><span>uptime(s)</span><span id="up-\${n}">—</span></div>
      <div class="kv"><span>note</span><span id="note-\${n}">—</span></div>
      <div style="margin-top:8px"><button class="secondary" onclick="closeConn(\${n})">閉じる</button></div>
    \`;
    document.getElementById('grid').appendChild(card);

    const apply = (d) => {
      document.getElementById('inst-' + n).textContent = d.instanceId;
      document.getElementById('ac-' + n).textContent = d.activeConnections;
      document.getElementById('cid-' + n).textContent = d.connectionId;
      if (d.uptimeSec != null) document.getElementById('up-' + n).textContent = d.uptimeSec;
      setStatus(n, 'live', '#166534');
    };

    try {
      const res = await fetch('/events', {
        headers: { Accept: 'text/event-stream' },
        signal: ctrl.signal,
      });

      // ★ エラー応答(429 など)はステータスコードを明示する。
      if (!res.ok) {
        const body = await res.text();
        const errType = res.headers.get('lambda-web-error-type');
        // note はサーバーが実際に返した情報だけを表示する(事前知識で埋めない)。
        if (res.status === 429) {
          setStatus(n, '429 Too Many Requests', '#7f1d1d');
          if (errType) document.getElementById('note-' + n).textContent = errType;
        } else {
          setStatus(n, res.status + ' ' + res.statusText, '#7f1d1d');
          const note = errType || body.slice(0, 80);
          if (note) document.getElementById('note-' + n).textContent = note;
        }
        sources.delete(n);
        return;
      }

      // 成功: text/event-stream を手動でパースする。
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buf.indexOf('\\n\\n')) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = 'message';
          let data = '';
          for (const line of raw.split('\\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          const d = JSON.parse(data);
          if (event === 'timeout') {
            setStatus(n, 'timed out', '#92400e');
            document.getElementById('note-' + n).textContent =
              d.reason || 'server-side timeout';
            if (d.uptimeSec != null) document.getElementById('up-' + n).textContent = d.uptimeSec;
          } else {
            apply(d);
          }
        }
      }
      setStatus(n, 'closed', '#374151');
      sources.delete(n);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setStatus(n, 'disconnected', '#7f1d1d');
      document.getElementById('note-' + n).textContent = String(err.message || err);
      sources.delete(n);
    }
  }

  function addMany(k) { for (let i = 0; i < k; i++) addConn(); }

  function closeConn(n) {
    const ctrl = sources.get(n);
    if (ctrl) ctrl.abort();
    sources.delete(n);
    const card = document.getElementById('card-' + n);
    if (card) card.remove();
  }

  function closeAll() {
    [...sources.keys()].forEach(closeConn);
  }
</script>
</body>
</html>`;
