export interface SemanticResult {
    category: 'Invoice' | 'Contract' | 'Personal' | 'Work' | 'Code' | 'Unknown';
    summary: string;
}

const PROMPT_TEMPLATE = (snippet: string) => `
Analyze the following file content snippet and classify it into one of these categories:
[Invoice, Contract, Personal, Work, Code, Unknown].
Also provide a very brief (max 10 words) summary of what it is.

Return the response in this JSON format ONLY (no markdown, no code blocks):
{ "category": "...", "summary": "..." }

Snippet:
"""
${snippet.slice(0, 2000)}
"""
`.trim();

// ── OpenAI backend ──────────────────────────────────────────────────────────

async function classifyWithOpenAI(apiKey: string, textSnippet: string): Promise<SemanticResult> {
    const body = {
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: 'You are a file classification assistant. Always respond with valid JSON only.' },
            { role: 'user', content: PROMPT_TEMPLATE(textSnippet) },
        ],
        temperature: 0,
        max_tokens: 80,
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        throw Object.assign(new Error(`OpenAI API error (${res.status}): ${text}`), { status: res.status });
    }

    const json: any = await res.json();
    const raw = json.choices?.[0]?.message?.content ?? '{}';
    const data = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    return {
        category: data.category || 'Unknown',
        summary: data.summary || 'No summary available',
    };
}

// ── Gemini backend ──────────────────────────────────────────────────────────

async function classifyWithGemini(apiKey: string, textSnippet: string): Promise<SemanticResult> {
    // Lazy-import so the package is only loaded when Gemini is actually used
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const result = await model.generateContent(PROMPT_TEMPLATE(textSnippet));
    const response = await result.response;
    const text = response.text();
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(jsonStr);
    return {
        category: data.category || 'Unknown',
        summary: data.summary || 'No summary available',
    };
}

// ── Public classifier ───────────────────────────────────────────────────────

export class SemanticClassifier {
    private openAiKey: string | undefined;
    private geminiKey: string | undefined;

    constructor(openAiKey?: string, geminiKey?: string) {
        this.openAiKey = openAiKey;
        this.geminiKey = geminiKey;
    }

    /** Classify a text snippet using OpenAI (preferred) or Gemini. */
    async classify(textSnippet: string): Promise<SemanticResult> {
        return this.withRetry(() => {
            if (this.openAiKey) {
                return classifyWithOpenAI(this.openAiKey!, textSnippet);
            }
            if (this.geminiKey) {
                return classifyWithGemini(this.geminiKey!, textSnippet);
            }
            throw new Error('No AI API key configured');
        });
    }

    private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 5000): Promise<T> {
        try {
            return await fn();
        } catch (error: any) {
            const isRateLimit = error.status === 429 || error.message?.includes('429');
            if (retries > 0 && isRateLimit) {
                console.warn(`[SemanticClassifier] Rate limit hit. Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.withRetry(fn, retries - 1, delay * 2);
            }
            console.error('Semantic classification failed:', error.message);
            return { category: 'Unknown', summary: 'AI analysis failed' } as any;
        }
    }
}
