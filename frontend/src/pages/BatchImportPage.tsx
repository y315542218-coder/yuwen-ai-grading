import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Image,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import GradingProgress from '../components/GradingProgress'
import ModeSwitch from '../components/ModeSwitch'
import { api, imageUrl } from '../api/client'
import type { Exam, Student, Submission, SubmissionStatus } from '../types'

const { Title, Paragraph, Text } = Typography

const STATUS_MAP: Record<SubmissionStatus, { text: string; color: string }> = {
  draft: { text: '待上传', color: 'default' },
  pending: { text: '待批改', color: 'gold' },
  processing: { text: '批改中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  failed: { text: '失败', color: 'red' },
}

export default function BatchImportPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [examId, setExamId] = useState<number>()
  const [students, setStudents] = useState<Student[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [uploading, setUploading] = useState(false)
  const [grading, setGrading] = useState(false)
  const [dragId, setDragId] = useState<number>()
  const [hoverId, setHoverId] = useState<number>()

  useEffect(() => {
    api.listExams().then((list) => {
      setExams(list)
      if (list.length > 0) setExamId((cur) => cur ?? list[0].id)
    })
    api.listStudents().then(setStudents)
  }, [])

  const refresh = (id?: number) => {
    if (id) api.listSubmissions(id).then(setSubmissions)
  }

  useEffect(() => {
    refresh(examId)
    const timer = setInterval(() => refresh(examId), 4000)
    return () => clearInterval(timer)
  }, [examId])

  const onUpload = async (files: File[]) => {
    if (!examId || files.length === 0) return
    setUploading(true)
    try {
      const created = await api.bulkUpload(examId, files)
      message.success(`已导入 ${created.length} 份试卷`)
      refresh(examId)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message: string }
      message.error(err.response?.data?.detail ?? err.message)
    } finally {
      setUploading(false)
    }
  }

  const onDrop = async (targetId: number) => {
    setHoverId(undefined)
    if (!dragId || dragId === targetId) return
    const source = dragId
    setDragId(undefined)
    try {
      await api.mergeSubmissions(targetId, [source])
      message.success('已合并为同一份试卷')
      refresh(examId)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message: string }
      message.error(err.response?.data?.detail ?? err.message)
    }
  }

  const onPickStudent = async (submissionId: number, studentId: number | null) => {
    await api.setSubmissionStudent(submissionId, studentId)
    refresh(examId)
  }

  const onGradeAll = async () => {
    if (!examId) return
    setGrading(true)
    try {
      const { queued } = await api.gradeAll(examId)
      message.success(queued > 0 ? `已提交 ${queued} 份试卷批改` : '没有待批改的试卷')
      refresh(examId)
    } finally {
      setGrading(false)
    }
  }

  const takenStudentIds = new Set(
    submissions.map((s) => s.student_id).filter(Boolean) as number[],
  )
  // 用已完成试卷的实际耗时估算剩余时间，比写死一个数字准
  const [avgSeconds, setAvgSeconds] = useState<number>()
  useEffect(() => {
    const done = submissions.filter((s) => s.status === 'completed')
    if (done.length === 0) return
    Promise.all(done.slice(-5).map((s) => api.getSubmission(s.id))).then((details) => {
      const times = details
        .map((d) => d.grading_meta?.seconds)
        .filter((v): v is number => typeof v === 'number')
      if (times.length) setAvgSeconds(times.reduce((a, b) => a + b, 0) / times.length)
    })
    // 只在完成数量变化时重新估算，避免每次轮询都发一堆请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions.filter((s) => s.status === 'completed').length])

  const readyCount = submissions.filter(
    (s) => s.image_paths.length > 0 && ['draft', 'pending', 'failed'].includes(s.status),
  ).length

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3}>批量导入</Title>
        <Paragraph type="secondary">
          适合小测验：先把扫描件一次性全传进来，每张图片各成一份试卷，PDF 按整份导入（多页会一起）；
          多页的试卷<b>把一张卡片拖到另一张上即可合并</b>；学生姓名可以随后再选，不选也能批改。
        </Paragraph>
      </div>

      <Card>
        <Space wrap>
          <Select
            placeholder="选择考试"
            style={{ width: 260 }}
            value={examId}
            onChange={setExamId}
            options={exams.map((e) => ({ label: e.name, value: e.id }))}
          />
          <Upload
            multiple
            accept=".png,.jpg,.jpeg,.pdf"
            showUploadList={false}
            beforeUpload={(file, fileList) => {
              if (file === fileList[fileList.length - 1]) onUpload(fileList)
              return false
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploading} disabled={!examId}>
              批量导入（图片 / PDF）
            </Button>
          </Upload>
          <Button type="primary" onClick={onGradeAll} loading={grading} disabled={readyCount === 0}>
            批量批改{readyCount > 0 ? `（${readyCount} 份）` : ''}
          </Button>
          <ModeSwitch
            exam={exams.find((e) => e.id === examId)}
            onChanged={(updated) =>
              setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
            }
          />
          <Button onClick={() => refresh(examId)}>刷新状态</Button>
        </Space>
      </Card>

      <GradingProgress submissions={submissions} avgSeconds={avgSeconds} />

      {submissions.length === 0 ? (
        <Empty description="还没有试卷，先在上方导入图片或 PDF" />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {submissions.map((s) => (
            <Card
              key={s.id}
              size="small"
              style={{
                width: 240,
                cursor: 'grab',
                outline: hoverId === s.id ? '2px dashed #1677ff' : undefined,
                opacity: dragId === s.id ? 0.5 : 1,
              }}
              draggable
              onDragStart={() => setDragId(s.id)}
              onDragEnd={() => {
                setDragId(undefined)
                setHoverId(undefined)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragId && dragId !== s.id) setHoverId(s.id)
              }}
              onDragLeave={() => setHoverId(undefined)}
              onDrop={() => onDrop(s.id)}
              title={
                <Space size={4}>
                  <Text>{s.image_paths.length} 页</Text>
                  <Tag color={STATUS_MAP[s.status].color}>{STATUS_MAP[s.status].text}</Tag>
                  {s.total_score != null && <Tag color="green">{s.total_score} 分</Tag>}
                </Space>
              }
            >
              <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                <Image.PreviewGroup>
                  <Space size={4} wrap>
                    {s.image_paths.map((_, i) => (
                      <Image
                        key={i}
                        src={imageUrl(s.id, i, true)}
                        preview={{ src: imageUrl(s.id, i) }}
                        width={s.image_paths.length > 1 ? 66 : 140}
                        style={{ objectFit: 'cover' }}
                      />
                    ))}
                  </Space>
                </Image.PreviewGroup>

                <Select
                  placeholder="选择学生（可不选）"
                  style={{ width: '100%' }}
                  size="small"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={s.student_id ?? undefined}
                  onChange={(v) => onPickStudent(s.id, v ?? null)}
                  options={students.map((st) => ({
                    label: st.name,
                    value: st.id,
                    disabled: takenStudentIds.has(st.id) && st.id !== s.student_id,
                  }))}
                />

                <Space size={8}>
                  <Link to={`/submissions/${s.id}`}>查看</Link>
                  {s.image_paths.length > 1 && (
                    <Button
                      size="small"
                      onClick={async () => {
                        const parts = await api.splitSubmission(s.id)
                        message.success(`已拆成 ${parts.length} 份，每页一份`)
                        refresh(examId)
                      }}
                    >
                      拆分
                    </Button>
                  )}
                  <Button
                    size="small"
                    danger
                    onClick={async () => {
                      await api.deleteSubmission(s.id)
                      refresh(examId)
                    }}
                  >
                    删除
                  </Button>
                </Space>
              </Space>
            </Card>
          ))}
        </div>
      )}
    </Space>
  )
}
