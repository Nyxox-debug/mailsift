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
                    Spam / Ham classifier — runs entirely in your browser via
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
            {#if loading}Loading model…{:else if model}Model ready{:else if error}Load
                failed{:else}Waiting…{/if}
        </div>
    </header>

    {#if loading}
        <div class="loading-bar"><div class="loading-inner"></div></div>
        <p class="loading-hint">Downloading model.onnx + vocab.json…</p>
    {/if}

    <main>
        <section class="input-card">
            <div class="card-hdr">
                <span>Email body</span>
                <button class="ghost-btn" onclick={clearAll}>Clear</button>
            </div>
            <textarea
                bind:value={emailText}
                placeholder="Paste or type an email here…"
                rows="10"
                spellcheck="false"
                disabled={!model}
            ></textarea>
            <div class="samples">
                <span class="samples-label">Try a sample:</span>
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
                {#if classifying}<span class="spinner"></span> Classifying…{:else}Classify
                    →{/if}
            </button>
            {#if error}<div class="error-box">{error}</div>{/if}
            <div class="note">
                <span class="note-icon">⚡</span>
                Inference runs in WebAssembly — no server, no data leaves your device.
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
                            >{result.label === "spam" ? "🚫" : "✅"}</span
                        >
                        <div>
                            <div class="verdict-label">
                                {result.label === "spam"
                                    ? "Spam"
                                    : "Ham (legitimate)"}
                            </div>
                            <div class="verdict-conf">
                                {pct(result.confidence)}% confident
                            </div>
                        </div>
                    </div>
                    <div class="bars">
                        <div class="bar-row">
                            <span class="bar-lbl">Ham</span>
                            <div class="bar-track">
                                <div
                                    class="bar-fill green"
                                    style="width:{pct(result.hamProb)}%"
                                ></div>
                            </div>
                            <span class="bar-val">{pct(result.hamProb)}%</span>
                        </div>
                        <div class="bar-row">
                            <span class="bar-lbl">Spam</span>
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
                    <span>←</span> Paste an email and click
                    <strong>Classify →</strong>
                </div>
            {/if}

            {#if history.length > 0}
                <div class="history-card">
                    <div class="card-hdr">
                        <span>History</span>
                        <button class="ghost-btn" onclick={() => (history = [])}
                            >Clear</button
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
                                        Marked as <strong
                                            >{item.correction}</strong
                                        > — thanks!
                                    </div>
                                {:else}
                                    <div class="hi-feedback">
                                        <span>Wrong?</span>
                                        <button
                                            class="fb-btn ham"
                                            onclick={() => correct(item, "ham")}
                                            >Ham</button
                                        >
                                        <button
                                            class="fb-btn spam"
                                            onclick={() =>
                                                correct(item, "spam")}
                                            >Spam</button
                                        >
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
        </section>
    </main>
</div>



<style>
    @import url("https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap");
    :global(*, *::before, *::after) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }
    :global(body) {
        font-family: "DM Sans", sans-serif;
        background: #0d0f11;
        color: #e8e6e1;
        min-height: 100vh;
    }
    .shell {
        max-width: 1100px;
        margin: 0 auto;
        padding: 2rem 1.5rem 4rem;
    }
    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2rem;
        flex-wrap: wrap;
        gap: 1rem;
    }
    .logo {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .icon-wrap {
        font-size: 2rem;
        background: #1a1d21;
        border: 1px solid #2e3238;
        border-radius: 12px;
        width: 52px;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    h1 {
        font-family: "Instrument Serif", serif;
        font-size: 1.9rem;
        font-weight: 400;
        letter-spacing: -0.02em;
        color: #f0ede8;
        line-height: 1;
    }
    .tagline {
        font-size: 0.78rem;
        color: #555;
        margin-top: 3px;
    }
    .model-badge {
        font-size: 0.78rem;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 999px;
        background: #1a1d21;
        border: 1px solid #2e3238;
        color: #666;
    }
    .model-badge.ready {
        border-color: #1f3a2a;
        color: #4ade80;
    }
    .model-badge.loading {
        border-color: #2e3a1f;
        color: #a3e635;
    }
    .model-badge.err {
        border-color: #3a1f1f;
        color: #f87171;
    }
    .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        flex-shrink: 0;
    }
    .loading-bar {
        height: 2px;
        background: #1e2228;
        border-radius: 999px;
        overflow: hidden;
        margin-bottom: 0.5rem;
    }
    .loading-inner {
        height: 100%;
        width: 40%;
        background: #4ade80;
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
        font-size: 0.78rem;
        color: #555;
        margin-bottom: 1.5rem;
        text-align: center;
    }
    main {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
    }
    @media (max-width: 700px) {
        main {
            grid-template-columns: 1fr;
        }
    }
    .input-card,
    .history-card,
    .result-card,
    .result-placeholder {
        background: #13161a;
        border: 1px solid #22262c;
        border-radius: 14px;
        overflow: hidden;
    }
    .card-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.9rem 1.1rem;
        border-bottom: 1px solid #22262c;
        font-size: 0.82rem;
        font-weight: 500;
        color: #999;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }
    .ghost-btn {
        background: none;
        border: none;
        font-size: 0.78rem;
        color: #555;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        transition: color 0.15s;
    }
    .ghost-btn:hover {
        color: #ccc;
    }
    textarea {
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        resize: none;
        font-family: "DM Sans", sans-serif;
        font-size: 0.9rem;
        line-height: 1.65;
        color: #c8c5c0;
        padding: 1.1rem;
    }
    textarea:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .samples {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        padding: 0.6rem 1.1rem;
        border-top: 1px solid #1e2228;
    }
    .samples-label {
        font-size: 0.73rem;
        color: #555;
        margin-right: 2px;
    }
    .sample-chip {
        font-size: 0.73rem;
        padding: 3px 9px;
        border-radius: 999px;
        background: #1e2228;
        border: 1px solid #2e3440;
        color: #aaa;
        cursor: pointer;
        transition:
            background 0.12s,
            color 0.12s;
    }
    .sample-chip:hover:not(:disabled) {
        background: #252a32;
        color: #e0ddd8;
    }
    .sample-chip:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }
    .classify-btn {
        width: calc(100% - 2.2rem);
        margin: 0.8rem 1.1rem;
        padding: 0.75rem;
        border-radius: 9px;
        background: #e8e4de;
        color: #111;
        border: none;
        font-family: "DM Sans", sans-serif;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition:
            background 0.15s,
            opacity 0.15s;
    }
    .classify-btn:hover:not(:disabled) {
        background: #fff;
    }
    .classify-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }
    .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid #0005;
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
    .error-box {
        margin: 0 1.1rem 1rem;
        padding: 0.7rem 1rem;
        background: #2a1515;
        border: 1px solid #5c2020;
        border-radius: 8px;
        font-size: 0.82rem;
        color: #f87171;
    }
    .note {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0.65rem 1.1rem;
        border-top: 1px solid #1e2228;
        font-size: 0.73rem;
        color: #444;
    }
    .note-icon {
        font-size: 0.9rem;
    }
    .right-col {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    .result-placeholder {
        padding: 3rem 1.5rem;
        text-align: center;
        color: #444;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }
    .result-placeholder strong {
        color: #666;
    }
    .result-card {
        padding: 1.4rem 1.3rem;
    }
    .result-card.spam {
        border-color: #4a1c1c;
    }
    .result-card.ham {
        border-color: #1c3a28;
    }
    .verdict {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }
    .verdict-icon {
        font-size: 2.2rem;
    }
    .verdict-label {
        font-family: "Instrument Serif", serif;
        font-size: 1.6rem;
        color: #f0ede8;
        line-height: 1;
    }
    .verdict-conf {
        font-size: 0.8rem;
        color: #666;
        margin-top: 4px;
    }
    .bars {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .bar-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .bar-lbl {
        width: 36px;
        font-size: 0.78rem;
        color: #888;
        text-align: right;
    }
    .bar-track {
        flex: 1;
        height: 8px;
        background: #1e2228;
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
        width: 36px;
        font-size: 0.78rem;
        color: #888;
        font-family: "DM Mono", monospace;
    }
    .history-list {
        list-style: none;
    }
    .history-item {
        padding: 0.9rem 1.1rem;
        border-bottom: 1px solid #1a1d21;
    }
    .history-item:last-child {
        border-bottom: none;
    }
    .hi-top {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 6px;
    }
    .hi-badge {
        font-size: 0.7rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        flex-shrink: 0;
    }
    .hi-badge.spam {
        background: #3a1515;
        color: #f87171;
    }
    .hi-badge.ham {
        background: #153a25;
        color: #4ade80;
    }
    .hi-conf {
        font-family: "DM Mono", monospace;
        font-size: 0.72rem;
        color: #555;
        flex-shrink: 0;
    }
    .hi-preview {
        font-size: 0.8rem;
        color: #666;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }
    .hi-feedback {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.73rem;
        color: #555;
    }
    .fb-btn {
        padding: 2px 10px;
        border-radius: 5px;
        border: 1px solid;
        font-size: 0.72rem;
        cursor: pointer;
        background: transparent;
        transition: background 0.12s;
    }
    .fb-btn.ham {
        border-color: #1f3a2a;
        color: #4ade80;
    }
    .fb-btn.spam {
        border-color: #3a1f1f;
        color: #f87171;
    }
    .fb-btn.ham:hover {
        background: #1a3022;
    }
    .fb-btn.spam:hover {
        background: #301818;
    }
    .hi-corrected {
        font-size: 0.75rem;
        color: #555;
    }
    .hi-corrected strong {
        color: #888;
    }
</style>
