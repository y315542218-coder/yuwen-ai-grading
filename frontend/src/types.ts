export interface AnswerKeyItem {
  question_no: string
  reference_answer: string
  max_score: number
}

export interface Exam {
  id: number
  name: string
  total_score: number
  reference_text?: string | null
  reference_images: string[]
  grading_notes?: string | null
  answer_key?: AnswerKeyItem[] | null
  hires_tiles: boolean
}

export interface ModelConfig {
  id: number
  provider: string
  base_url: string
  model_name: string
  is_active: boolean
  thinking_enabled: boolean
  reasoning_effort: string
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
    /** 教师手动改过分的题 */
    manual_adjusted?: boolean
  }[]
  essay?: {
    score: number
    max_score: number
    strengths?: string[]
    problems?: string[]
    suggestions?: string[]
    manual_adjusted?: boolean
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
    completion_tokens_details?: { reasoning_tokens?: number }
  } | null
  /** 本次批改用的模型与参数，用来对比不同配置的效果 */
  grading_meta?: {
    model?: string
    thinking?: boolean
    effort?: string | null
    tiled?: boolean
    images?: number
    seconds?: number
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

export interface ExamAnalysis {
  overall?: string
  strengths?: string[]
  weaknesses?: { point: string; evidence: string; type?: string }[]
  teaching_suggestions?: { action: string; why: string }[]
  attention_students?: { name: string; reason: string }[]
  generated_at?: string
  based_on_count?: number
}

export interface ExamStatistics {
  exam_name: string
  total_score: number
  configured_total?: number
  total_mismatch?: boolean
  submission_count: number
  graded_count: number
  comparable_count: number
  avg_score?: number
  median_score?: number
  max_score_got?: number
  min_score_got?: number
  pass_rate?: number
  excellent_rate?: number
  bands?: Record<string, number>
  questions: {
    index: number
    question_no: string
    section: string
    max_score: number
    avg_score: number
    score_rate: number | null
    full_marks: number
    zero_marks: number
    common_reasons?: string[]
  }[]
  essay?: {
    avg_score: number
    max_score: number
    score_rate: number | null
    common_problems?: string[]
  } | null
  students: { submission_id: number; name: string; score: number; rate: number | null }[]
  analysis?: ExamAnalysis | null
}
