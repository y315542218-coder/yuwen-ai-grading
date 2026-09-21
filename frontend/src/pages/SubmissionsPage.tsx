import { useEffect, useState } from 'react'
import { Button, Card, Select, Space, Table, Tag, Typography, Upload, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Exam, Submission, SubmissionStatus } from '../types'

const { Title, Paragraph, Text } = Typography

const STATUS_MAP: Record<SubmissionStatus, { text: string; color: string }> = {
  pending: { text: '排队中', color: 'default' },
  processing: { text: '批改中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  failed: { text: '失败', color: 'red' },
}

export default function SubmissionsPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [examId, setExamId] = useState<number>()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    api.listExams().then((list) => {
      setExams(list)
      if (list.length > 0) setExamId(list[0].id)
    })
  }, [])

  const refresh = (id?: number) => {
    if (id) api.listSubmissions(id).then(setSubmissions)
  }

  useEffect(() => {
    refresh(examId)
    // 批改是后台任务，简单轮询刷新状态
    const timer = setInterval(() => refresh(examId), 4000)
    return () => clearInterval(timer)
  }, [examId])

  const currentExam = exams.find((e) => e.id === examId)
  const perPaper = currentExam?.pages_per_paper ?? 1
  const files = fileList.map((f) => f.originFileObj as File).filter(Boolean)
  const paperCount = perPaper > 0 ? Math.floor(files.length / perPaper) : 0
  const remainder = perPaper > 0 ? files.length % perPaper : 0

  const onUpload = async () => {
    if (!examId || files.length === 0) return
    setUploading(true)
    try {
      const created = await api.uploadSubmissions(examId, files)
      message.success(`已上传 ${created.length} 份试卷，正在批改`)
      setFileList([])
      refresh(examId)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message: string }
      message.error(err.response?.data?.detail ?? err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3}>批改试卷</Title>
        <Paragraph type="secondary">
          按页面顺序上传扫描件，系统按"每份试卷页数"自动分组，每份试卷连同参考答案打包发给AI批改。
        </Paragraph>
      </div>

      <Card>
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap>
            <Select
              placeholder="选择考试"
              style={{ width: 260 }}
              value={examId}
              onChange={setExamId}
              options={exams.map((e) => ({ label: e.name, value: e.id }))}
            />
            {currentExam && <Text type="secondary">每份试卷 {perPaper} 页</Text>}
          </Space>

          <Upload
            multiple
            accept=".png,.jpg,.jpeg"
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList }) => setFileList(fileList)}
          >
            <Button icon={<UploadOutlined />} disabled={!examId}>
              选择扫描件（可多选）
            </Button>
          </Upload>

          {files.length > 0 && (
            <Text type={remainder ? 'danger' : 'secondary'}>
              共 {files.length} 张图片，将分成 {paperCount} 份试卷
              {remainder ? `，还剩 ${remainder} 张无法整除，请检查页数设置` : ''}
            </Text>
          )}

          <Button
            type="primary"
            onClick={onUpload}
            loading={uploading}
            disabled={!examId || files.length === 0 || remainder !== 0}
          >
            上传并开始批改
          </Button>
        </Space>
      </Card>

      <Card title="批改记录">
        <Table
          rowKey="id"
          dataSource={submissions}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 60 },
            { title: '学生', render: (_, r: Submission) => r.student_name || '-' },
            { title: '页数', render: (_, r: Submission) => r.image_paths.length, width: 70 },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (s: SubmissionStatus) => (
                <Tag color={STATUS_MAP[s].color}>{STATUS_MAP[s].text}</Tag>
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
              width: 80,
              render: (_, r: Submission) => <Link to={`/submissions/${r.id}`}>查看</Link>,
            },
          ]}
        />
      </Card>
    </Space>
  )
}
