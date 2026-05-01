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
