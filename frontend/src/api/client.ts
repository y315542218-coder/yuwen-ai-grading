import axios from 'axios'
import type {
  AnswerKeyItem,
  ClassGroup,
  Exam,
  ExamAnalysis,
  ExamStatistics,
  ModelConfig,
  ProviderPreset,
  Student,
  Submission,
  SubmissionDetail,
} from '../types'

const client = axios.create({ baseURL: '/api' })

export const imageUrl = (submissionId: number, index: number) =>
  `/api/submissions/${submissionId}/images/${index}`

export const api = {
  // 模型配置
  getPresets: () =>
    client.get<Record<string, ProviderPreset>>('/model-configs/presets').then((r) => r.data),
  listModelConfigs: () => client.get<ModelConfig[]>('/model-configs').then((r) => r.data),
  createModelConfig: (payload: {
    provider: string
    base_url: string
    model_name: string
    api_key: string
    thinking_enabled?: boolean
    reasoning_effort?: string
  }) => client.post<ModelConfig>('/model-configs', payload).then((r) => r.data),
  updateModelConfig: (
    id: number,
    payload: { thinking_enabled?: boolean; reasoning_effort?: string },
  ) => client.patch<ModelConfig>(`/model-configs/${id}`, payload).then((r) => r.data),
  testModelConfig: (id: number) => client.post(`/model-configs/${id}/test`).then((r) => r.data),
  deleteModelConfig: (id: number) => client.delete(`/model-configs/${id}`).then((r) => r.data),

  // 考试 / 参考答案
  createExam: (payload: {
    name: string
    total_score: number
    grading_notes?: string
    files: File[]
  }) => {
    const form = new FormData()
    form.append('name', payload.name)
    form.append('total_score', String(payload.total_score))
    if (payload.grading_notes) form.append('grading_notes', payload.grading_notes)
    payload.files.forEach((f) => form.append('files', f))
    return client.post<Exam>('/exams', form).then((r) => r.data)
  },
  listExams: () => client.get<Exam[]>('/exams').then((r) => r.data),
  updateExam: (
    id: number,
    payload: {
      name?: string
      total_score?: number
      reference_text?: string
      grading_notes?: string
      answer_key?: AnswerKeyItem[]
      hires_tiles?: boolean
    },
  ) => client.patch<Exam>(`/exams/${id}`, payload).then((r) => r.data),
  importAnswerKey: (id: number) =>
    client.post<Exam>(`/exams/${id}/answer-key/import`).then((r) => r.data),
  getStatistics: (id: number) =>
    client.get<ExamStatistics>(`/exams/${id}/statistics`).then((r) => r.data),
  generateAnalysis: (id: number) =>
    client.post<ExamAnalysis>(`/exams/${id}/analysis`).then((r) => r.data),
  deleteExam: (id: number) => client.delete(`/exams/${id}`).then((r) => r.data),

  // 考试下的学生试卷
  addStudentsToExam: (examId: number, studentIds: number[]) =>
    client
      .post<Submission[]>(`/exams/${examId}/students`, { student_ids: studentIds })
      .then((r) => r.data),
  uploadImages: (submissionId: number, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return client.post<Submission>(`/submissions/${submissionId}/images`, form).then((r) => r.data)
  },
  clearImages: (submissionId: number) =>
    client.delete(`/submissions/${submissionId}/images`).then((r) => r.data),
  bulkUpload: (examId: number, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return client.post<Submission[]>(`/exams/${examId}/bulk-upload`, form).then((r) => r.data)
  },
  mergeSubmissions: (targetId: number, sourceIds: number[]) =>
    client
      .post<Submission>(`/submissions/${targetId}/merge`, { source_ids: sourceIds })
      .then((r) => r.data),
  splitSubmission: (id: number) =>
    client.post<Submission[]>(`/submissions/${id}/split`).then((r) => r.data),
  setSubmissionStudent: (id: number, studentId: number | null) =>
    client.patch<Submission>(`/submissions/${id}`, { student_id: studentId }).then((r) => r.data),
  gradeAll: (examId: number) =>
    client.post<{ queued: number }>(`/exams/${examId}/grade-all`).then((r) => r.data),
  listSubmissions: (examId?: number) =>
    client
      .get<Submission[]>('/submissions', { params: examId ? { exam_id: examId } : {} })
      .then((r) => r.data),
  getSubmission: (id: number) =>
    client.get<SubmissionDetail>(`/submissions/${id}`).then((r) => r.data),
  regradeSubmission: (id: number) => client.post(`/submissions/${id}/regrade`).then((r) => r.data),
  updateScores: (
    id: number,
    payload: {
      questions?: { index: number; score: number; reason?: string; reference_answer?: string }[]
      essay_score?: number
    },
  ) => client.patch<SubmissionDetail>(`/submissions/${id}/score`, payload).then((r) => r.data),
  deleteSubmission: (id: number) => client.delete(`/submissions/${id}`).then((r) => r.data),

  // 班级与学生
  listClasses: () => client.get<ClassGroup[]>('/class-groups').then((r) => r.data),
  createClass: (name: string) =>
    client.post<ClassGroup>('/class-groups', { name }).then((r) => r.data),
  deleteClass: (id: number) => client.delete(`/class-groups/${id}`).then((r) => r.data),
  listStudents: (classId?: number) =>
    client
      .get<Student[]>('/students', { params: classId ? { class_id: classId } : {} })
      .then((r) => r.data),
  createStudentsBatch: (names: string[], classId?: number) =>
    client
      .post<Student[]>('/students/batch', { names, class_id: classId })
      .then((r) => r.data),
  deleteStudent: (id: number) => client.delete(`/students/${id}`).then((r) => r.data),
}
