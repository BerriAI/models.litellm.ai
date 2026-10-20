/**
 * The custom comparison tool (/compare/custom?models=a,b,c): pick up to four models and see them side by side,
 * like a phone-comparison page. It reads /compare/models.json, which every build rewrites from the price file
 * and Epoch's data, so it never goes stale. The page is noindex: the reviewed /compare/<a>-vs-<b> pages are the
 * ones meant for search, and the tool links to one when the picked pair has it.
 */
import { comparable, cheapestRow, compareSlug } from "./compare";
import type { ModelBenchmarks } from "./benchmarks";
import type { ModelView } from "./model-view";

export type ToolModel = {
  n: string;
  lab: string | null;
  in: number;
  out: number;
  cr?: number;
  cw?: number;
  ctx: number;
  mo?: number;
  /** Image input, tool calling, structured output, prompt caching, reasoning: 1 yes, 0 no, absent unknown. */
  f: Record<string, 0 | 1>;
  p: number;
  /** Provider the headline price is from. */
  by: string;
  /** Cheapest provider and its input price. */
  cheap?: [string, number];
  add?: string;
  /** Benchmark name -> "54.6% (medium)". */
  b?: Record<string, string>;
};

const FEATURES: [string, string][] = [
  ["Image input", "vision"],
  ["Function calling", "tools"],
  ["Structured output", "json"],
  ["Prompt caching", "cache"],
  ["Reasoning", "reason"],
];

export function toolData(
  views: ModelView[],
  benchFor: (v: ModelView) => ModelBenchmarks | null,
  pairSlugs: Set<string>,
): { models: Record<string, ToolModel>; pairs: string[] } {
  const models: Record<string, ToolModel> = {};
  for (const v of views
    .filter(comparable)
    .sort(
      (a, b) =>
        b.providers.length - a.providers.length || a.name.localeCompare(b.name),
    )) {
    const p = v.headline!.prices;
    const f: Record<string, 0 | 1> = {};
    for (const [label, key] of FEATURES) {
      const c = v.capabilities.find((x) => x.label === label)?.supported;
      if (c !== undefined) f[key] = c ? 1 : 0;
    }
    const cheap = cheapestRow(v);
    const bench = benchFor(v);
    const b: Record<string, string> = {};
    if (bench?.eci) b["Epoch Capabilities Index"] = bench.eci.score.toFixed(1);
    for (const s of bench?.scores ?? [])
      b[s.benchmark] =
        `${(s.score * 100).toFixed(1)}%${s.setting ? ` (${s.setting})` : ""}`;
    models[v.slug] = {
      n: v.name,
      lab: v.lab,
      in: p.input!,
      out: p.output!,
      ...(p.cacheRead !== undefined ? { cr: p.cacheRead } : {}),
      ...(p.cacheWrite !== undefined ? { cw: p.cacheWrite } : {}),
      ctx: v.context!,
      ...(v.maxOutput ? { mo: v.maxOutput } : {}),
      f,
      p: v.providers.length,
      by: v.headline!.providerName,
      ...(cheap
        ? {
            cheap: [cheap.providerName, cheap.prices.input!] as [
              string,
              number,
            ],
          }
        : {}),
      ...(v.addedDate ? { add: v.addedDate } : {}),
      ...(Object.keys(b).length ? { b } : {}),
    };
  }
  return {
    models,
    pairs: [...pairSlugs].filter((s) =>
      s.split("-vs-").every((x) => models[x]),
    ),
  };
}

export const toolPairSlug = compareSlug;

export function toolBody(): string {
  return `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><a href="/compare">Compare</a><span>›</span><span>Build a comparison</span></nav>
<h1>Compare AI models side by side</h1>
<p class="answer">Pick up to four models to compare prices, context windows, features and benchmark scores. Data comes from LiteLLM's price file and Epoch AI, rebuilt whenever prices change. The link updates as you pick, so you can share it.</p></div>
<section id="tool" data-track="compare-tool" data-page-kind="compare-tool" data-page-id="custom"><div class="ct" id="ct"><p class="note">Loading models…</p></div>
<noscript><p>This tool needs JavaScript. See the <a href="/compare">comparison pages</a> instead.</p></noscript></section>`;
}

export const TOOL_CSS = `.ct{overflow-x:auto;border:1px solid var(--rule);border-radius:10px}
.ct table{min-width:640px}.ct th[scope=col]{vertical-align:top;text-transform:none;letter-spacing:0;font-size:15px;color:var(--fg);background:var(--bg2);min-width:180px}
.ct .pick{display:grid;gap:6px}.ct input{font:inherit;font-size:14px;width:100%;padding:6px 8px;border:1px solid var(--rule2);border-radius:6px;background:var(--bg);color:var(--fg)}
.ct .rm{font:inherit;font-size:12px;border:0;background:none;color:var(--muted);cursor:pointer;padding:0;justify-self:start}
.ct td.best{font-weight:650}.ct tbody th[scope=row],.ct thead th:first-child{position:sticky;left:0;z-index:1;background:var(--bg)}.ct tr.grp th{background:var(--bg3)}.ct .lnk{font-size:13px;padding:10px 12px}`;

/** Client side: reads /compare/models.json, renders columns, keeps ?models= in the URL. */
export const TOOL_JS = `<script>(function(){
var root=document.getElementById("ct");if(!root)return;
var MAX=4,data=null,pairs={};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
var usd=function(n){return n==null?"–":n>=0.1?"$"+n.toFixed(2):"$"+Number(n.toPrecision(3))};
var tok=function(n){return n==null?"–":n.toLocaleString("en-US")};
var yn=function(v){return v===1?"Yes":v===0?"No":"–"};
var picked=(new URLSearchParams(location.search).get("models")||"").split(",").filter(Boolean).slice(0,MAX);
function save(){var q=picked.length?"?models="+picked.join(","):"";history.replaceState(null,"",location.pathname+q)}
function rows(){
  var R=[["Price",null],
   ["Input, per 1M tokens",function(m){return usd(m.in)},function(m){return m.in},"low"],
   ["Output, per 1M tokens",function(m){return usd(m.out)},function(m){return m.out},"low"],
   ["Cache read, per 1M tokens",function(m){return usd(m.cr)},function(m){return m.cr},"low"],
   ["Cache write, per 1M tokens",function(m){return usd(m.cw)},function(m){return m.cw},"low"],
   ["Price shown is from",function(m){return esc(m.by)}],
   ["Cheapest provider",function(m){return m.cheap?esc(m.cheap[0])+" at "+usd(m.cheap[1])+" input":"–"}],
   ["Limits",null],
   ["Context window",function(m){return tok(m.ctx)+" tokens"},function(m){return m.ctx},"high"],
   ["Max output",function(m){return m.mo?tok(m.mo)+" tokens":"–"},function(m){return m.mo},"high"],
   ["Features",null],
   ["Image input",function(m){return yn(m.f.vision)}],["Tool calling",function(m){return yn(m.f.tools)}],["Structured output (JSON)",function(m){return yn(m.f.json)}],["Prompt caching",function(m){return yn(m.f.cache)}],["Reasoning",function(m){return yn(m.f.reason)}],
   ["Availability",null],
   ["Providers on LiteLLM",function(m){return m.p},function(m){return m.p},"high"],
   ["Added to LiteLLM",function(m){return m.add||"–"}]];
  var names={};picked.forEach(function(s){var b=(data[s]||{}).b||{};Object.keys(b).forEach(function(k){names[k]=1})});
  var bn=Object.keys(names);
  if(bn.length){R.push(["Benchmarks (Epoch AI)",null]);bn.forEach(function(k){R.push([k,function(m){return m.b&&m.b[k]?m.b[k]:"–"}])})}
  return R;
}
function render(){
  var ms=picked.map(function(s){return data[s]});
  var cols=picked.length<MAX?picked.length+1:picked.length;
  var head="<tr><th></th>";
  for(var i=0;i<cols;i++){
    var s=picked[i],m=data[s];
    head+='<th scope="col"><div class="pick">'+(m?'<a href="'+"/models/"+esc(s)+'">'+esc(m.n)+"</a>"+(m.lab?'<span class="note">'+esc(m.lab)+"</span>":"")+'<button class="rm" data-rm="'+i+'">Remove</button>':'<input list="ct-list" placeholder="Add a model" aria-label="Add a model to compare" data-add>')+"</div></th>";
  }
  head+="</tr>";
  var body="";
  rows().forEach(function(r){
    if(!r[1]){body+='<tr class="grp"><th scope="rowgroup" colspan="'+(cols+1)+'">'+esc(r[0])+"</th></tr>";return}
    var vals=ms.map(function(m){return r[2]?r[2](m):null}).filter(function(v){return v!=null});
    var best=r[3]&&vals.length>1?(r[3]==="low"?Math.min.apply(null,vals):Math.max.apply(null,vals)):null;
    body+='<tr><th scope="row">'+esc(r[0])+"</th>"+ms.map(function(m){var v=r[2]?r[2](m):null;return"<td"+(best!=null&&v===best&&vals.filter(function(x){return x===best}).length<vals.length?' class="best"':"")+">"+r[1](m)+"</td>"}).join("")+(cols>ms.length?"<td></td>":"")+"</tr>";
  });
  var links="";
  for(var a=0;a<picked.length;a++)for(var b=a+1;b<picked.length;b++){var k=[picked[a],picked[b]].sort().join("-vs-");if(pairs[k])links+='<a href="'+"/compare/"+k+'">'+esc(data[picked[a]].n)+" vs "+esc(data[picked[b]].n)+": full comparison</a> "}
  root.innerHTML="<table><thead>"+head+"</thead><tbody>"+body+"</tbody></table>"+(links?'<p class="lnk">'+links+"</p>":"")+'<p class="lnk note">Bold marks the lowest price, or the largest context window, max output and provider count. Prices are each model\\'s headline price per 1M tokens.</p>';
}
function choose(input){
  var v=input.value.trim().toLowerCase(),hit=null;
  Object.keys(data).some(function(s){if(data[s].n.toLowerCase()===v||s===v){hit=s;return true}});
  if(hit&&picked.indexOf(hit)<0&&picked.length<MAX){picked.push(hit);save();render();if(window.posthog&&posthog.capture)posthog.capture("compare_tool_added",{model:hit,count:picked.length})}
}
root.addEventListener("change",function(e){if(e.target.matches("[data-add]"))choose(e.target)});
root.addEventListener("keydown",function(e){if(e.key==="Enter"&&e.target.matches("[data-add]"))choose(e.target)});
root.addEventListener("click",function(e){var b=e.target.closest("[data-rm]");if(!b)return;picked.splice(+b.getAttribute("data-rm"),1);save();render()});
fetch("/compare/models.json").then(function(r){return r.json()}).then(function(d){
  data=d.models;(d.pairs||[]).forEach(function(k){pairs[k]=1});
  picked=picked.filter(function(s){return data[s]});
  var dl=document.createElement("datalist");dl.id="ct-list";dl.innerHTML=Object.keys(data).map(function(s){return'<option value="'+esc(data[s].n)+'">'}).join("");document.body.appendChild(dl);
  save();render();
}).catch(function(){root.innerHTML='<p class="note">Couldn\\'t load the model list. See the <a href="/compare">comparison pages</a>.</p>'});
})()</script>`;
