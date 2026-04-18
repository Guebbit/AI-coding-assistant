import { z } from 'zod';

export const toolCitationSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1)
});

export type IToolCitation = z.infer<typeof toolCitationSchema>;

export class ToolCitationBuffer {
    private readonly citations: IToolCitation[] = [];

    add(citation: IToolCitation): void {
        this.citations.push(citation);
    }

    addMany(citations: IToolCitation[]): void {
        for (const citation of citations) {
            this.add(citation);
        }
    }

    flush(): IToolCitation[] {
        const output = [...this.citations];
        this.citations.length = 0;
        return output;
    }

    peek(): IToolCitation[] {
        return [...this.citations];
    }
}
