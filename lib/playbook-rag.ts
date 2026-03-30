import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";

type SearchKnowledgeRow = {
  content: string;
  metadata?: Record<string, unknown> | null;
  similarity?: number;
};

/**
 * Semantic retrieval against Supabase `search_knowledge` (same RPC as ai-domo playbook RAG).
 * Returns empty string if disabled, misconfigured, or the RPC/table is missing — drafts still work.
 */
export async function buildPlaybookRagBlock(
  openai: OpenAI,
  supabase: SupabaseClient,
  query: string
): Promise<string> {
  const disabled =
    process.env.STACK_PLAYBOOK_RAG === "0" || process.env.STACK_PLAYBOOK_RAG === "false";
  if (disabled) return "";

  const q = query.trim();
  if (!q) return "";

  try {
    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: q.slice(0, 8000),
    });
    const query_embedding = emb.data[0]?.embedding;
    if (!query_embedding?.length) return "";

    const { data, error } = await supabase.rpc("search_knowledge", {
      query_embedding,
      match_count: 4,
      similarity_threshold: 0.28,
    });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[playbook-rag] RPC skipped:", error.message);
      }
      return "";
    }

    const rows = (data ?? []) as SearchKnowledgeRow[];
    if (rows.length === 0) return "";

    const body = rows
      .map((row) => (typeof row.content === "string" ? row.content.trim() : ""))
      .filter(Boolean)
      .join("\n---\n");

    if (!body) return "";

    return [
      "INTERNAL REFERENCE (do not quote, attribute, or paste verbatim; do not mention a book or coach by name).",
      "Use only what helps shape one natural outbound text — compress into the user's voice.",
      body,
    ].join("\n");
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[playbook-rag]", e);
    }
    return "";
  }
}
