import { GoogleGenerativeAI } from '@google/generative-ai';

export interface SemanticResult {
    category: 'Invoice' | 'Contract' | 'Personal' | 'Work' | 'Code' | 'Unknown';
    summary: string;
}

export class SemanticClassifier {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        const modelName = 'gemini-flash-latest';
        this.model = this.genAI.getGenerativeModel({ model: modelName });
    }

    /**
     * Analyze a text snippet and return its semantic category and summary.
     */
    async classify(textSnippet: string): Promise<SemanticResult> {
        return this.withRetry(async () => {
            const prompt = `
            Analyze the following file content snippet and classify it into one of these categories:
            [Invoice, Contract, Personal, Work, Code, Unknown].
            Also provide a very brief (max 10 words) summary of what it is.

            Return the response in this JSON format:
            { "category": "...", "summary": "..." }

            Snippet:
            """
            ${textSnippet.slice(0, 2000)}
            """
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Clean up code blocks if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(jsonStr);

            return {
                category: data.category || 'Unknown',
                summary: data.summary || 'No summary available'
            };
        });
    }

    private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 5000): Promise<T> {
        try {
            return await fn();
        } catch (error: any) {
            if (retries > 0 && (error.status === 429 || error.message?.includes('429'))) {
                console.warn(`[SemanticClassifier] Rate limit hit. Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.withRetry(fn, retries - 1, delay * 2);
            }
            console.error('Semantic classification failed:', error.message);
            return { category: 'Unknown', summary: 'AI analysis failed' } as any;
        }
    }
}
