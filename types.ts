export interface KnowledgeItem {
  id?: string | number;
  name?: string;
  description?: string;
  difficulty?: string;
  relations?: any[];
  [key: string]: any;
}

export type ProcessingStatus = 'idle' | 'parsing' | 'processing' | 'complete' | 'error';

export interface ProcessProgress {
  total: number;
  current: number;
  percentage: number;
}