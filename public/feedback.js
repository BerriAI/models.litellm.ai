export function installFeedback(doc, send = fetch) {
  const dialog = doc.createElement("dialog");
  dialog.className = "feedback-dialog";
  dialog.setAttribute("aria-labelledby", "feedback-title");
  dialog.innerHTML = `
    <button class="feedback-close" type="button" aria-label="Close feedback">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>
    </button>
    <h2 id="feedback-title">Give feedback</h2>
    <form class="feedback-form">
      <label for="feedback-message">How can we make it better?</label>
      <textarea id="feedback-message" name="message" rows="5" maxlength="5000" required placeholder="Tell us what we could improve." data-ph-no-capture class="ph-no-capture"></textarea>
      <div class="feedback-contact">
        <label for="feedback-purpose">What brings you here? <span>Optional</span></label>
        <input id="feedback-purpose" name="purpose" type="text" maxlength="1000" placeholder="What are you hoping to get out of this site?" data-ph-no-capture class="ph-no-capture">
      </div>
      <div class="feedback-contact">
        <label for="feedback-contact">Contact info <span>Optional</span></label>
        <p id="feedback-contact-hint">Only if you’re open to chatting.</p>
        <input id="feedback-contact" name="contact" type="text" maxlength="500" aria-describedby="feedback-contact-hint" placeholder="Email, LinkedIn, X, or whatever works" data-ph-no-capture class="ph-no-capture">
      </div>
      <p class="feedback-status" role="status" aria-live="polite"></p>
      <div class="feedback-footer"><button class="feedback-send" type="submit">Send feedback <span aria-hidden="true">↗</span></button></div>
    </form>
    <div class="feedback-success" hidden>
      <p>Thanks for the feedback.</p>
      <button class="feedback-send feedback-done" type="button">Done</button>
    </div>`;
  doc.body.append(dialog);
  const form = dialog.querySelector("form");
  const message = dialog.querySelector("textarea");
  const purpose = dialog.querySelector('[name="purpose"]');
  const contact = dialog.querySelector('[name="contact"]');
  const submit = dialog.querySelector('[type="submit"]');
  const status = dialog.querySelector(".feedback-status");
  const success = dialog.querySelector(".feedback-success");
  let opener;
  let pending = false;

  function open(event) {
    const trigger = event.target.closest?.("[data-feedback-open]");
    if (!trigger || dialog.open) return;
    opener = trigger;
    if (!pending) {
      form.hidden = false;
      success.hidden = true;
      status.textContent = "";
    }
    dialog.showModal();
    message.focus();
  }
  function close() {
    dialog.close();
  }
  dialog.querySelector(".feedback-close").addEventListener("click", close);
  dialog.querySelector(".feedback-done").addEventListener("click", close);
  dialog.addEventListener("close", () => opener?.focus());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      close();
  });
  message.addEventListener("input", () => message.setCustomValidity(""));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return;
    const text = message.value.trim();
    if (!text) {
      message.setCustomValidity("Write a little feedback first.");
      message.reportValidity();
      return;
    }
    pending = true;
    submit.disabled = true;
    message.readOnly = true;
    purpose.readOnly = true;
    contact.readOnly = true;
    submit.textContent = "Sending…";
    status.textContent = "";
    try {
      const response = await send("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          purpose: purpose.value.trim(),
          contact: contact.value.trim(),
          page: doc.location.pathname,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error("Not accepted");
      message.value = "";
      purpose.value = "";
      contact.value = "";
      form.hidden = true;
      success.hidden = false;
      if (dialog.open) dialog.querySelector(".feedback-done").focus();
    } catch {
      status.textContent =
        "Couldn’t send your feedback. Your text is still here. Please try again.";
    } finally {
      pending = false;
      submit.disabled = false;
      message.readOnly = false;
      purpose.readOnly = false;
      contact.readOnly = false;
      submit.innerHTML = 'Send feedback <span aria-hidden="true">↗</span>';
    }
  });
  doc.addEventListener("click", open);
  return () => {
    doc.removeEventListener("click", open);
    dialog.remove();
  };
}

if (typeof document !== "undefined") installFeedback(document);
