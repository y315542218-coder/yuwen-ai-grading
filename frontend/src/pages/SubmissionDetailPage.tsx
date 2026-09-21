import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Affix,
  Button,
  Card,
  Descriptions,
  Image,
  InputNumber,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { api, imageUrl } from '../api/client'
import type { SubmissionDetail } from '../types'

const { Title, Paragraph, Text } = Typography

export default function SubmissionDetailPage() {
  const { id } = useParams()
  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const [regrading, setRegrading] = useState(false)
  const [edits, setEdits] = useState<Record<number, { score: number }>>({})
  const [essayEdit, setEssayEdit] = useState<number>()
  const [savingScores, setSavingScores] = useState(false)
  const dirty = Object.keys(edits).length > 0 || essayEdit !== undefined

  const refresh = useCallback(() => {
    if (id) api.getSubmission(Number(id)).then(setDetail)
  }, [id])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    // 批改中才需要自动轮询；教师正在改分时不要把输入刷掉
    if (dirty || !detail || !['pending', 'processing'].includes(detail.status)) return
    const timer = setInterval(refresh, 4000)
    return () => clearInterval(timer)
  }, [refresh, dirty, detail])

  const onEditScore = (index: number, value: number | null) => {
    if (value === null) return
    setEdits((prev) => ({ ...prev, [index]: { score: value } }))
  }

  const onSaveScores = async () => {
    if (!id) return
    setSavingScores(true)
    try {
      const updated = await api.updateScores(Number(id), {
        questions: Object.entries(edits).map(([index, v]) => ({
          index: Number(index),
          score: v.score,
        })),
        essay_score: essayEdit,
      })
      setDetail(updated)
      setEdits({})
      setEssayEdit(undefined)
      message.success(`已保存，总分更新为 ${updated.total_score}`)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message: string }
      message.error(err.response?.data?.detail ?? err.message)
    } finally {
      setSavingScores(false)
    }
  }

  const onRegrade = async () => {
    if (!id) return
    setRegrading(true)
    try {
      await api.regradeSubmission(Number(id))
      message.success('已重新提交批改')
      refresh()
    } finally {
      setRegrading(false)
    }
  }

  if (!detail) return null
  const result = detail.result

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3}>{detail.student_name || `试卷 #${detail.id}`}</Title>
        <Descriptions column={3} size="small">
          <Descriptions.Item label="状态">{detail.status}</Descriptions.Item>
          <Descriptions.Item label="总分">{detail.total_score ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="上传时间">
            {new Date(detail.created_at).toLocaleString()}
          </Descriptions.Item>
        </Descriptions>
        {detail.error_message && <Paragraph type="danger">{detail.error_message}</Paragraph>}
        {detail.grading_meta && (
          <Space size={4} wrap style={{ marginBottom: 8 }}>
            <Tag>{detail.grading_meta.model}</Tag>
            {detail.grading_meta.thinking ? (
              <Tag color="blue">思考模式 {detail.grading_meta.effort}</Tag>
            ) : (
              <Tag>未开思考</Tag>
            )}
            {detail.grading_meta.seconds !== undefined && (
              <Tag>耗时 {detail.grading_meta.seconds}s</Tag>
            )}
          </Space>
        )}
        {detail.token_usage && (
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            本次消耗：输入 {detail.token_usage.prompt_tokens ?? '-'} token
            {detail.token_usage.prompt_cache_hit_tokens !== undefined &&
              `（其中命中缓存 ${detail.token_usage.prompt_cache_hit_tokens}，缓存部分价格约为未命中的 1/50）`}
            ，输出 {detail.token_usage.completion_tokens ?? '-'} token
            {detail.token_usage.completion_tokens_details?.reasoning_tokens
              ? `（其中思考 ${detail.token_usage.completion_tokens_details.reasoning_tokens}）`
              : ''}
          </Paragraph>
        )}
        <Button onClick={onRegrade} loading={regrading}>
          重新批改
        </Button>
      </div>

      <Card title={`原卷（${detail.image_paths.length} 页）`}>
        <Image.PreviewGroup>
          <Space wrap>
            {detail.image_paths.map((_, i) => (
              <Image key={i} src={imageUrl(detail.id, i)} width={220} />
            ))}
          </Space>
        </Image.PreviewGroup>
      </Card>

      {result?.sections?.length ? (
        <Card title="各大题得分">
          <Space wrap>
            {result.sections.map((s) => (
              <Tag key={s.name} color="blue">
                {s.name} {s.score}/{s.total}
              </Tag>
            ))}
          </Space>
        </Card>
      ) : null}

      {result?.questions?.length ? (
        <Card title="逐题批改">
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            AI 判分不对时，直接改「得分」这一列，作文分也可以改，最后一起保存，总分自动重算。
          </Paragraph>
          <Table
            rowKey={(_, i) => String(i)}
            dataSource={result.questions}
            pagination={false}
            size="small"
            columns={[
              { title: '题号', dataIndex: 'question_no', width: 110 },
              { title: '学生作答', dataIndex: 'student_answer' },
              { title: '参考答案', dataIndex: 'reference_answer' },
              {
                title: '得分',
                width: 130,
                render: (_, r, i) => (
                  <Space size={4}>
                    <InputNumber
                      size="small"
                      min={0}
                      max={r.max_score}
                      step={0.5}
                      style={{ width: 70 }}
                      value={edits[i]?.score ?? r.score}
                      onChange={(v) => onEditScore(i, v)}
                    />
                    <Text type="secondary">/ {r.max_score}</Text>
                  </Space>
                ),
              },
              { title: '原因', dataIndex: 'reason' },
              {
                title: '',
                width: 90,
                render: (_, r) =>
                  r.manual_adjusted ? (
                    <Tag color="purple">已人工改分</Tag>
                  ) : r.manual_review ? (
                    <Tag color="orange">待复核</Tag>
                  ) : null,
              },
            ]}
          />
        </Card>
      ) : null}

      {result?.essay ? (
        <Card
          title="作文"
          extra={result.essay.manual_adjusted ? <Tag color="purple">已人工改分</Tag> : null}
        >
          <Space orientation="vertical">
            <Space>
              <Text strong>得分：</Text>
              <InputNumber
                min={0}
                max={result.essay.max_score}
                step={0.5}
                style={{ width: 90 }}
                value={essayEdit ?? result.essay.score}
                onChange={(v) => v !== null && setEssayEdit(v)}
              />
              <Text type="secondary">/ {result.essay.max_score}</Text>
            </Space>
            {!!result.essay.strengths?.length && (
              <Text type="success">优点：{result.essay.strengths.join('；')}</Text>
            )}
            {!!result.essay.problems?.length && (
              <Text type="warning">问题：{result.essay.problems.join('；')}</Text>
            )}
            {!!result.essay.suggestions?.length && (
              <Text>建议：{result.essay.suggestions.join('；')}</Text>
            )}
          </Space>
        </Card>
      ) : null}

      {result?.notes?.length ? (
        <Card title="需要教师确认">
          {result.notes.map((n, i) => (
            <Paragraph key={i}>{n}</Paragraph>
          ))}
        </Card>
      ) : null}

      {/* 题目表格很长、作文在最底部，保存按钮吸底才能随时点到 */}
      {dirty && (
        <Affix offsetBottom={16}>
          <Card styles={{ body: { padding: 12 } }}>
            <Space>
              <Text type="warning">有未保存的改分</Text>
              <Button type="primary" loading={savingScores} onClick={onSaveScores}>
                保存改分
              </Button>
              <Button
                onClick={() => {
                  setEdits({})
                  setEssayEdit(undefined)
                }}
              >
                撤销
              </Button>
            </Space>
          </Card>
        </Affix>
      )}
    </Space>
  )
}
