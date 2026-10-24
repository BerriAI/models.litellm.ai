<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { trackRequest, trackRequestFormOpened } from "./analytics";
  import { submitModelRequest, type RequestDelivery } from "./modelRequest";
  import { sanitizeSearchQuery } from "./searchQuery";

  let dialog: HTMLDialogElement;
  let nameInput: HTMLInputElement;
  let modelName = "";
  let isSubmitting = false;
  let delivery: RequestDelivery | null = null;
  let submitError = "";
  let requestSession = 0;

  onDestroy(() => {
    requestSession += 1;
  });

  export async function openModal(name?: string) {
    const session = ++requestSession;
    isSubmitting = false;
    modelName = sanitizeSearchQuery(
      name ?? new URLSearchParams(window.location.search).get("q") ?? "",
    );
    delivery = null;
    submitError = "";
    const url = new URL(window.location.href);
    url.searchParams.set("request", "true");
    window.history.replaceState(window.history.state, "", url);
    await tick();
    if (session !== requestSession) return;
    if (!dialog.open) dialog.showModal();
    nameInput?.focus();
    trackRequestFormOpened();
  }

  function closeModal() {
    requestSession += 1;
    isSubmitting = false;
    dialog.close();
    const url = new URL(window.location.href);
    url.searchParams.delete("request");
    window.history.replaceState(window.history.state, "", url);
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    const session = requestSession;
    const submittedName = modelName.trim();
    isSubmitting = true;
    submitError = "";
    try {
      const result = await submitModelRequest(submittedName);
      if (session !== requestSession) return;
      delivery = result;
      if (delivery === "confirmed") trackRequest("model", submittedName, "");
    } catch (error) {
      if (session !== requestSession) return;
      submitError =
        error instanceof Error
          ? error.message
          : "The request could not be sent.";
    } finally {
      if (session === requestSession) isSubmitting = false;
    }
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="request-title"
  on:cancel|preventDefault={closeModal}
>
  <div class="modal-header">
    <h2 id="request-title">Request a model</h2>
    <button
      type="button"
      class="close-button"
      aria-label="Close request form"
      on:click={closeModal}>×</button
    >
  </div>
  {#if delivery}
    <div class="delivery-message" role="status">
      <h3>{delivery === "confirmed" ? "Request received" : "Request sent"}</h3>
      <p>
        {delivery === "confirmed"
          ? `Thanks for requesting ${modelName.trim()}.`
          : "Delivery couldn’t be confirmed. Your request was sent, so there’s no need to submit it again."}
      </p>
      <button type="button" class="submit-button" on:click={closeModal}
        >Done</button
      >
    </div>
  {:else}
    <form on:submit|preventDefault={handleSubmit}>
      <label for="requested-model">Model name</label>
      <input
        id="requested-model"
        bind:this={nameInput}
        bind:value={modelName}
        placeholder="Model name or ID"
        required
        maxlength="300"
        disabled={isSubmitting}
        autocomplete="off"
      />
      {#if submitError}<p class="error-message" role="alert">
          {submitError}
        </p>{/if}
      <button
        class="submit-button"
        type="submit"
        disabled={isSubmitting || !modelName.trim()}
        >{isSubmitting ? "Sending…" : "Request model"}<span aria-hidden="true"
          >↗</span
        ></button
      >
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(440px, calc(100vw - 32px));
    margin: auto;
    padding: 0;
    border: 1px solid var(--border-color-strong);
    border-radius: 8px;
    background: var(--bg-color);
    color: var(--text-color);
    box-shadow: 0 24px 80px #0003;
  }
  dialog::backdrop {
    background: #050a1860;
    backdrop-filter: blur(3px);
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 22px 24px 0;
  }
  h2 {
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.03em;
  }
  .close-button {
    border: 0;
    background: transparent;
    color: var(--muted-color);
    font-size: 24px;
    line-height: 1;
    width: 30px;
    height: 30px;
    border-radius: 4px;
  }
  .close-button:hover {
    background: var(--bg-secondary);
    color: var(--text-color);
  }
  form,
  .delivery-message {
    padding: 24px;
  }
  label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 8px;
  }
  input {
    width: 100%;
    height: 44px;
    padding: 0 12px;
    border: 1px solid var(--border-color-strong);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    font-size: 14px;
  }
  input:focus {
    outline: 2px solid var(--litellm-primary);
    outline-offset: 2px;
  }
  input::placeholder {
    color: var(--muted-color);
  }
  .submit-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-top: 18px;
    height: 42px;
    padding: 0 14px;
    border: 0;
    border-radius: 4px;
    background: var(--litellm-primary);
    color: var(--litellm-on-primary);
    font-size: 13px;
    font-weight: 500;
  }
  .submit-button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .submit-button:focus-visible,
  .close-button:focus-visible {
    outline: 2px solid var(--litellm-primary);
    outline-offset: 3px;
  }
  .delivery-message h3 {
    font-size: 16px;
    font-weight: 500;
  }
  .delivery-message p {
    color: var(--muted-color);
    font-size: 13px;
    line-height: 1.6;
    margin-top: 8px;
  }
  .error-message {
    color: var(--error-color);
    margin-top: 12px;
    font-size: 12px;
  }
  @media (prefers-reduced-motion: reduce) {
    dialog::backdrop {
      backdrop-filter: none;
    }
  }
</style>
