import ReportApp from "./ReportApp.svelte";
const data = document.getElementById("benchmark-data")!;
new ReportApp({
  target: document.getElementById("app")!,
  props: JSON.parse(data.textContent!),
});
data.remove();
