// Download a gzipped JSON index and parse it. Used by the background worker and the download test page.
// Extensions with host permissions can fetch the GitHub release file even though the release host sends no CORS headers.
export async function loadGzJson(url, { onProgress, fetchImpl = fetch } = {}) {
  const t0 = Date.now();
  const resp = await fetchImpl(url, { redirect: "follow" });
  if (!resp.ok) throw new Error(`download failed: HTTP ${resp.status}`);
  const total = Number(resp.headers.get("content-length")) || 0;
  let received = 0;
  const counter = new TransformStream({
    transform(chunk, ctl) {
      received += chunk.byteLength;
      if (onProgress) onProgress(received, total);
      ctl.enqueue(chunk);
    },
  });
  const text = await new Response(
    resp.body.pipeThrough(counter).pipeThrough(new DecompressionStream("gzip")),
  ).text();
  const t1 = Date.now();
  const data = JSON.parse(text);
  const t2 = Date.now();
  return { data, stats: { downloadAndUnzipMs: t1 - t0, parseMs: t2 - t1, compressedBytes: received, jsonChars: text.length } };
}

// Exact lookup by already-normalized key (the real name normalizer comes in the next step).
export function lookup(index, key) {
  return index[key] || null;
}
