# Email Classification Pipeline

This document explains how the email spam/ham classifier works - from model training to browser inference.

## Overview

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Training          │     │   Export            │     │   Runtime           │
│   (Python)          │     │   (Python)          │     │   (Browser)         │
├─────────────────────┤     ├─────────────────────┤     ├─────────────────────┤
│ train_classifier   │────▶│ export_onnx         │────▶│ classifier.ts       │
│ .ipynb              │     │ .ipynb              │     │ (Svelte)            │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
        │                           │                           │
        ▼                           ▼                           ▼
  SpamAssassin               model.onnx                  vocab.json
  corpus                     vocab.json                  model.onnx
                              (static files)             (loaded in browser)
```

---

## Phase 1: Training

**File:** `notebooks/train_classifier.ipynb`

### 1.1 Data Collection
- Downloads SpamAssassin Public Corpus (4 tarballs)
- Extracts ~5,790 emails:
  - **Ham (legitimate):** ~3,902 emails
  - **Spam:** ~1,898 emails

### 1.2 Email Parsing
- Reads raw email files
- Extracts `Subject` header and plain-text body
- Handles multipart emails

### 1.3 Text Preprocessing
```python
def clean(text):
    text = text.lower()
    text = re.sub(r'http\S+|www\.\S+', ' URL ', text)  # URLs
    text = re.sub(r'\S+@\S+', ' EMAIL ', text)          # Email addresses
    text = re.sub(r'\d+', ' NUM ', text)                 # Numbers
    text = re.sub(r'[^\w\s]', ' ', text)                # Strip punctuation
    text = re.sub(r'\s+', ' ', text).strip()
    return text
```

### 1.4 TF-IDF Vectorization
- **Max features:** 30,000
- **N-gram range:** (1, 2) - unigrams + bigrams
- **Sublinear TF:** True (1 + log(tf))
- **Min document frequency:** 2

### 1.5 Model Training & Comparison
Trained and compared 4 models:

| Model              | Accuracy |
|--------------------|----------|
| Multinomial NB     | 97.84%   |
| Complement NB      | 98.53%   |
| Logistic Regression| 98.53%   |
| **LinearSVC**      | **98.96%** |

**Winner:** LinearSVC with ~98.96% accuracy

### 1.6 Output
- `model.pkl` - Trained classifier
- `vectorizer.pkl` - TF-IDF vectorizer

---

## Phase 2: Export

**File:** `notebooks/export_onnx.ipynb`

### 2.1 Model Calibration
LinearSVC doesn't support `predict_proba` natively. CalibratedClassifierCV wraps it to output probabilities.

### 2.2 Vocabulary Export
Exports TF-IDF metadata to `vocab.json`:
```json
{
  "vocab": {"the": 0, "and": 1, ...},
  "idf": [1.2, 0.8, ...],
  "ngram_range": [1, 2],
  "sublinear_tf": true
}
```

### 2.3 ONNX Export
Converts the calibrated classifier to ONNX format using `skl2onnx`.

### 2.4 Output
- `model.onnx` (~1.5 MB) - Classifier in ONNX format
- `vocab.json` (~1.2 MB) - Vocabulary + IDF weights

Both files are placed in `svelte-app/public/` for static serving.

---

## Phase 3: Browser Runtime

**File:** `svelte-app/src/lib/classifier.ts`

### 3.1 Model Loading
```typescript
async function loadClassifier() {
  const [vocab, session] = await Promise.all([
    fetch('/vocab.json'),
    ort.InferenceSession.create('/model.onnx', {
      executionProviders: ['wasm']
    })
  ]);
  return { vocab: await vocab.json(), session };
}
```

### 3.2 Client-Side TF-IDF Transform

The TF-IDF transformation is reimplemented in JavaScript:

1. **Text Cleaning** - Same preprocessing as training
2. **Tokenization** - Generate n-grams based on `ngram_range`
3. **TF Calculation** - Count term frequencies
4. **TF-IDF Scaling** - Apply sublinear scaling and IDF weights
5. **L2 Normalization** - Euclidean normalization

```typescript
function tfidf(text, vocab) {
  const cleaned = clean(text);
  const tokens = tokenize(cleaned, vocab.ngram_range);

  // Build term frequency vector
  const tf = new Float32Array(vocab.idf.length);
  for (const token of tokens) {
    const idx = vocab.vocab[token];
    if (idx !== undefined) tf[idx] += 1;
  }

  // Apply TF-IDF scaling
  for (let i = 0; i < tf.length; i++) {
    if (tf[i] > 0) {
      const scaled = vocab.sublinear_tf ? 1 + Math.log(tf[i]) : tf[i];
      tf[i] = scaled * vocab.idf[i];
    }
  }

  // L2 normalize
  // ...

  return tf;
}
```

### 3.3 ONNX Inference
```typescript
async function classify(text, vocab, session) {
  const vec = tfidf(text, vocab);
  const tensor = new ort.Tensor('float32', vec, [1, vec.length]);

  const output = await session.run({ float_input: tensor });
  const [hamProb, spamProb] = output.probabilities.data;
  const label = spamProb > 0.5 ? 'spam' : 'ham';

  return { label, spamProb, hamProb, confidence: Math.max(hamProb, spamProb) };
}
```

### 3.4 Privacy
All inference happens in the browser using WebAssembly. No email data is sent to any server.

---

## Key Files

| File | Purpose |
|------|---------|
| `notebooks/train_classifier.ipynb` | Model training pipeline |
| `notebooks/export_onnx.ipynb` | Export to ONNX format |
| `notebooks/model.pkl` | Trained classifier |
| `notebooks/vectorizer.pkl` | TF-IDF vectorizer |
| `svelte-app/src/lib/classifier.ts` | Browser inference logic |
| `svelte-app/public/model.onnx` | ONNX model (served statically) |
| `svelte-app/public/vocab.json` | Vocabulary + IDF (served statically) |

---

## Running the Pipeline

### Retrain Model
```bash
# Activate Python environment
source venv/bin/activate

# Run training notebook
jupyter notebook notebooks/train_classifier.ipynb

# Run export notebook
jupyter notebook notebooks/export_onnx.ipynb
```

### Run Web App
```bash
cd svelte-app
npm install
npm run dev
```

---

## Accuracy

- **Test accuracy:** ~98.96%
- **Precision (ham):** 98%
- **Precision (spam):** 100%
- **Recall (ham):** 100%
- **Recall (spam):** 97%