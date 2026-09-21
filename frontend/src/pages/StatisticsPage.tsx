import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Exam, ExamStatistics } from '../types'

const { Title, Paragraph, Text } = Typography

export default function StatisticsPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [examId, setExamId] = useState<number>()
  const [stats, setStats] = useState<ExamStatistics>()
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    api.listExams().then((list) => {
      setExams(list)
      if (list.length > 0) setExamId((cur) => cur ?? list[0].id)
    })
  }, [])

  useEffect(() => {
    if (examId) api.getStatistics(examId).then(setStats)
  }, [examId])

  const onAnalyze = async () => {
    if (!examId) return
    setAnalyzing(true)
    try {
      await api.generateAnalysis(examId)
      setStats(await api.getStatistics(examId))
      message.success('已生成学情分析')
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message: string }
      message.error(err.response?.data?.detail ?? err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const analysis = stats?.analysis
  // 得分率最低的题最值得讲评，排在前面
  const weakest = [...(stats?.questions ?? [])]
    .filter((q) => q.score_rate !== null)
    .sort((a, b) => (a.score_rate ?? 1) - (b.score_rate ?? 1))

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3}>成绩统计</Title>
        <Paragraph type="secondary">
          分数分布和逐题得分率由程序统计；学情评价和教学建议需要调用一次AI生成。
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
          <Button
            type="primary"
            loading={analyzing}
            disabled={!stats?.graded_count}
            onClick={onAnalyze}
          >
            {analysis ? '重新生成学情分析' : '生成学情分析'}
          </Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={!stats?.graded_count}
            onClick={() => examId && window.open(api.exportUrl(examId), '_blank')}
          >
            导出 Excel
          </Button>
        </Space>
      </Card>

      {!stats?.graded_count ? (
        <Empty description="这场考试还没有批改完成的试卷" />
      ) : (
        <>
          {stats.total_mismatch && (
            <Alert
              type="warning"
              showIcon
              message={`试卷实际满分是 ${stats.total_score} 分，但考试里填的总分是 ${stats.configured_total} 分`}
              description="下面的及格率、优秀率按实际满分计算。如果实际满分不对，请到考试管理里修正总分。"
            />
          )}

          <Card title="总体情况">
            <Space size="large" wrap>
              <Statistic title="已批改" value={stats.graded_count} suffix={`/ ${stats.submission_count}`} />
              <Statistic title="平均分" value={stats.avg_score} suffix={`/ ${stats.total_score}`} />
              <Statistic title="中位数" value={stats.median_score} />
              <Statistic title="最高" value={stats.max_score_got} />
              <Statistic title="最低" value={stats.min_score_got} />
              <Statistic
                title="及格率"
                value={((stats.pass_rate ?? 0) * 100).toFixed(0)}
                suffix="%"
              />
              <Statistic
                title="优秀率"
                value={((stats.excellent_rate ?? 0) * 100).toFixed(0)}
                suffix="%"
              />
            </Space>
          </Card>

          <Card title="分数段分布">
            <Space orientation="vertical" style={{ width: '100%' }}>
              {Object.entries(stats.bands ?? {}).map(([band, count]) => (
                <Space key={band} style={{ width: '100%' }}>
                  <Text style={{ width: 120, display: 'inline-block' }}>{band}</Text>
                  <Progress
                    percent={Math.round((count / stats.graded_count) * 100)}
                    format={() => `${count} 人`}
                    style={{ width: 320 }}
                  />
                </Space>
              ))}
            </Space>
          </Card>

          <Card
            title="逐题得分率（按从低到高排序）"
            extra={
              stats.comparable_count !== stats.graded_count && (
                <Text type="warning">
                  {stats.graded_count - stats.comparable_count} 份试卷题目数与多数人不同，未计入逐题统计
                </Text>
              )
            }
          >
            <Table
              rowKey="index"
              dataSource={weakest}
              pagination={false}
              size="small"
              columns={[
                { title: '题号', dataIndex: 'question_no', width: 140 },
                { title: '大题', dataIndex: 'section', width: 110 },
                {
                  title: '得分率',
                  width: 160,
                  render: (_, q) => (
                    <Progress
                      percent={Math.round((q.score_rate ?? 0) * 100)}
                      size="small"
                      status={(q.score_rate ?? 1) < 0.6 ? 'exception' : 'normal'}
                    />
                  ),
                },
                {
                  title: '平均/满分',
                  width: 100,
                  render: (_, q) => `${q.avg_score} / ${q.max_score}`,
                },
                {
                  title: '满分人数',
                  dataIndex: 'full_marks',
                  width: 90,
                },
                {
                  title: '零分人数',
                  width: 90,
                  render: (_, q) =>
                    q.zero_marks > 0 ? <Tag color="red">{q.zero_marks}</Tag> : q.zero_marks,
                },
                {
                  title: '主要失分原因',
                  render: (_, q) => (
                    <Space orientation="vertical" size={0}>
                      {(q.common_reasons ?? []).map((r, i) => (
                        <Text key={i} type="secondary" style={{ fontSize: 12 }}>
                          {r}
                        </Text>
                      ))}
                    </Space>
                  ),
                },
              ]}
            />
          </Card>

          {stats.essay && (
            <Card title="作文">
              <Space orientation="vertical">
                <Text>
                  平均 {stats.essay.avg_score} / {stats.essay.max_score}（得分率{' '}
                  {((stats.essay.score_rate ?? 0) * 100).toFixed(0)}%）
                </Text>
                {!!stats.essay.common_problems?.length && (
                  <div>
                    <Text strong>共性问题：</Text>
                    {stats.essay.common_problems.map((p, i) => (
                      <Paragraph key={i} style={{ marginBottom: 4 }}>
                        · {p}
                      </Paragraph>
                    ))}
                  </div>
                )}
              </Space>
            </Card>
          )}

          {analysis && (
            <Card
              title="学情分析与教学建议"
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  基于 {analysis.based_on_count} 份试卷 · {analysis.generated_at}
                </Text>
              }
            >
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Text strong>整体评价</Text>
                  <Paragraph>{analysis.overall}</Paragraph>
                </div>

                {!!analysis.strengths?.length && (
                  <div>
                    <Text strong type="success">
                      掌握较好
                    </Text>
                    {analysis.strengths.map((s, i) => (
                      <Paragraph key={i} style={{ marginBottom: 4 }}>
                        · {s}
                      </Paragraph>
                    ))}
                  </div>
                )}

                {!!analysis.weaknesses?.length && (
                  <div>
                    <Text strong type="warning">
                      薄弱环节
                    </Text>
                    {analysis.weaknesses.map((w, i) => (
                      <Paragraph key={i} style={{ marginBottom: 6 }}>
                        · <b>{w.point}</b>
                        {w.type && <Tag style={{ marginLeft: 6 }}>{w.type}</Tag>}
                        <br />
                        <Text type="secondary">{w.evidence}</Text>
                      </Paragraph>
                    ))}
                  </div>
                )}

                {!!analysis.teaching_suggestions?.length && (
                  <div>
                    <Text strong>教学建议</Text>
                    {analysis.teaching_suggestions.map((t, i) => (
                      <Paragraph key={i} style={{ marginBottom: 6 }}>
                        {i + 1}. {t.action}
                        <br />
                        <Text type="secondary">针对：{t.why}</Text>
                      </Paragraph>
                    ))}
                  </div>
                )}

                {!!analysis.attention_students?.length && (
                  <div>
                    <Text strong>需要重点关注的学生</Text>
                    {analysis.attention_students.map((a, i) => (
                      <Paragraph key={i} style={{ marginBottom: 4 }}>
                        · <b>{a.name}</b>：{a.reason}
                      </Paragraph>
                    ))}
                  </div>
                )}
              </Space>
            </Card>
          )}

          <Card title="成绩排名">
            <Table
              rowKey="submission_id"
              dataSource={stats.students}
              pagination={false}
              size="small"
              columns={[
                { title: '名次', width: 60, render: (_, __, i) => i + 1 },
                { title: '学生', dataIndex: 'name' },
                { title: '得分', dataIndex: 'score', width: 90 },
                {
                  title: '得分率',
                  width: 100,
                  render: (_, s) => `${((s.rate ?? 0) * 100).toFixed(0)}%`,
                },
                {
                  title: '',
                  width: 70,
                  render: (_, s) => <Link to={`/submissions/${s.submission_id}`}>查看</Link>,
                },
              ]}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
