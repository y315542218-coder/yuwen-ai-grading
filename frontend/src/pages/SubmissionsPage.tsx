import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Transfer,
  Typography,
  Upload,
  message,
} from 'antd'
import { ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Exam, Student, Submission, SubmissionStatus } from '../types'

const { Title, Paragraph, Text } = Typography

const STATUS_MAP: Record<SubmissionStatus, { text: string; color: string }> = {
  draft: { text: '待上传', color: 'default' },
  pending: { text: '待批改', color: 'gold' },
  processing: { text: '批改中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  failed: { text: '失败', color: 'red' },
}

export default function SubmissionsPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [examId, setExamId] = useState<number>()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [grading, setGrading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>()

  useEffect(() => {
    api.listExams().then((list) => {
      setExams(list)
      if (list.length > 0) setExamId((cur) => cur ?? list[0].id)
    })
    api.listStudents().then(setStudents)
  }, [])

  const refresh = (id?: number) => {
    if (id)
      api.listSubmissions(id).then((list) => {
        setSubmissions(list)
        setLastRefresh(new Date())
      })
  }

  const onManualRefresh = async () => {
    setRefreshing(true)
    try {
      if (examId) {
        const list = await api.listSubmissions(examId)
        setSubmissions(list)
        setLastRefresh(new Date())
        const running = list.filter((s) => s.status === 'processing').length
        message.success(running > 0 ? `还有 ${running} 份正在批改` : '已是最新状态')
      }
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    refresh(examId)
    const timer = setInterval(() => refresh(examId), 4000)
    return () => clearInterval(timer)
  }, [examId])

  const alreadyIn = new Set(submissions.map((s) => s.student_id).filter(Boolean) as number[])

  const onAddStudents = async () => {
    if (!examId || picked.length === 0) return
    await api.addStudentsToExam(examId, picked.map(Number))
    message.success(`已加入 ${picked.length} 名学生`)
    setPicked([])
    setPickerOpen(false)
    refresh(examId)
  }

  const onUpload = async (submissionId: number, files: File[]) => {
    try {
      await api.uploadImages(submissionId, files)
      message.success(`已上传 ${files.length} 张`)
      refresh(examId)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message: string }
      message.error(err.response?.data?.detail ?? err.message)
    }
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

  const readyCount = submissions.filter(
    (s) => s.image_paths.length > 0 && ['draft', 'pending', 'failed'].includes(s.status),
  ).length

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3}>批改试卷</Title>
        <Paragraph type="secondary">
          先选考试，把学生加进来，给每人上传各自的试卷（可多页），最后一次性批量批改。
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
          <Button onClick={() => setPickerOpen(true)} disabled={!examId}>
            添加学生
          </Button>
          <Button type="primary" onClick={onGradeAll} loading={grading} disabled={readyCount === 0}>
            批量批改{readyCount > 0 ? `（${readyCount} 份）` : ''}
          </Button>
          <Button icon={<ReloadOutlined />} loading={refreshing} onClick={onManualRefresh}>
            刷新状态
          </Button>
          {lastRefresh && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {lastRefresh.toLocaleTimeString()} 更新
            </Text>
          )}
        </Space>
      </Card>

      <Card title="学生与试卷">
        <Table
          rowKey="id"
          dataSource={submissions}
          pagination={false}
          columns={[
            { title: '学生', render: (_, r: Submission) => r.student_name || `#${r.id}` },
            {
              title: '试卷',
              width: 110,
              render: (_, r: Submission) =>
                r.image_paths.length ? `${r.image_paths.length} 页` : <Text type="secondary">未上传</Text>,
            },
            {
              title: '状态',
              width: 100,
              render: (_, r: Submission) => (
                <Tag color={STATUS_MAP[r.status].color}>{STATUS_MAP[r.status].text}</Tag>
              ),
            },
            { title: '总分', dataIndex: 'total_score', width: 80 },
            {
              title: '说明',
              render: (_, r: Submission) =>
                r.error_message ? <Text type="danger">{r.error_message}</Text> : null,
            },
            {
              title: '操作',
              width: 220,
              render: (_, r: Submission) => (
                <Space>
                  <Upload
                    multiple
                    accept=".png,.jpg,.jpeg,.pdf"
                    showUploadList={false}
                    beforeUpload={(_file, fileList) => {
                      // fileList 是本次选中的全部文件，只在最后一个回调里统一提交
                      if (_file === fileList[fileList.length - 1]) onUpload(r.id, fileList)
                      return false
                    }}
                  >
                    <Button size="small" icon={<UploadOutlined />}>
                      {r.image_paths.length ? '追加' : '上传试卷'}
                    </Button>
                  </Upload>
                  {r.image_paths.length > 0 && (
                    <Button
                      size="small"
                      onClick={async () => {
                        await api.clearImages(r.id)
                        refresh(examId)
                      }}
                    >
                      清空
                    </Button>
                  )}
                  <Link to={`/submissions/${r.id}`}>查看</Link>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="添加学生到这场考试"
        open={pickerOpen}
        onOk={onAddStudents}
        onCancel={() => setPickerOpen(false)}
        width={640}
      >
        <Transfer
          dataSource={students
            .filter((s) => !alreadyIn.has(s.id))
            .map((s) => ({ key: String(s.id), title: s.name }))}
          titles={['学生名单', '加入本场考试']}
          targetKeys={picked}
          onChange={(keys) => setPicked(keys as string[])}
          render={(item) => item.title}
          listStyle={{ width: 260, height: 320 }}
        />
      </Modal>
    </Space>
  )
}
