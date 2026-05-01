<script lang="ts">
    import { onMount } from "svelte";
    import {
        loadClassifier,
        classify as runClassify,
    } from "$lib/classifier.js";
    import type { ClassifierModel, ClassifyResult } from "$lib/classifier.js";

    interface HistoryItem {
        id: number;
        preview: string;
        label: "spam" | "ham";
        confidence: number;
        spamProb: number;
        hamProb: number;
        correction: "spam" | "ham" | null;
    }

    let emailText = $state("");
    let loading = $state(false);
    let classifying = $state(false);
    let result = $state<ClassifyResult | null>(null);
    let error = $state<string | null>(null);
    let history = $state<HistoryItem[]>([]);
    let model = $state<ClassifierModel | null>(null);

    onMount(async () => {
        try {
            loading = true;
            model = await loadClassifier();
        } catch (e) {
            error = `Failed to load model: ${e instanceof Error ? e.message : String(e)}. Make sure vocab.json and model.onnx are in static/.`;
        } finally {
            loading = false;
        }
    });

    async function classify() {
        if (!emailText.trim() || !model) return;
        classifying = true;
        error = null;
        result = null;
        try {
            const r = await runClassify(model, emailText);
            result = r;
            history = [
                {
                    id: Date.now(),
                    preview: emailText.slice(0, 80).trim(),
                    label: r.label,
                    confidence: r.confidence,
                    spamProb: r.spamProb,
                    hamProb: r.hamProb,
                    correction: null,
                },
                ...history,
            ].slice(0, 20);
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            classifying = false;
        }
    }

    function correct(item: HistoryItem, correctedLabel: "spam" | "ham") {
        history = history.map((h) =>
            h.id === item.id ? { ...h, correction: correctedLabel } : h,
        );
        console.info("[feedback]", {
            text: item.preview,
            correct: correctedLabel,
        });
    }

    function clearAll() {
        emailText = "";
        result = null;
        error = null;
    }

    function pct(v: number) {
        return Math.round(v * 100);
    }

    const SAMPLES = [
        {
            label: "Spam",
            text: "WINNER!!! Congratulations! You have been selected for a $1,000,000 cash prize. Click here NOW to claim your FREE reward before it expires. Limited time offer!",
        },
        {
            label: "Ham",
            text: "Hi Sarah, can we move the Thursday standup to 4pm? I have a conflict at 3. Let me know if that works for everyone. Thanks.",
        },
        {
            label: "Phishing",
            text: "URGENT: Your account access will be suspended in 24 hours. Verify your personal details immediately at our secure portal to avoid interruption.",
        },
        {
            label: "Ham",
            text: "Please find attached the Q3 budget report. I've highlighted the key variances on page 4. Happy to walk through these in our next sync.",
        },
    ];
</script>

<div class="shell">
    <header>
        <div class="logo">
            <span class="icon-wrap">✉</span>
            <div>
                <h1>MailSift</h1>
                <p class="tagline">
                    spam / ham classifier — runs entirely in your browser via
                    ONNX
                </p>
            </div>
        </div>
        <div
            class="model-badge"
            class:ready={!!model && !loading}
            class:loading
            class:err={!!error && !model}
        >
            <span class="dot"></span>
            {#if loading}loading model…{:else if model}model ready{:else if error}load
                failed{:else}waiting…{/if}
        </div>
    </header>

    {#if loading}
        <div class="loading-bar"><div class="loading-inner"></div></div>
        <p class="loading-hint">// downloading model.onnx + vocab.json…</p>
    {/if}

    <main>
        <section class="input-card">
            <div class="card-hdr">
                <span>// email body</span>
                <button class="ghost-btn" onclick={clearAll}>clear</button>
            </div>
            <textarea
                bind:value={emailText}
                placeholder="paste or type an email here…"
                rows="10"
                spellcheck="false"
                disabled={!model}
            ></textarea>
            <div class="samples">
                <span class="samples-label">try:</span>
                {#each SAMPLES as s}
                    <button
                        class="sample-chip"
                        disabled={!model}
                        onclick={() => {
                            emailText = s.text;
                            result = null;
                            error = null;
                        }}>{s.label}</button
                    >
                {/each}
            </div>
            <button
                class="classify-btn"
                onclick={classify}
                disabled={classifying || !emailText.trim() || !model}
            >
                {#if classifying}<span class="spinner"></span> classifying…{:else}classify
                    →{/if}
            </button>
            {#if error}<div class="error-box">// error: {error}</div>{/if}
            <div class="note">
                inference runs in WebAssembly — no server, no data leaves your
                device.
            </div>
        </section>

        <section class="right-col">
            {#if result}
                <div
                    class="result-card"
                    class:spam={result.label === "spam"}
                    class:ham={result.label === "ham"}
                >
                    <div class="verdict">
                        <span class="verdict-icon"
                            >{result.label === "spam" ? "x" : "✔"}</span
                        >
                        <div>
                            <div class="verdict-label">
                                {result.label === "spam"
                                    ? "spam"
                                    : "ham (legitimate)"}
                            </div>
                            <div class="verdict-conf">
                                {pct(result.confidence)}% confident
                            </div>
                        </div>
                    </div>
                    <div class="bars">
                        <div class="bar-row">
                            <span class="bar-lbl">ham</span>
                            <div class="bar-track">
                                <div
                                    class="bar-fill green"
                                    style="width:{pct(result.hamProb)}%"
                                ></div>
                            </div>
                            <span class="bar-val">{pct(result.hamProb)}%</span>
                        </div>
                        <div class="bar-row">
                            <span class="bar-lbl">spam</span>
                            <div class="bar-track">
                                <div
                                    class="bar-fill red"
                                    style="width:{pct(result.spamProb)}%"
                                ></div>
                            </div>
                            <span class="bar-val">{pct(result.spamProb)}%</span>
                        </div>
                    </div>
                </div>
            {:else if !classifying && !loading}
                <div class="result-placeholder">
                    <span class="arrow">←</span> paste an email and click
                    <strong>classify →</strong>
                </div>
            {/if}

            {#if history.length > 0}
                <div class="history-card">
                    <div class="card-hdr">
                        <span>// history</span>
                        <button class="ghost-btn" onclick={() => (history = [])}
                            >clear</button
                        >
                    </div>
                    <ul class="history-list">
                        {#each history as item (item.id)}
                            <li class="history-item">
                                <div class="hi-top">
                                    <span
                                        class="hi-badge"
                                        class:spam={item.label === "spam"}
                                        class:ham={item.label === "ham"}
                                        >{item.label}</span
                                    >
                                    <span class="hi-conf"
                                        >{pct(item.confidence)}%</span
                                    >
                                    <span class="hi-preview"
                                        >{item.preview}{item.preview.length >=
                                        80
                                            ? "…"
                                            : ""}</span
                                    >
                                </div>
                                {#if item.correction}
                                    <div class="hi-corrected">
                                        marked as <strong
                                            >{item.correction}</strong
                                        > — thanks!
                                    </div>
                                {:else}
                                    <div class="hi-feedback">
                                        <span>wrong?</span>
                                        <button
                                            class="fb-btn ham"
                                            onclick={() => correct(item, "ham")}
                                            >ham</button
                                        >
                                        <button
                                            class="fb-btn spam"
                                            onclick={() =>
                                                correct(item, "spam")}
                                            >spam</button
                                        >
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                    <div class="prompt-line">_<span class="cursor"></span></div>
                </div>
            {/if}
        </section>
    </main>
</div>

<style>
    @import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&display=swap");

    :global(*, *::before, *::after) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    :global(body) {
        font-family: "JetBrains Mono", monospace;
        background: #0a0a0a;
        color: #d4d4d4;
        min-height: 100vh;
        font-size: 13px;
        line-height: 1.6;
    }

    .shell {
        max-width: 1100px;
        margin: 0 auto;
        padding: 2rem 1.5rem 4rem;
    }

    /* ── Header ── */
    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2rem;
        padding-bottom: 1.25rem;
        border-bottom: 1px solid #1e1e1e;
        flex-wrap: wrap;
        gap: 1rem;
    }

    .logo {
        display: flex;
        align-items: center;
        gap: 0.85rem;
    }

    .icon-wrap {
        font-size: 0.9rem;
        background: #111;
        border: 1px solid #222;
        border-radius: 4px;
        width: 42px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    h1 {
        font-family: "JetBrains Mono", monospace;
        font-size: 1.3rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: #ffffff;
        line-height: 1;
    }

    .tagline {
        font-size: 0.65rem;
        color: #555; /* was #2e2e2e — invisible */
        margin-top: 4px;
        font-weight: 300;
    }

    .model-badge {
        font-size: 0.65rem;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: 2px;
        background: #0d0d0d;
        border: 1px solid #141414;
        color: #555; /* was #333 — too dark */
        font-family: "JetBrains Mono", monospace;
    }

    .model-badge.ready {
        border-color: #1a2e1a;
        color: #22c55e;
    }

    .model-badge.loading {
        border-color: #2a2a1a;
        color: #a3e635;
    }

    .model-badge.err {
        border-color: #2e1a1a;
        color: #f87171;
    }

    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        flex-shrink: 0;
    }

    /* ── Loading bar ── */
    .loading-bar {
        height: 1px;
        background: #111;
        margin-bottom: 0.5rem;
        overflow: hidden;
    }

    .loading-inner {
        height: 100%;
        width: 40%;
        background: #22c55e;
        animation: slide 1.4s ease-in-out infinite;
    }

    @keyframes slide {
        0% {
            transform: translateX(-100%);
        }
        100% {
            transform: translateX(300%);
        }
    }

    .loading-hint {
        font-size: 0.65rem;
        color: #555; /* was #333 */
        margin-bottom: 1.5rem;
        text-align: center;
        font-style: italic;
    }

    /* ── Layout ── */
    main {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
        gap: 1.25rem;
    }

    @media (max-width: 680px) {
        .shell {
            padding: 1.25rem 1rem 3rem;
        }
        h1 {
            font-size: 1.1rem;
        }
    }

    @media (max-width: 420px) {
        .shell {
            padding: 1rem 0.75rem 2.5rem;
        }
        .tagline {
            display: none;
        }
    }

    /* ── Cards ── */
    .input-card,
    .history-card,
    .result-card,
    .result-placeholder {
        background: #0d0d0d;
        min-width: 0;
        border: 1px solid #1e1e1e;
        border-radius: 4px;
        overflow: hidden;
    }

    .card-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.6rem 0.9rem;
        border-bottom: 1px solid #1a1a1a;
        font-size: 0.63rem;
        font-weight: 500;
        color: #666; /* was #2e2e2e — invisible */
        letter-spacing: 0.08em;
    }

    .ghost-btn {
        background: none;
        border: none;
        font-size: 0.63rem;
        color: #555; /* was #2a2a2a — invisible */
        cursor: pointer;
        padding: 2px 6px;
        font-family: "JetBrains Mono", monospace;
        transition: color 0.15s;
    }

    .ghost-btn:hover {
        color: #aaa;
    }

    /* ── Textarea ── */
    textarea {
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        resize: none;
        max-width: 100%;
        min-width: 0;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.76rem;
        line-height: 1.75;
        color: #c0c0c0; /* was #aaaaaa — slightly improved */
        padding: 0.9rem;
    }

    textarea::placeholder {
        color: #3a3a3a;
    } /* was #222 — barely visible */

    textarea:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    /* ── Samples ── */
    .samples {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 5px;
        padding: 0.5rem 0.9rem;
        border-top: 1px solid #161616;
    }

    .samples-label {
        font-size: 0.6rem;
        color: #555; /* was #252525 — invisible */
        margin-right: 2px;
    }

    .sample-chip {
        font-size: 0.6rem;
        padding: 2px 8px;
        border-radius: 2px;
        background: #111;
        border: 1px solid #222;
        color: #666; /* was #383838 — too dark */
        cursor: pointer;
        font-family: "JetBrains Mono", monospace;
        transition:
            color 0.12s,
            border-color 0.12s;
    }

    .sample-chip:hover:not(:disabled) {
        border-color: #3a3a3a;
        color: #bbb;
    }

    .sample-chip:disabled {
        opacity: 0.25;
        cursor: not-allowed;
    }

    /* ── Classify button ── */
    .classify-btn {
        width: 100%;
        margin: 0;
        padding: 0.6rem 0.9rem;
        box-sizing: border-box;
        border-radius: 2px;
        background: #ffffff;
        color: #000000;
        border: none;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        letter-spacing: 0.04em;
        transition:
            background 0.15s,
            opacity 0.15s;
    }

    .classify-btn:hover:not(:disabled) {
        background: #e8e8e8;
    }

    .classify-btn:disabled {
        opacity: 0.2;
        cursor: not-allowed;
    }

    .spinner {
        width: 12px;
        height: 12px;
        border: 1.5px solid #0005;
        border-top-color: #000;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
        flex-shrink: 0;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* ── Error ── */
    .error-box {
        margin: 0 0.9rem 0.75rem;
        padding: 0.6rem 0.9rem;
        background: #140808;
        border: 1px solid #3a1010;
        border-radius: 2px;
        font-size: 0.72rem;
        color: #f87171;
        font-style: italic;
    }

    /* ── Note ── */
    .note {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0.55rem 0.9rem;
        border-top: 1px solid #161616;
        font-size: 0.6rem;
        color: #555; /* was #252525 — invisible */
    }

    /* ── Right col ── */
    .right-col {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    /* ── Result placeholder ── */
    .result-placeholder {
        padding: 2.5rem 1.25rem;
        text-align: center;
        color: #555; /* was #252525 */
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-style: italic;
        border-style: dashed; /* dashed makes the empty state feel intentional */
    }

    .result-placeholder strong {
        color: #888;
        font-style: normal;
    } /* was #333 */

    /* ── Result card ── */
    .result-card {
        padding: 1.1rem 1rem;
    }

    .result-card.spam {
        border-color: #2e1010;
    }
    .result-card.ham {
        border-color: #0f2e18;
    }

    .verdict {
        display: flex;
        align-items: center;
        gap: 0.9rem;
        margin-bottom: 1.25rem;
    }

    .verdict-icon {
        font-size: 0.9rem;
        background: #111;
        border: 1px solid #1e1e1e;
        padding: 0.45rem 0.55rem;
        border-radius: 2px;
    }

    .verdict-label {
        font-size: 1.05rem;
        font-weight: 600;
        color: #ffffff;
        letter-spacing: 0.02em;
    }

    .result-card.ham .verdict-label {
        color: #22c55e;
    }
    .result-card.spam .verdict-label {
        color: #ef4444;
    }

    .verdict-conf {
        font-size: 0.63rem;
        color: #666; /* was #303030 — invisible */
        margin-top: 3px;
    }

    /* ── Bars ── */
    .bars {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .bar-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .bar-lbl {
        width: 34px;
        font-size: 0.63rem;
        color: #666; /* was #383838 — too dark */
        text-align: right;
    }

    .bar-track {
        flex: 1;
        height: 3px;
        background: #1a1a1a;
        border-radius: 999px;
        overflow: hidden;
    }

    .bar-fill {
        height: 100%;
        border-radius: 999px;
        transition: width 0.4s cubic-bezier(0.22, 0.68, 0, 1.2);
    }

    .bar-fill.green {
        background: #22c55e;
    }
    .bar-fill.red {
        background: #ef4444;
    }

    .bar-val {
        width: 34px;
        font-size: 0.63rem;
        color: #888; /* was #383838 — too dark */
    }

    /* ── History ── */
    .history-list {
        list-style: none;
    }

    .history-item {
        padding: 0.65rem 0.9rem;
        border-bottom: 1px solid #141414;
    }

    .history-item:last-child {
        border-bottom: none;
    }

    .hi-top {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 5px;
    }

    .hi-badge {
        font-size: 0.57rem;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 1px;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        flex-shrink: 0;
        border: 1px solid;
    }

    .hi-badge.spam {
        border-color: #3a1515;
        color: #f87171;
        background: #0f0505;
    }

    .hi-badge.ham {
        border-color: #1a3a22;
        color: #22c55e;
        background: #050f08;
    }

    .hi-conf {
        font-size: 0.6rem;
        color: #555; /* was #2a2a2a — invisible */
        flex-shrink: 0;
    }

    .hi-preview {
        font-size: 0.66rem;
        color: #555; /* was #282828 — invisible */
        white-space: nowrap;
        max-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
        flex: 1;
    }

    .hi-feedback {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.6rem;
        color: #555; /* was #252525 */
    }

    .fb-btn {
        padding: 1px 9px;
        border-radius: 1px;
        border: 1px solid;
        font-size: 0.6rem;
        cursor: pointer;
        background: transparent;
        font-family: "JetBrains Mono", monospace;
        transition: background 0.12s;
    }

    .fb-btn.ham {
        border-color: #1a3a22;
        color: #22c55e;
    }
    .fb-btn.ham:hover {
        background: #050f08;
    }
    .fb-btn.spam {
        border-color: #3a1515;
        color: #f87171;
    }
    .fb-btn.spam:hover {
        background: #0f0505;
    }

    .hi-corrected {
        font-size: 0.63rem;
        color: #555; /* was #2e2e2e */
        font-style: italic;
    }

    .hi-corrected strong {
        color: #888;
    } /* was #555 — still visible now */

    /* ── Terminal prompt decoration ── */
    .prompt-line {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0.5rem 0.9rem;
        font-size: 0.63rem;
        color: #444; /* was #222 */
        border-top: 1px solid #141414;
    }

    .cursor {
        display: inline-block;
        width: 6px;
        height: 0.75em;
        background: #555;
        animation: blink 1s step-end infinite;
        vertical-align: middle;
    }

    @keyframes blink {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0;
        }
    }
</style>
