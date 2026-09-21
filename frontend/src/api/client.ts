import axios from 'axios'
import type {
  ClassGroup,
  Exam,
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
  }) => client.post<ModelConfig>('/model-configs', payload).then((r) => r.data),
  testModelConfig: (id: number) => client.post(`/model-configs/${id}/test`).then((r) => r.data),
  deleteModelConfig: (id: number) => client.delete(`/model-configs/${id}`).then((r) => r.data),

  // 考试 / 参考答案
  createExam: (payload: {
    name: string
    total_score: number
    pages_per_paper: number
    grading_notes?: string
    files: File[]
  }) => {
    const form = new FormData()
    form.append('name', payload.name)
    form.append('total_score', String(payload.total_score))
    form.append('pages_per_paper', String(payload.pages_per_paper))
    if (payload.grading_notes) form.append('grading_notes', payload.grading_notes)
    payload.files.forEach((f) => form.append('files', f))
    return client.post<Exam>('/exams', form).then((r) => r.data)
  },
  listExams: () => client.get<Exam[]>('/exams').then((r) => r.data),
  deleteExam: (id: number) => client.delete(`/exams/${id}`).then((r) => r.data),

  // 学生试卷
  uploadSubmissions: (examId: number, files: File[], pagesPerPaper?: number) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    const params = new URLSearchParams({ exam_id: String(examId) })
    if (pagesPerPaper) params.set('pages_per_paper', String(pagesPerPaper))
    return client.post<Submission[]>(`/submissions?${params}`, form).then((r) => r.data)
  },
  listSubmissions: (examId?: number) =>
    client
      .get<Submission[]>('/submissions', { params: examId ? { exam_id: examId } : {} })
      .then((r) => r.data),
  getSubmission: (id: number) =>
    client.get<SubmissionDetail>(`/submissions/${id}`).then((r) => r.data),
  regradeSubmission: (id: number) => client.post(`/submissions/${id}/regrade`).then((r) => r.data),
  deleteSubmission: (id: number) => client.delete(`/submissions/${id}`).then((r) => r.data),

  // 班级（P1）
  listClasses: () => client.get<ClassGroup[]>('/class-groups').then((r) => r.data),
  createClass: (name: string) =>
    client.post<ClassGroup>('/class-groups', { name }).then((r) => r.data),
  listStudents: (classId?: number) =>
    client
      .get<Student[]>('/students', { params: classId ? { class_id: classId } : {} })
      .then((r) => r.data),
  createStudent: (payload: { name: string; class_id?: number; parent_contact?: string }) =>
    client.post<Student>('/students', payload).then((r) => r.data),
  assignStudent: (submissionId: number, studentId: number) =>
    client
      .post(`/submissions/${submissionId}/assign-student?student_id=${studentId}`)
      .then((r) => r.data),
}
