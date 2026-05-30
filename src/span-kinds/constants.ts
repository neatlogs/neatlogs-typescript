/**
 * Shared constants for vector DB systems and retrieval operations.
 *
 * Used by both attribute-processor.ts and mapping.ts to avoid
 * divergent keyword lists.
 */

/** Known vector database system identifiers. */
export const VECTOR_DB_SYSTEMS = new Set([
  'chroma',
  'chromadb',
  'pinecone',
  'qdrant',
  'milvus',
  'marqo',
  'weaviate',
  'lancedb',
  'pgvector',
  'elasticsearch',
]);

/** Operations that indicate a retrieval / read from a vector DB. */
export const RETRIEVAL_OPS = [
  'query',
  'search',
  'get',
  'fetch',
  'find',
  'retrieve',
  'scroll',
  'peek',
  'discover',
  'recommend',
  'aggregate',
  'hybrid_search',
  'select',
];

/** Operations that indicate a write to a vector DB. */
export const WRITE_OPS = [
  'upsert',
  'insert',
  'add',
  'update',
  'delete',
  'create',
  'drop',
  'put',
  'set',
  'upload',
  'index',
];

/** Vector DB names used for span-name-based inference. */
export const VECTOR_DB_NAMES = [
  'chroma',
  'pinecone',
  'weaviate',
  'qdrant',
  'milvus',
  'lancedb',
  'marqo',
];
