import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, Descriptions, Image, Space, Table, Tag, Typography, message } from 'antd'
import { api, imageUrl } from '../api/client'
import type { SubmissionDetail } from '../types'

const { Title, Paragraph, Text } = Typography

export default function SubmissionDetailPage() {
  const { id } = useParams()
  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const [regrading, setRegrading] = useState(false)

  const refresh = useCallback(() => {
    if (id) api.getSubmission(Number(id)).then(setDetail)
  }, [id])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 4000)
    return () => clearInterval(timer)
  }, [refresh])

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
        {detail.token_usage && (
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            本次消耗：输入 {detail.token_usage.prompt_tokens ?? '-'} token
            {detail.token_usage.prompt_cache_hit_tokens !== undefined &&
              `（其中命中缓存 ${detail.token_usage.prompt_cache_hit_tokens}，缓存部分价格约为未命中的 1/50）`}
            ，输出 {detail.token_usage.completion_tokens ?? '-'} token
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
          <Table
            rowKey="question_no"
            dataSource={result.questions}
            pagination={false}
            size="small"
            columns={[
              { title: '题号', dataIndex: 'question_no', width: 80 },
              { title: '学生作答', dataIndex: 'student_answer' },
              { title: '参考答案', dataIndex: 'reference_answer' },
              {
                title: '得分',
                width: 80,
                render: (_, r) => `${r.score}/${r.max_score}`,
              },
              { title: '原因', dataIndex: 'reason' },
              {
                title: '',
                width: 90,
                render: (_, r) => (r.manual_review ? <Tag color="orange">待复核</Tag> : null),
              },
            ]}
          />
        </Card>
      ) : null}

      {result?.essay ? (
        <Card title="作文">
          <Space orientation="vertical">
            <Text strong>
              得分：{result.essay.score} / {result.essay.max_score}
            </Text>
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
    </Space>
  )
}
