import * as ort from 'onnxruntime-web';

ort.env.wasm.wasmPaths = '/';

// ── Types ─────────────────────────────────────────────────────────────────

interface VocabMeta {
    vocab: Record<string, number>;
    idf: number[];
    ngram_range: [number, number];
    sublinear_tf: boolean;
}

export interface ClassifierModel {
    vocab: VocabMeta;
    session: ort.InferenceSession;
}

export interface ClassifyResult {
    label: 'spam' | 'ham';
    spamProb: number;
    hamProb: number;
    confidence: number;
}

// ── Text cleaning ──────────────────────────────────────────────────────────
function clean(text: string): string {
    return text
        .toLowerCase()
        .replace(/https?:\/\/\S+|www\.\S+/g, ' url ')
        .replace(/\S+@\S+/g, ' email ')
        .replace(/\d+/g, ' num ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── Tokenise into n-grams ──────────────────────────────────────────────────
function tokenize(text: string, ngram_range: [number, number]): string[] {
    const words = text.split(' ').filter(Boolean);
    const tokens: string[] = [];
    for (let n = ngram_range[0]; n <= ngram_range[1]; n++) {
        for (let i = 0; i <= words.length - n; i++) {
            tokens.push(words.slice(i, i + n).join(' '));
        }
    }
    return tokens;
}

// ── TF-IDF transform ───────────────────────────────────────────────────────
function tfidf(text: string, { vocab, idf, ngram_range, sublinear_tf }: VocabMeta): Float32Array {
    const n_features = idf.length;
    const tf = new Float32Array(n_features);

    const cleaned = clean(text);
    const tokens = tokenize(cleaned, ngram_range);

    for (const token of tokens) {
        const idx = vocab[token];
        if (idx !== undefined) tf[idx] += 1;
    }

    for (let i = 0; i < n_features; i++) {
        if (tf[i] === 0) continue;
        const scaled = sublinear_tf ? 1 + Math.log(tf[i]) : tf[i];
        tf[i] = scaled * idf[i];
    }

    let norm = 0;
    for (let i = 0; i < n_features; i++) norm += tf[i] * tf[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < n_features; i++) tf[i] /= norm;

    return tf;
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function loadClassifier(): Promise<ClassifierModel> {
    const [vocabRes, sessionRes] = await Promise.all([
        fetch('/vocab.json').then(r => {
            if (!r.ok) throw new Error('Failed to load vocab.json');
            return r.json() as Promise<VocabMeta>;
        }),
        ort.InferenceSession.create('/model.onnx', {
            executionProviders: ['wasm'],
        }),
    ]);

    return { vocab: vocabRes, session: sessionRes };
}

export async function classify({ vocab, session }: ClassifierModel, text: string): Promise<ClassifyResult> {
    const vec = tfidf(text, vocab);
    const tensor = new ort.Tensor('float32', vec, [1, vec.length]);

    const feeds = { float_input: tensor };
    const output = await session.run(feeds);

    const labelTensor = output['label'] || output[Object.keys(output)[0]];
    const probaTensor = output['probabilities'] || output[Object.keys(output)[1]];

    const labelVal = Number(labelTensor.data[0]);
    const rawData = probaTensor.data;
    if (!(rawData instanceof Float32Array)) {
        throw new Error(`Expected Float32Array for probabilities, got ${rawData.constructor.name}`);
    }
    const proba = Array.from(rawData);

    const hamProb = proba[0];
    const spamProb = proba[1];
    const label = labelVal === 1 ? 'spam' : 'ham';

    return {
        label,
        spamProb,
        hamProb,
        confidence: label === 'spam' ? spamProb : hamProb,
    };
}
// /**
//  * classifier.js
//  * -------------
//  * Loads vocab.json + model.onnx from /public and runs spam/ham inference
//  * entirely in the browser using onnxruntime-web (WASM backend).
//  *
//  * Usage:
//  *   import { loadClassifier, classify } from './classifier.js';
//  *   const model = await loadClassifier();
//  *   const result = await classify(model, 'Click here for a FREE prize!');
//  *   // → { label: 'spam', spamProb: 0.97, hamProb: 0.03, confidence: 0.97 }
//  */
//
// import * as ort from 'onnxruntime-web';
//
// // Point ONNX Runtime at its WASM binaries (served from node_modules via Vite)
// ort.env.wasm.wasmPaths = '/';
//
// // ── Text cleaning  (mirrors the Python notebook) ──────────────────────────
// function clean(text) {
//   return text
//     .toLowerCase()
//     .replace(/https?:\/\/\S+|www\.\S+/g, ' url ')
//     .replace(/\S+@\S+/g,                 ' email ')
//     .replace(/\d+/g,                     ' num ')
//     .replace(/[^\w\s]/g,                 ' ')
//     .replace(/\s+/g,                     ' ')
//     .trim();
// }
//
// // ── Tokenise into n-grams ─────────────────────────────────────────────────
// function tokenize(text, ngram_range) {
//   const words  = text.split(' ').filter(Boolean);
//   const tokens = [];
//   for (let n = ngram_range[0]; n <= ngram_range[1]; n++) {
//     for (let i = 0; i <= words.length - n; i++) {
//       tokens.push(words.slice(i, i + n).join(' '));
//     }
//   }
//   return tokens;
// }
//
// // ── TF-IDF transform ──────────────────────────────────────────────────────
// function tfidf(text, { vocab, idf, ngram_range, sublinear_tf }) {
//   const n_features = idf.length;
//   const tf         = new Float32Array(n_features);          // term counts
//
//   const cleaned = clean(text);
//   const tokens  = tokenize(cleaned, ngram_range);
//
//   for (const token of tokens) {
//     const idx = vocab[token];
//     if (idx !== undefined) tf[idx] += 1;
//   }
//
//   // Apply sublinear TF scaling: tf = 1 + log(tf) when tf > 0
//   for (let i = 0; i < n_features; i++) {
//     if (tf[i] === 0) continue;
//     const scaled = sublinear_tf ? 1 + Math.log(tf[i]) : tf[i];
//     tf[i] = scaled * idf[i];
//   }
//
//   // L2-normalise the row
//   let norm = 0;
//   for (let i = 0; i < n_features; i++) norm += tf[i] * tf[i];
//   norm = Math.sqrt(norm);
//   if (norm > 0) for (let i = 0; i < n_features; i++) tf[i] /= norm;
//
//   return tf;
// }
//
// // ── Public API ────────────────────────────────────────────────────────────
//
// /**
//  * loadClassifier()
//  * Downloads vocab.json and model.onnx and creates an InferenceSession.
//  * Call once on app startup; the returned object is passed to classify().
//  */
// export async function loadClassifier() {
//   const [vocabRes, sessionRes] = await Promise.all([
//     fetch('/vocab.json').then(r => {
//       if (!r.ok) throw new Error('Failed to load vocab.json');
//       return r.json();
//     }),
//     ort.InferenceSession.create('/model.onnx', {
//       executionProviders: ['wasm'],
//     }),
//   ]);
//
//   return { vocab: vocabRes, session: sessionRes };
// }
//
// /**
//  * classify(model, text)
//  * Runs the full TF-IDF → ONNX inference pipeline.
//  * Returns { label, spamProb, hamProb, confidence }
//  */
// export async function classify({ vocab, session }, text) {
//   // 1. Vectorize
//   const vec     = tfidf(text, vocab);
//   const tensor  = new ort.Tensor('float32', vec, [1, vec.length]);
//
//   // 2. Run ONNX model
//   const feeds  = { float_input: tensor };
//   const output = await session.run(feeds);
//
//   // 3. Parse output tensors
//   //    ONNX sklearn export gives: 'label' (int64) and 'probabilities' (float32)
//   const labelTensor = output['label']         || output[Object.keys(output)[0]];
//   const probaTensor = output['probabilities'] || output[Object.keys(output)[1]];
//
//   const labelVal = Number(labelTensor.data[0]);       // 0 = ham, 1 = spam
//   const proba    = Array.from(probaTensor.data);       // [p_ham, p_spam]
//
//   const hamProb  = proba[0];
//   const spamProb = proba[1];
//   const label    = labelVal === 1 ? 'spam' : 'ham';
//
//   return {
//     label,
//     spamProb,
//     hamProb,
//     confidence: label === 'spam' ? spamProb : hamProb,
//   };
// }
