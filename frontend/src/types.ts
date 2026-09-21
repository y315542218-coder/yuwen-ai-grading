export interface Exam {
  id: number
  name: string
  total_score: number
  reference_text?: string | null
  reference_images: string[]
  grading_notes?: string | null
}

export interface ModelConfig {
  id: number
  provider: string
  base_url: string
  model_name: string
  is_active: boolean
}

export interface ProviderPreset {
  base_url: string
  default_model: string
}

export type SubmissionStatus = 'draft' | 'pending' | 'processing' | 'completed' | 'failed'

export interface Submission {
  id: number
  exam_id: number
  student_id?: number | null
  student_name?: string | null
  image_paths: string[]
  status: SubmissionStatus
  total_score?: number | null
  error_message?: string | null
  created_at: string
}

/** 模型返回的批改结果，结构见 backend/app/services/prompts.py 里约定的JSON */
export interface GradingResult {
  student_name?: string | null
  total_score?: number
  sections?: { name: string; score: number; total: number }[]
  questions?: {
    question_no: string
    student_answer?: string
    reference_answer?: string
    score: number
    max_score: number
    reason?: string
    manual_review?: boolean
  }[]
  essay?: {
    score: number
    max_score: number
    strengths?: string[]
    problems?: string[]
    suggestions?: string[]
  } | null
  notes?: string[]
}

export interface SubmissionDetail extends Submission {
  result?: GradingResult | null
  /** DeepSeek 返回的 usage，prompt_cache_hit_tokens 是命中缓存的部分 */
  token_usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_cache_hit_tokens?: number
    prompt_cache_miss_tokens?: number
  } | null
}

export interface ClassGroup {
  id: number
  name: string
}

export interface Student {
  id: number
  name: string
  class_id?: number | null
  parent_contact?: string | null
}
