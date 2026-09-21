import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Input,
  InputNumber,
  Segmented,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import { api } from '../api/client'
import type { AnswerKeyItem, Exam } from '../types'

const { Title, Paragraph, Text } = Typography
const { TextArea } = Input

export default function ExamDetailPage() {
  const { id } = useParams()
  const examId = Number(id)
  const [exam, setExam] = useState<Exam | null>(null)
  const [referenceText, setReferenceText] = useState('')
  const [notes, setNotes] = useState('')
  const [answerKey, setAnswerKey] = useState<AnswerKeyItem[]>([])
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)

  const load = useCallback((data: Exam) => {
    setExam(data)
    setReferenceText(data.reference_text ?? '')
    setNotes(data.grading_notes ?? '')
    setAnswerKey(data.answer_key ?? [])
  }, [])

  useEffect(() => {
    api.listExams().then((list) => {
      const found = list.find((e) => e.id === examId)
      if (found) load(found)
    })
  }, [examId, load])

  const onImport = async () => {
    setImporting(true)
    try {
      load(await api.importAnswerKey(examId))
      message.success('已从批改结果导入逐题答案，请核对')
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message: string }
      message.error(err.response?.data?.detail ?? err.message)
    } finally {
      setImporting(false)
    }
  }

  const onSave = async () => {
    setSaving(true)
    try {
      load(
        await api.updateExam(examId, {
          reference_text: referenceText,
          grading_notes: notes,
          answer_key: answerKey,
        }),
      )
      message.success('已保存，后续批改会以修改后的答案为准')
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message: string }
      message.error(err.response?.data?.detail ?? err.message)
    } finally {
      setSaving(false)
    }
  }

  const updateItem = (index: number, patch: Partial<AnswerKeyItem>) => {
    setAnswerKey((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  if (!exam) return null

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3}>{exam.name}</Title>
        <Paragraph type="secondary">
          发现参考答案有误可以直接在这里改。保存后的内容会作为<b>权威答案</b>参与后续批改，
          与下方从文件提取的原文冲突时以逐题答案为准。
        </Paragraph>
      </div>

      <Card
        title="逐题参考答案"
        extra={
          <Space>
            <Button onClick={onImport} loading={importing}>
              从已批改的试卷导入
            </Button>
            <Button type="primary" onClick={onSave} loading={saving}>
              保存
            </Button>
          </Space>
        }
      >
        {answerKey.length === 0 ? (
          <Text type="secondary">
            还没有逐题答案。批改完第一份试卷后会自动生成，也可以点右上角手动导入。
          </Text>
        ) : (
          <Table
            rowKey={(_, i) => String(i)}
            dataSource={answerKey}
            pagination={false}
            size="small"
            columns={[
              {
                title: '题号',
                width: 160,
                render: (_, __, i) => (
                  <Input
                    value={answerKey[i].question_no}
                    onChange={(e) => updateItem(i, { question_no: e.target.value })}
                  />
                ),
              },
              {
                title: '参考答案（可直接修改）',
                render: (_, __, i) => (
                  <TextArea
                    autoSize={{ minRows: 1, maxRows: 6 }}
                    value={answerKey[i].reference_answer}
                    onChange={(e) => updateItem(i, { reference_answer: e.target.value })}
                  />
                ),
              },
              {
                title: '满分',
                width: 90,
                render: (_, __, i) => (
                  <InputNumber
                    min={0}
                    value={answerKey[i].max_score}
                    onChange={(v) => updateItem(i, { max_score: v ?? 0 })}
                  />
                ),
              },
              {
                title: '',
                width: 60,
                render: (_, __, i) => (
                  <Button
                    size="small"
                    danger
                    onClick={() => setAnswerKey((prev) => prev.filter((_, j) => j !== i))}
                  >
                    删除
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card title="参考答案原文（从上传文件提取）">
        <TextArea
          value={referenceText}
          onChange={(e) => setReferenceText(e.target.value)}
          autoSize={{ minRows: 6, maxRows: 20 }}
        />
      </Card>

      <Card title="识别模式">
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Segmented
            value={exam.hires_tiles ? 'hires' : 'normal'}
            disabled={saving}
            onChange={async (v) => {
              setSaving(true)
              try {
                load(await api.updateExam(examId, { hires_tiles: v === 'hires' }))
                message.success('已保存，下次批改生效')
              } finally {
                setSaving(false)
              }
            }}
            options={[
              { label: '普通模式', value: 'normal' },
              { label: '高清识别模式', value: 'hires' },
            ]}
          />
          {exam.hires_tiles ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <b>高清识别模式</b>：每页额外切成若干小块一起发送，每块都不会被模型压缩，
              清晰度约为普通模式的 3 倍。括号里的拼音、被圈出或划掉的小字能看清，
              适合密排的正式试卷。代价是每份多约 0.03 元、速度略慢。
            </Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <b>普通模式</b>：整页直接发送。模型会把大图压缩到约 1300×1300，
              你这种扫描件约等于缩到 34%，括号里的拼音、圈划记号容易糊掉。
              适合字大、作答清楚的简单测验，快且省。
            </Text>
          )}
        </Space>
      </Card>

      <Card title="补充评分说明">
        <TextArea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          autoSize={{ minRows: 3, maxRows: 8 }}
          placeholder="例如：古诗文每错一字扣0.5分，整空最多扣1分"
        />
      </Card>

      <Button type="primary" onClick={onSave} loading={saving}>
        保存全部修改
      </Button>
    </Space>
  )
}
