# Stopgap: build worker/embedded.gen.js + wrangler.embed.json, a Worker that serves
# public/ from the bundle instead of the assets binding. Used while deploys go
# through the Cloudflare API without wrangler auth (asset uploads need wrangler).
# Usage: python3 scripts/cf-embed-assets.py && npx wrangler deploy -c wrangler.embed.json
# Prefer plain `npx wrangler deploy` (wrangler.jsonc, real static assets) once logged in.
import os, json, mimetypes
repo=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); pub=repo+'/public'
ignore={'.assetsignore','nginx.conf.template'}
lines=["// GENERATED stopgap entry: serves public/ from the bundle (no assets binding).",
"import api from './index.js';"]
entries=[]
i=0
for root,_,fs in os.walk(pub):
  for f in sorted(fs):
    if f in ignore: continue
    full=os.path.join(root,f); rel='/'+os.path.relpath(full,pub)
    if f.startswith('.'): continue
    import base64
    lines.append(f"const a{i} = Uint8Array.from(atob({json.dumps(base64.b64encode(open(full,'rb').read()).decode())}), c => c.charCodeAt(0));")
    mt=mimetypes.guess_type(f)[0] or 'application/octet-stream'
    if mt.startswith('text/') or mt in ('application/javascript','application/json','image/svg+xml'): mt += '; charset=utf-8'
    entries.append(f"  [{json.dumps(rel)}, [a{i}, {json.dumps(mt)}]],"); i+=1
lines.append("const FILES = new Map([\n"+"\n".join(entries)+"\n]);")
lines.append(r"""
const API = /^\/(api|auth)(\/|$)|^\/health$/;
function serve(path, method) {
  let hit = FILES.get(path) || (path.endsWith('/') && FILES.get(path + 'index.html'));
  if (!hit && /\.[a-z0-9]+$/i.test(path)) return new Response('Not found', { status: 404 });
  if (!hit) hit = FILES.get('/index.html'); // SPA fallback (/c/<slug> etc.)
  const [data, type] = hit;
  return new Response(method === 'HEAD' ? null : data, {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=0, must-revalidate' },
  });
}
export default {
  fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);
    if (API.test(pathname) || !['GET', 'HEAD'].includes(req.method)) return api.fetch(req, env, ctx);
    return serve(pathname, req.method);
  },
};
""")
open(repo+'/worker/embedded.gen.js','w').write("\n".join(lines))
cfg={"name":"vhsbox","main":"worker/embedded.gen.js","compatibility_date":"2026-11-01","compatibility_flags":["nodejs_compat"],
 "rules":[{"type":"Text","globs":["**/*.sql"],"fallthrough":True}],
 "ai":{"binding":"AI"},
 "vars":{"NODE_ENV":"production","VISION_BACKEND":"workers-ai","VISION_DAILY_CAP":"200"}}
json.dump(cfg, open(repo+'/wrangler.embed.json','w'), indent=2)
print(i,'files')
