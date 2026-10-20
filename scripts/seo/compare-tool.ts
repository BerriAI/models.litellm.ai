/**
 * The custom comparison tool (/compare/custom?models=a,b,c): pick up to four models and see them side by side,
 * like a phone-comparison page. It reads /compare/models.json, which every build rewrites from the price file
 * and Epoch's data, so it never goes stale. The page is noindex: the reviewed /compare/<a>-vs-<b> pages are the
 * ones meant for search, and the tool links to one when the picked pair has it.
 */
import { comparable, cheapestRow, compareSlug } from "./compare";
import type { ModelBenchmarks } from "./benchmarks";
import type { ModelView } from "./model-view";
import { longDate } from "./format";

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
  /** Last day of an introductory headline price, written out. */
  iu?: string;
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
): { models: Record<string, ToolModel>; pairs: string[]; asOf: string | null } {
  const models: Record<string, ToolModel> = {};
  const benchDates: string[] = [];
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
    benchDates.push(
      ...[bench?.eci?.date, ...(bench?.scores ?? []).map((s) => s.date)].filter(
        (d): d is string => !!d,
      ),
    );
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
      ...(v.intro ? { iu: longDate(v.intro.until) } : {}),
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
  const latest = benchDates.sort().at(-1);
  return {
    models,
    pairs: [...pairSlugs].filter((s) =>
      s.split("-vs-").every((x) => models[x]),
    ),
    asOf: latest ? longDate(latest) : null,
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
.ct td.best{font-weight:650}
.cb-list{position:fixed;z-index:50;max-height:340px;overflow:auto;list-style:none;margin:0;padding:4px;background:var(--bg);color:var(--fg);border:1px solid var(--rule2);border-radius:10px;box-shadow:0 12px 32px rgba(8,11,38,.18)}
.cb-list li{display:grid;gap:1px;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:14px}
.cb-list li small{font-size:12px;color:var(--muted)}
.cb-list li[aria-selected=true],.cb-list li:hover{background:var(--bg3)}
.cb-list .cb-none{cursor:default;color:var(--muted)}.ct tbody th[scope=row],.ct thead th:first-child{position:sticky;left:0;z-index:1;background:var(--bg)}.ct tr.grp th{background:var(--bg3)}.ct .lnk{font-size:13px;padding:10px 12px}`;

/** Client side: reads /compare/models.json, renders columns, keeps ?models= in the URL. */
export const TOOL_JS = `<script>(function(){
var root=document.getElementById("ct");if(!root)return;
var MAX=4,data=null,pairs={},asOf=null;
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
   ["Price shown is from",function(m){return esc(m.by)+(m.iu?", introductory until "+esc(m.iu):"")}],
   ["Cheapest provider",function(m){return m.cheap?esc(m.cheap[0])+" at "+usd(m.cheap[1])+" input":"–"}],
   ["Limits",null],
   ["Context window",function(m){return tok(m.ctx)+" tokens"},function(m){return m.ctx},"high"],
   ["Max output",function(m){return m.mo?tok(m.mo)+" tokens":"–"},function(m){return m.mo},"high"],
   ["Features",null],
   ["Image input",function(m){return yn(m.f.vision)}],["Tool calling",function(m){return yn(m.f.tools)}],["Structured output (JSON)",function(m){return yn(m.f.json)}],["Prompt caching",function(m){return yn(m.f.cache)}],["Reasoning",function(m){return yn(m.f.reason)}],
   ["Availability",null],
   ["Providers on LiteLLM",function(m){return m.p},function(m){return m.p},"high"],
   ["Added to LiteLLM",function(m){return m.add?esc(m.add):"–"}]];
  var names={};picked.forEach(function(s){var b=(data[s]||{}).b||{};Object.keys(b).forEach(function(k){names[k]=1})});
  var bn=Object.keys(names);
  if(bn.length){R.push(["Benchmarks (Epoch AI)",null]);bn.forEach(function(k){R.push([k,function(m){return m.b&&m.b[k]?esc(m.b[k]):"–"}])})}
  return R;
}
function render(){
  var ms=picked.map(function(s){return data[s]});
  var cols=picked.length<MAX?picked.length+1:picked.length;
  var head="<tr><th></th>";
  for(var i=0;i<cols;i++){
    var s=picked[i],m=data[s];
    head+='<th scope="col"><div class="pick">'+(m?'<a href="'+"/models/"+esc(s)+'">'+esc(m.n)+"</a>"+(m.lab?'<span class="note">'+esc(m.lab)+"</span>":"")+'<button class="rm" data-rm="'+i+'">Remove</button>':'<input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ct-list" autocomplete="off" placeholder="Add a model" aria-label="Add a model to compare" data-add>')+"</div></th>";
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
  root.innerHTML="<table><thead>"+head+"</thead><tbody>"+body+"</tbody></table>"+(links?'<p class="lnk">'+links+"</p>":"")+'<p class="lnk note">Bold marks the lowest price, or the largest context window, max output and provider count. Prices are each model\\'s headline price per 1M tokens.</p>'+(ms.some(function(m){return m.b})?'<p class="lnk note">Benchmark scores are from the <a href="https://epoch.ai/benchmarks">Epoch AI Benchmarking Hub</a>, licensed <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>'+(asOf?", data as of "+esc(asOf):"")+".</p>":"");
}
// Searchable dropdown (combobox). The list lives on <body> with fixed position, so the table's scroll box can't clip it.
var list=document.createElement("ul");list.id="ct-list";list.className="cb-list";list.setAttribute("role","listbox");list.hidden=true;document.body.appendChild(list);
var input=null,options=[],active=-1;
function meta(m){return[m.lab,usd(m.in)+" / "+usd(m.out)+" per 1M",(m.ctx>=1e6?(m.ctx/1e6).toFixed(m.ctx%1e6?2:0).replace(/\.?0+$/,"")+"M":Math.round(m.ctx/1e3)+"K")+" context"].filter(Boolean).join(" · ")}
function place(){if(!input)return;var r=input.getBoundingClientRect();list.style.left=Math.max(8,Math.min(r.left,innerWidth-Math.max(r.width,300)-8))+"px";list.style.top=(r.bottom+4)+"px";list.style.width=Math.max(r.width,300)+"px"}
function open(){if(!input)return;var q=input.value.trim().toLowerCase();
  options=Object.keys(data).filter(function(s){return picked.indexOf(s)<0&&(!q||(data[s].n+" "+(data[s].lab||"")+" "+s).toLowerCase().indexOf(q)>=0)}).slice(0,40);
  active=options.length?0:-1;
  list.innerHTML=options.length?options.map(function(s,i){return'<li role="option" id="ct-opt-'+i+'" data-i="'+i+'" aria-selected="'+(i===active)+'"><span>'+esc(data[s].n)+"</span><small>"+esc(meta(data[s]))+"</small></li>"}).join(""):'<li class="cb-none">No matching model</li>';
  list.hidden=false;input.setAttribute("aria-expanded","true");input.setAttribute("aria-activedescendant",active>=0?"ct-opt-"+active:"");place()}
function close(){list.hidden=true;if(input)input.setAttribute("aria-expanded","false")}
function move(d){if(!options.length)return;active=(active+d+options.length)%options.length;[].forEach.call(list.children,function(li,i){li.setAttribute("aria-selected",i===active)});var el=list.children[active];if(el)el.scrollIntoView({block:"nearest"});input.setAttribute("aria-activedescendant","ct-opt-"+active)}
function pick(s){if(!s||picked.indexOf(s)>=0||picked.length>=MAX)return;close();picked.push(s);save();render();if(window.posthog&&posthog.capture)posthog.capture("compare_tool_added",{model:s,count:picked.length});var next=root.querySelector("[data-add]");if(next)next.focus()}
root.addEventListener("focusin",function(e){if(e.target.matches("[data-add]")){input=e.target;open()}});
root.addEventListener("input",function(e){if(e.target.matches("[data-add]")){input=e.target;open()}});
root.addEventListener("keydown",function(e){if(!e.target.matches("[data-add]"))return;
  if(e.key==="ArrowDown"){e.preventDefault();if(list.hidden)open();else move(1)}
  else if(e.key==="ArrowUp"){e.preventDefault();move(-1)}
  else if(e.key==="Enter"){e.preventDefault();if(active>=0)pick(options[active])}
  else if(e.key==="Escape"){close()}});
root.addEventListener("focusout",function(e){if(e.target.matches("[data-add]"))setTimeout(close,120)});
list.addEventListener("mousedown",function(e){e.preventDefault();var li=e.target.closest("[data-i]");if(li)pick(options[+li.getAttribute("data-i")])});
addEventListener("resize",place);addEventListener("scroll",place,true);
root.addEventListener("click",function(e){var b=e.target.closest("[data-rm]");if(!b)return;picked.splice(+b.getAttribute("data-rm"),1);save();render()});
fetch("/compare/models.json").then(function(r){return r.json()}).then(function(d){
  data=d.models;asOf=d.asOf||null;(d.pairs||[]).forEach(function(k){pairs[k]=1});
  picked=picked.filter(function(s){return data[s]});
  save();render();
}).catch(function(){root.innerHTML='<p class="note">Couldn\\'t load the model list. See the <a href="/compare">comparison pages</a>.</p>'});
})()</script>`;
