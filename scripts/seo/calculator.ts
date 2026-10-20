/**
 * Cost calculator: the same arithmetic in the build (for the static default result crawlers read) and in the
 * page script (for readers who change the numbers). Prices are per 1M tokens.
 */
import type { ModelView } from "./model-view";
import { leadsWithTokens } from "./pricing";

export const CALC_DEFAULTS = { input: 1000, output: 500, requests: 10_000 };
export const DAYS_PER_MONTH = 30;

export type CalcResult = {
  perRequest: number;
  perDay: number;
  perMonth: number;
};

/** Whether /calculator lists the model: still sold, and paid per input and output token at its headline price. */
export function onCalculator(v: ModelView): boolean {
  const h = v.headline;
  return (
    v.status !== "retired" &&
    !!h &&
    leadsWithTokens(h.mode, h.prices, h.metric) &&
    (h.prices.input ?? 0) > 0 &&
    (h.prices.output ?? 0) > 0
  );
}

export function calcCost(
  inputPer1M: number,
  outputPer1M: number,
  input: number,
  output: number,
  requests: number,
): CalcResult {
  const perRequest = (input * inputPer1M + output * outputPer1M) / 1e6;
  return {
    perRequest,
    perDay: perRequest * requests,
    perMonth: perRequest * requests * DAYS_PER_MONTH,
  };
}

/** Same rule as CALC_JS's `fmt`: whole dollars from $100, cents from $0.10, otherwise four significant digits. */
export function calcMoney(n: number): string {
  const c = Number(n.toPrecision(12));
  if (c >= 100) return `$${Math.round(c).toLocaleString("en-US")}`;
  if (c >= 0.1) return `$${c.toFixed(2)}`;
  if (c === 0) return "$0";
  return `$${Number(c.toPrecision(4))}`;
}

const PICKER_JS = `  var pickEl=box.querySelector(".calc-pick");
  if(list&&pickEl){
    var ul=document.createElement("ul");ul.id="calc-list";ul.className="cb-list";ul.setAttribute("role","listbox");ul.setAttribute("aria-label","Models");ul.hidden=true;document.body.appendChild(ul);
    var opts=[],act=-1,keys=Object.keys(list),blurTimer;
    var current=function(){return list[get("model").value][0]};
    var intro=box.querySelector("[data-r=intro]");
    var note=function(){var m=list[get("model").value];if(!intro)return;intro.hidden=!m[3];intro.textContent=m[3]?"Introductory price until "+m[3]:""};
    var coarse=typeof matchMedia!=="undefined"&&matchMedia("(pointer:coarse)").matches;
    pickEl.value=current();note();
    var seen=function(){var v=typeof visualViewport!=="undefined"&&visualViewport;return v?v.offsetTop+v.height:innerHeight};
    var place=function(){var r=pickEl.getBoundingClientRect(),w=Math.max(r.width,300);ul.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+"px";ul.style.top=(r.bottom+4)+"px";ul.style.width=w+"px";ul.style.maxHeight=Math.max(96,Math.min(340,seen()-r.bottom-12))+"px"};
    var fit=function(){if(!coarse)return;var r=pickEl.getBoundingClientRect(),hd=document.querySelector(".top"),t=(hd?hd.getBoundingClientRect().bottom:0)+12;if(seen()-r.bottom<220&&r.top>t)scrollBy(0,r.top-t)};
    var h=function(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")};
    var rank=function(s,q){var n=list[s][0].toLowerCase();return n===q||s===q?0:n.indexOf(q)===0||s.indexOf(q)===0?1:2};
    var show=function(q){q=(q||"").toLowerCase();opts=keys.filter(function(s){return !q||(list[s][0]+" "+s).toLowerCase().indexOf(q)>=0});if(q)opts.sort(function(a,b){return rank(a,q)-rank(b,q)});act=opts.length&&q?0:-1;
      ul.innerHTML=opts.length?opts.map(function(s,i){return'<li role="option" id="calc-opt-'+i+'" data-i="'+i+'" aria-selected="'+(i===act)+'"><span>'+h(list[s][0])+"</span><small>"+fmt(list[s][1])+" / "+fmt(list[s][2])+" per 1M tokens"+(list[s][3]?", introductory price until "+h(list[s][3]):"")+"</small></li>"}).join(""):'<li class="cb-none" role="option" aria-disabled="true">No matching model</li>';
      ul.hidden=false;pickEl.setAttribute("aria-expanded","true");if(act>=0)pickEl.setAttribute("aria-activedescendant","calc-opt-"+act);else pickEl.removeAttribute("aria-activedescendant");place()};
    var hide=function(){ul.hidden=true;pickEl.setAttribute("aria-expanded","false");pickEl.removeAttribute("aria-activedescendant")};
    var choose=function(s){if(!s)return;get("model").value=s;pickEl.value=pickEl.placeholder=list[s][0];note();hide();box.dispatchEvent(new Event("input",{bubbles:true}))};
    var mv=function(d){if(!opts.length)return;act=act<0?(d>0?0:opts.length-1):(act+d+opts.length)%opts.length;[].forEach.call(ul.children,function(li,i){li.setAttribute("aria-selected",i===act)});var el=ul.children[act];if(el)el.scrollIntoView({block:"nearest"});pickEl.setAttribute("aria-activedescendant","calc-opt-"+act)};
    var open=function(){clearTimeout(blurTimer);fit();pickEl.placeholder=current();pickEl.value="";show("")};
    var reopen=function(){if(pickEl.value===current())open();else show(pickEl.value)};
    pickEl.addEventListener("focus",open);
    pickEl.addEventListener("click",function(){if(ul.hidden)open()});
    document.addEventListener("touchstart",function(e){if(!ul.hidden&&e.target!==pickEl&&!ul.contains(e.target))pickEl.blur()},{passive:true});
    pickEl.addEventListener("input",function(e){e.stopPropagation();show(pickEl.value)});
    pickEl.addEventListener("keydown",function(e){if(e.key==="ArrowDown"){e.preventDefault();if(ul.hidden)reopen();else mv(1)}else if(e.key==="ArrowUp"){e.preventDefault();if(ul.hidden)reopen();else mv(-1)}else if(e.key==="Tab"){if(!ul.hidden&&act>=0)choose(opts[act])}else if(e.key==="Enter"){e.preventDefault();if(!ul.hidden&&act>=0){choose(opts[act]);pickEl.select()}}else if(e.key==="Escape"){hide();pickEl.value=current();pickEl.select()}});
    pickEl.addEventListener("blur",function(){blurTimer=setTimeout(function(){hide();pickEl.value=current()},120)});
    ul.addEventListener("mousedown",function(e){e.preventDefault();var li=e.target.closest("[data-i]");if(li){choose(opts[+li.getAttribute("data-i")]);pickEl.blur()}});
    var follow=function(){if(!ul.hidden)place()};addEventListener("resize",follow);addEventListener("scroll",follow,true);if(typeof visualViewport!=="undefined")visualViewport.addEventListener("resize",function(){if(!ul.hidden){fit();place()}});
  }`;

const calcScript = (picker: string): string => `<script>(function(){
var fmt=function(n){var c=Number(n.toPrecision(12));return c>=100?"$"+Math.round(c).toLocaleString("en-US"):c>=0.1?"$"+c.toFixed(2):c===0?"$0":"$"+Number(c.toPrecision(4))};
document.querySelectorAll("[data-calc]").forEach(function(box){
  var get=function(n){return box.querySelector('[name="'+n+'"]')};
  var prices=null,list=null,used=false;
  var listEl=box.getAttribute("data-calc-list");
  if(listEl){try{list=JSON.parse(document.getElementById(listEl).textContent)}catch(e){}}
  else{document.querySelectorAll('script[type="application/ld+json"]').forEach(function(s){try{var g=JSON.parse(s.textContent)["@graph"]||[];g.forEach(function(n){(n.offers||[]).forEach(function(o){if(!prices)prices={};if(o.name==="Input price")prices.i=o.price;if(o.name==="Output price")prices.o=o.price})})}catch(e){}})}
  var q=new URLSearchParams(location.search);
  if(list){["model","in","out","req"].forEach(function(k){var el=get(k);if(el&&q.get(k)&&(k!=="model"||Object.prototype.hasOwnProperty.call(list,q.get(k))))el.value=q.get(k)})}
${picker}
  function run(){
    var p=list?(function(m){return m&&{i:m[1],o:m[2]}})(list[get("model").value]):prices;
    if(!p||p.i==null||p.o==null)return;
    var i=+get("in").value||0,o=+get("out").value||0,r=+get("req").value||0,each=(i*p.i+o*p.o)/1e6;
    box.querySelector('[data-r="req"]').textContent=fmt(each);
    box.querySelector('[data-r="day"]').textContent=fmt(each*r);
    box.querySelector('[data-r="month"]').textContent=fmt(each*r*${DAYS_PER_MONTH});
    if(list){var u=new URLSearchParams({model:get("model").value,in:i,out:o,req:r});history.replaceState(null,"","?"+u)}
  }
  box.addEventListener("input",function(){run();if(!used&&window.posthog&&posthog.capture){used=true;posthog.capture("calculator_used",{page_kind:box.getAttribute("data-page-kind"),page_id:box.getAttribute("data-page-id")})}});
  run();
});
})()</script>`;

/**
 * The page scripts. Model pages (CALC_JS): prices come from the page's JSON-LD offers ("Input price", "Output price").
 * /calculator (CALCULATOR_PAGE_JS): from the model list embedded in the page, picked with a searchable dropdown, and the
 * inputs are mirrored to the URL so a result can be shared. Usage is reported to PostHog once per page when it's loaded.
 */
export const CALC_JS = calcScript("");
export const CALCULATOR_PAGE_JS = calcScript(PICKER_JS);
