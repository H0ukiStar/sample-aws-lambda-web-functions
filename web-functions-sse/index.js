// AWS Lambda Web Functions 版の SSE サンプル。
//
// 目的: 「1つの実行環境が複数リクエストを同時に受け付けられる」ことを
//       SSE (Server-Sent Events) で可視化する。
//
// 仕組み:
//   - 各 SSE 接続はサーバー側で開かれたまま保持され、2秒ごとに
//     「この環境が今いくつの接続を同時に抱えているか」を push する。
//   - 1つの実行環境(= 1プロセス)が複数の SSE 接続を同時に保持できるため、
//     複数タブ/複数クライアントから接続すると、同じ instanceId のまま
//     activeConnections が増えていくのが観測できる。
//
// アダプターは不要。標準の Node.js HTTP サーバーをそのまま listen するだけ。
// ランタイムが AWS_LAMBDA_HTTP_ENDPOINT (host:port) を渡してくる。

import http from "node:http";
import crypto from "node:crypto";

// この実行環境(プロセス)を識別する ID。環境が増える/再利用されると変わる。
const INSTANCE_ID = crypto.randomUUID().slice(0, 8);
// プロセス起動時刻。環境が使い回されているかの目安。
const BOOTED_AT = new Date().toISOString();

// 現在この環境が保持している SSE 接続のレジストリ。
// 1環境が複数接続を同時に持てることをここで数える。
const connections = new Set();

function sseHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // ローカル検証でブラウザから直接叩けるように CORS を許可。
    "Access-Control-Allow-Origin": "*",
  });
}

function send(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  // ---- SSE エンドポイント ----
  if (url.pathname === "/events") {
    const connId = crypto.randomUUID().slice(0, 6);
    sseHeaders(res);

    const conn = { id: connId, res, startedAt: Date.now() };
    connections.add(conn);

    // 接続直後に、どの環境に乗ったかを通知。
    send(res, "hello", {
      connectionId: connId,
      instanceId: INSTANCE_ID,
      bootedAt: BOOTED_AT,
      activeConnections: connections.size,
    });

    // 2秒ごとに、この環境のライブ状態を全接続へ配信。
    const timer = setInterval(() => {
      send(res, "tick", {
        connectionId: connId,
        instanceId: INSTANCE_ID,
        bootedAt: BOOTED_AT,
        // ★ ここが肝: 同一環境が同時に抱えている接続数。
        activeConnections: connections.size,
        connectionIds: [...connections].map((c) => c.id),
        uptimeSec: Math.round((Date.now() - Date.parse(BOOTED_AT)) / 1000),
        now: new Date().toISOString(),
      });
    }, 2000);

    // クライアント切断時のクリーンアップ。
    req.on("close", () => {
      clearInterval(timer);
      connections.delete(conn);
    });
    return;
  }

  // ---- 現在の状態を JSON で返す(curl 用) ----
  if (url.pathname === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        instanceId: INSTANCE_ID,
        bootedAt: BOOTED_AT,
        activeConnections: connections.size,
        uptimeSec: Math.round((Date.now() - Date.parse(BOOTED_AT)) / 1000),
      }),
    );
    return;
  }

  // ---- ダッシュボード(ブラウザで開く) ----
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(DASHBOARD_HTML);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

// Web Functions の作法: ランタイムが渡す host:port を読んで listen するだけ。
const [host, port] = (
  process.env.AWS_LAMBDA_HTTP_ENDPOINT || "127.0.0.1:3000"
).split(":");

server.listen(Number(port), host, () => {
  console.log(`[web-functions-sse] listening on ${host}:${port}`);
  console.log(`[web-functions-sse] instanceId=${INSTANCE_ID}`);
});

const DASHBOARD_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Lambda Web Functions - SSE 同時接続デモ</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
  header { padding: 20px 24px; background: #1e293b; border-bottom: 1px solid #334155; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 4px 0; color: #94a3b8; font-size: 13px; }
  main { padding: 24px; }
  .controls { margin-bottom: 20px; display: flex; gap: 8px; flex-wrap: wrap; }
  button { background: #2563eb; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
  button.secondary { background: #475569; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 14px; }
  .card h2 { font-size: 13px; margin: 0 0 8px; color: #38bdf8; }
  .kv { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .kv span:first-child { color: #94a3b8; }
  .badge { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 999px; background: #334155; }
  .big { font-size: 22px; font-weight: 700; color: #22c55e; }
  .legend { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 14px; margin-bottom: 20px; font-size: 13px; }
  code { background: #0f172a; padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>
<header>
  <h1>Lambda Web Functions — SSE 同時接続デモ</h1>
  <p>「接続を追加」を押すたびに新しい SSE 接続を開きます。各接続は <code>/events</code> から 2秒ごとに更新を受け取ります。</p>
  <p>★ ポイント: 複数接続を開いても <b>instanceId が同じまま activeConnections が増える</b>なら、1つの実行環境が複数リクエストを同時にさばいています。</p>
</header>
<main>
  <div class="legend">
    <div>観測の見方:</div>
    <div>・<b>instanceId</b> … リクエストを処理した実行環境(プロセス)の ID。</div>
    <div>・<b>activeConnections</b> … その環境が「今」同時に抱えている SSE 接続数。</div>
    <div>複数カードで instanceId が揃い、activeConnections がカード枚数ぶんに増えれば成功です。</div>
    <div>・<b>status バッジ</b> … <code>live</code>/<code>timed out</code>/<code>closed</code> のほか、上限に達すると <code>429 Too Many Requests</code> を表示します(サーバーが <code>lambda-web-error-type</code> を返した場合のみ note に表示)。</div>
    <div>上限 = maxConcurrencyPerEnvironment × maxEnvironments。これを超える接続は 429 になります。</div>
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
        // lambda-web-error-type ヘッダーが取れたときだけ note に出し、
        // 取れなければ note は "—" のまま残す。
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

        // SSE はイベントを空行(\\n\\n)で区切る。
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
      // サーバーがストリームを正常終了した。
      setStatus(n, 'closed', '#374151');
      sources.delete(n);
    } catch (err) {
      // abort() による切断は正常なクローズ扱い。
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
