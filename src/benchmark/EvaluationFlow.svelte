<figure aria-labelledby="flow-caption">
  <ol class="flow">
    <li>
      <div class="step"><span>01</span> SELECT</div>
      <h3>Sample your traffic</h3>
      <div class="visual sample" aria-hidden="true">
        <div class="log-row"><i></i><i></i><i></i></div>
        <div class="log-row"><i></i><i></i><i></i></div>
        <div class="log-row"><i></i><i></i><i></i></div>
        <div class="split"><span>Development</span><span>Evaluation</span></div>
      </div>
      <p>
        Read gateway logs or a local export. Sample by session and keep
        development and evaluation sessions separate.
      </p>
      <div class="location">ON YOUR DEVICE</div>
    </li>
    <li>
      <div class="step"><span>02</span> COMPARE</div>
      <h3>Replay across models</h3>
      <div class="visual replay" aria-hidden="true">
        <div class="gateway">Your gateway</div>
        <div class="branches">
          <span>Model A</span><span>Model B</span><span>Model C</span>
        </div>
        <small>Same recorded context</small>
      </div>
      <p>
        Send supported requests to your selected models through the gateway.
        Measure response time and cost.
      </p>
      <div class="location">THROUGH YOUR GATEWAY</div>
    </li>
    <li>
      <div class="step"><span>03</span> EVALUATE</div>
      <h3>Check each response</h3>
      <div class="visual checks" aria-hidden="true">
        <div><span>01</span> Response checks</div>
        <div><span>02</span> Inferred criteria</div>
        <div><span>03</span> Model judge</div>
      </div>
      <p>
        Infer checks from development requests. Score original and candidate
        responses on held-out requests. Missing evidence stays unknown.
      </p>
      <div class="location">LOCAL CHECKS + GATEWAY JUDGE</div>
    </li>
    <li>
      <div class="step"><span>04</span> REPORT</div>
      <h3>Open your results</h3>
      <div class="visual report" aria-hidden="true">
        <div class="report-title">benchmark.html <span>↗</span></div>
        <div class="report-row">
          <span>Quality</span><span>Speed</span><span>Cost</span>
        </div>
        <div class="report-rule"></div>
        <div class="report-rule"></div>
        <small>Models · workloads · coverage</small>
      </div>
      <p>
        Save an interactive HTML report. Compare models by workload and explore
        which traffic could use a cheaper model.
      </p>
      <div class="location">SAVED ON YOUR DEVICE</div>
    </li>
  </ol>
  <figcaption id="flow-caption">
    You choose the models and spending target before evaluation starts. The
    terminal shows progress, spend, and an ETA as requests complete.
  </figcaption>
</figure>

<style>
  @font-face {
    font-family: "Evaluate Geist";
    src: url("/fonts/geist-variable.woff2") format("woff2");
    font-weight: 100 900;
    font-display: swap;
  }
  @font-face {
    font-family: "Evaluate Geist Mono";
    src: url("/fonts/geist-mono-variable.woff2") format("woff2");
    font-weight: 100 900;
    font-display: swap;
  }
  figure {
    margin: 0;
    font-family: "Evaluate Geist", sans-serif;
  }
  .flow {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 24px;
  }
  li {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  li:not(:last-child)::after {
    content: "→";
    position: absolute;
    right: -19px;
    top: 137px;
    color: var(--hf-muted);
    font-size: 17px;
  }
  .step,
  .location {
    font:
      10px "Evaluate Geist Mono",
      monospace;
    letter-spacing: 0.6px;
    color: var(--hf-muted);
  }
  .step {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .step > span {
    padding: 4px 5px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
  }
  h3 {
    font-size: 17px;
    font-weight: 500;
    margin: 14px 0 18px;
    letter-spacing: -0.3px;
  }
  .visual {
    height: 150px;
    border: 1px solid var(--hf-line);
    border-radius: 12px;
    padding: 18px;
    background: var(--hf-dialog);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    font-size: 11px;
  }
  .log-row {
    display: flex;
    gap: 5px;
    padding: 7px;
    margin-bottom: 5px;
    border: 1px solid var(--hf-line);
    border-radius: 3px;
  }
  .log-row i {
    height: 2px;
    width: 25%;
    background: var(--hf-line);
  }
  .log-row i:first-child {
    background: var(--hf-accent);
    width: 45%;
  }
  .split {
    display: flex;
    justify-content: space-between;
    gap: 5px;
    font-size: 9px;
    margin-top: 8px;
  }
  .split span {
    border-top: 1px solid var(--hf-line);
    padding-top: 7px;
  }
  .gateway {
    text-align: center;
    border: 1px solid var(--hf-accent);
    border-radius: 4px;
    color: var(--hf-accent);
    padding: 7px 0;
    margin: 0 12px;
  }
  .branches {
    display: flex;
    gap: 5px;
    padding-top: 17px;
    position: relative;
  }
  .branches::before {
    content: "";
    position: absolute;
    top: 8px;
    left: 15%;
    right: 15%;
    height: 8px;
    border: 1px solid var(--hf-line);
    border-bottom: 0;
  }
  .branches::after {
    content: "";
    position: absolute;
    top: 0;
    left: 50%;
    height: 17px;
    border-left: 1px solid var(--hf-line);
  }
  .branches span {
    flex: 1;
    text-align: center;
    padding: 6px 0;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
    font-size: 9px;
  }
  small {
    font-size: 9px;
    color: var(--hf-muted);
    display: block;
    margin-top: 12px;
    text-align: center;
  }
  .checks {
    gap: 8px;
  }
  .checks > div {
    padding: 7px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
  }
  .checks span {
    color: var(--hf-muted);
    font:
      9px "Evaluate Geist Mono",
      monospace;
    margin-right: 6px;
  }
  .report-title {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid var(--hf-line);
    padding-bottom: 10px;
    font:
      10px "Evaluate Geist Mono",
      monospace;
  }
  .report-row {
    display: flex;
    justify-content: space-between;
    padding-top: 12px;
    font-size: 10px;
  }
  .report-rule {
    height: 1px;
    margin-top: 11px;
    background: var(--hf-line);
  }
  p {
    font-size: 13px;
    line-height: 1.7;
    color: var(--hf-muted);
    margin: 17px 0;
  }
  .location {
    margin-top: auto;
    padding-top: 13px;
    border-top: 1px solid var(--hf-line);
    font-size: 8px;
    line-height: 1.6;
    letter-spacing: 0.3px;
  }
  figcaption {
    margin-top: 26px;
    color: var(--hf-muted);
    font-size: 12px;
    line-height: 1.7;
  }
  @media (max-width: 1000px) {
    .flow {
      gap: 18px;
    }
    .visual {
      padding: 10px;
    }
    h3 {
      font-size: 15px;
      min-height: 36px;
    }
    li:not(:last-child)::after {
      right: -15px;
      top: 147px;
      font-size: 13px;
    }
  }
  @media (max-width: 700px) {
    .flow {
      grid-template-columns: 1fr;
      gap: 30px;
    }
    li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(140px, 1fr);
      column-gap: 18px;
    }
    .step,
    h3,
    p,
    .location {
      grid-column: 1;
    }
    h3 {
      min-height: 0;
      margin-bottom: 0;
      font-size: 17px;
    }
    .visual {
      grid-column: 2;
      grid-row: 1 / 5;
      align-self: center;
    }
    p {
      font-size: 12px;
    }
    li:not(:last-child)::after {
      content: "↓";
      top: auto;
      bottom: -24px;
      left: 8px;
      right: auto;
    }
    .location {
      font-size: 8px;
    }
  }
  @media (max-width: 380px) {
    li {
      display: flex;
    }
    .visual {
      width: 100%;
      margin-top: 14px;
    }
  }
</style>
