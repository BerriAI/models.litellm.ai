/**
 * Cost calculator: the same arithmetic in the build (for the static default result crawlers read) and in the
 * page script (for readers who change the numbers). Prices are per 1M tokens.
 */
export const CALC_DEFAULTS = { input: 1000, output: 500, requests: 10_000 };
export const DAYS_PER_MONTH = 30;

export type CalcResult = {
  perRequest: number;
  perDay: number;
  perMonth: number;
};

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
  if (n >= 100) return `$${Math.round(n).toLocaleString("en-US")}`;
  if (n >= 0.1) return `$${n.toFixed(2)}`;
  if (n === 0) return "$0";
  return `$${Number(n.toPrecision(4))}`;
}

/**
 * The page script. Model pages: prices come from the page's JSON-LD offers ("Input price", "Output price").
 * /calculator: from the model list embedded in the page, picked with a <select>, and the inputs are mirrored
 * to the URL so a result can be shared. Usage is reported to PostHog once per page when it's loaded.
 */
export const CALC_JS = `<script>(function(){
var fmt=function(n){return n>=100?"$"+Math.round(n).toLocaleString("en-US"):n>=0.1?"$"+n.toFixed(2):n===0?"$0":"$"+Number(n.toPrecision(4))};
document.querySelectorAll("[data-calc]").forEach(function(box){
  var get=function(n){return box.querySelector('[name="'+n+'"]')};
  var prices=null,list=null,used=false;
  var listEl=box.getAttribute("data-calc-list");
  if(listEl){try{list=JSON.parse(document.getElementById(listEl).textContent)}catch(e){}}
  else{document.querySelectorAll('script[type="application/ld+json"]').forEach(function(s){try{var g=JSON.parse(s.textContent)["@graph"]||[];g.forEach(function(n){(n.offers||[]).forEach(function(o){if(!prices)prices={};if(o.name==="Input price")prices.i=o.price;if(o.name==="Output price")prices.o=o.price})})}catch(e){}})}
  var q=new URLSearchParams(location.search);
  if(list){["model","in","out","req"].forEach(function(k){var el=get(k);if(el&&q.get(k)&&(k!=="model"||list[q.get(k)]))el.value=q.get(k)})}
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
