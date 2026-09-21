import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Input, InputNumber, Space, Table, Typography, Upload, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'
import { api } from '../api/client'
import type { Exam } from '../types'

const { Title, Paragraph, Text } = Typography
const { TextArea } = Input

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [name, setName] = useState('')
  const [totalScore, setTotalScore] = useState(100)
  const [notes, setNotes] = useState('')
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [saving, setSaving] = useState(false)

  const refresh = () => api.listExams().then(setExams)

  useEffect(() => {
    refresh()
  }, [])

  const onSave = async () => {
    if (!name) {
      message.warning('请填写考试名称')
      return
    }
    const files = fileList.map((f) => f.originFileObj as File).filter(Boolean)
    if (files.length === 0) {
      message.warning('请上传参考答案')
      return
    }
    setSaving(true)
    try {
      await api.createExam({
        name,
        total_score: totalScore,
        grading_notes: notes || undefined,
        files,
      })
      message.success('已保存')
      setName('')
      setNotes('')
      setFileList([])
      refresh()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message: string }
      message.error(err.response?.data?.detail ?? err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%', maxWidth: 800 }}>
      <div>
        <Title level={3}>考试 / 参考答案</Title>
        <Paragraph type="secondary">
          上传参考答案即可。Word、文本和带文字层的 PDF 会被提取成文字；扫描版 PDF 和图片会直接作为参考图发给模型。
        </Paragraph>
      </div>

      <Card title="新建考试">
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap>
            <Input
              placeholder="考试名称，例如 五年级期末语文"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: 280 }}
            />
            <Space.Compact>
              <Input disabled style={{ width: 60 }} value="总分" />
              <InputNumber value={totalScore} onChange={(v) => setTotalScore(v ?? 100)} />
            </Space.Compact>
          </Space>

          <Upload
            multiple
            accept=".docx,.txt,.md,.pdf,.png,.jpg,.jpeg"
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList }) => setFileList(fileList)}
          >
            <Button icon={<UploadOutlined />}>上传参考答案（Word / PDF / 文本 / 图片）</Button>
          </Upload>

          <div>
            <Text type="secondary">
              补充评分说明（可选，例如"古诗文每错一字扣0.5分"，会一起发给模型）
            </Text>
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <Button type="primary" onClick={onSave} loading={saving}>
            保存
          </Button>
        </Space>
      </Card>

      <Card title="已有考试">
        <Table
          rowKey="id"
          dataSource={exams}
          pagination={false}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 60 },
            { title: '名称', dataIndex: 'name' },
            { title: '总分', dataIndex: 'total_score', width: 80 },
            {
              title: '参考答案',
              render: (_, r: Exam) =>
                [
                  r.reference_text ? `文本 ${r.reference_text.length} 字` : null,
                  r.reference_images.length ? `${r.reference_images.length} 张图` : null,
                ]
                  .filter(Boolean)
                  .join(' + ') || '-',
            },
            {
              title: '操作',
              width: 170,
              render: (_, r: Exam) => (
                <Space>
                <Link to={`/exams/${r.id}`}>查看/编辑答案</Link>
                <Button
                  size="small"
                  danger
                  onClick={async () => {
                    await api.deleteExam(r.id)
                    refresh()
                  }}
                >
                  删除
                </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  )
}
