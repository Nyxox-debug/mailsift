# Email Spam / Ham Classifier — Browser-only ONNX edition

No backend server. Train once in Jupyter, export to ONNX, deploy the Svelte app to Vercel.

## Folder structure

```
email-classifier/
├── train_classifier.ipynb   ← Step 1: train the model
├── export_onnx.ipynb        ← Step 2: export to ONNX
└── svelte-app/
    ├── public/              ← Drop model.onnx + vocab.json here
    ├── src/
    │   ├── main.js
    │   ├── App.svelte       ← UI
    │   └── classifier.js    ← TF-IDF + ONNX inference (runs in browser)
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## Step 1 — Train (Jupyter)

```bash
pip install scikit-learn pandas numpy matplotlib seaborn requests tqdm joblib jupyter
jupyter notebook train_classifier.ipynb
```

Run all cells → produces `model.pkl` and `vectorizer.pkl`.

---

## Step 2 — Export to ONNX (Jupyter)

```bash
pip install skl2onnx onnx onnxruntime
jupyter notebook export_onnx.ipynb
```

Run all cells → produces:
- `svelte-app/public/model.onnx`   (the classifier weights)
- `svelte-app/public/vocab.json`   (TF-IDF vocabulary + IDF weights)

The TF-IDF vectorizer is **not** included in the ONNX file because its string
tokeniser doesn't translate cleanly to onnxruntime-web. Instead, `classifier.js`
re-implements the same transform in JavaScript using the exported vocab + IDF
weights — giving identical results to the Python pipeline.

---

## Step 3 — Run Svelte locally

```bash
cd svelte-app
npm install          # installs onnxruntime-web + vite-plugin-static-copy
npm run dev          # → http://localhost:5173
```

The app:
1. Fetches `model.onnx` and `vocab.json` on first load
2. Runs TF-IDF in JS → feeds the float vector into ONNX Runtime (WASM)
3. Displays spam/ham verdict + confidence bars
4. Keeps a correction history (feedback loop)

All inference is local — **no data leaves the browser**.

---

## Step 4 — Deploy to Vercel

```bash
cd svelte-app
npm run build        # output in dist/
```

Then either:

```bash
npx vercel --prod    # CLI deploy
```

Or connect your GitHub repo to Vercel and set:
- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Install command**: `npm install`

Add these response headers in `vercel.json` (required for ONNX SharedArrayBuffer):

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy",  "value": "require-corp" }
      ]
    }
  ]
}
```

---

## How the browser inference works

```
Email text
    ↓
clean()          — lowercase, strip URLs/emails/numbers/punctuation
tokenize()       — split into unigrams + bigrams
TF-IDF (JS)      — term frequency × IDF weights from vocab.json, L2-normalised
    ↓
Float32Array     — shape [1, vocab_size]
    ↓
onnxruntime-web  — loads model.onnx, runs WASM inference
    ↓
{ label, spamProb, hamProb }
```

## Typical model sizes

| File        | Size        |
|-------------|-------------|
| model.onnx  | ~50–200 KB  |
| vocab.json  | ~2–4 MB     |

`vocab.json` dominates because it stores 30k token strings + IDF weights.
You can reduce it by lowering `max_features` in the notebook (e.g. 10 000).
