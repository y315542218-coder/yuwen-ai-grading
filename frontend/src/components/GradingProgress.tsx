import { Alert, Progress, Space, Typography } from 'antd'
import type { Submission } from '../types'

const { Text } = Typography

/** 估算剩余时间用的默认单份耗时：还没有已完成的样本时先按这个估 */
const FALLBACK_SECONDS = 60

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} 分钟`
  return `${Math.floor(min / 60)} 小时 ${min % 60} 分`
}

/** 批改进度条。批改是串行的，剩余时间 = 剩余份数 × 已完成的平均耗时。 */
export default function GradingProgress({
  submissions,
  avgSeconds,
}: {
  submissions: Submission[]
  avgSeconds?: number
}) {
  const withImages = submissions.filter((s) => s.image_paths.length > 0)
  const done = withImages.filter((s) => s.status === 'completed').length
  const failed = withImages.filter((s) => s.status === 'failed').length
  const running = withImages.filter((s) => s.status === 'processing').length
  const waiting = withImages.filter((s) => s.status === 'pending').length

  // 没有正在批改也没有排队的，就不显示进度条
  if (running === 0 && waiting === 0) {
    return failed > 0 ? (
      <Alert
        type="warning"
        showIcon
        message={`有 ${failed} 份批改失败`}
        description="已自动重试 3 次仍未成功。可以在列表里单独点「重新批改」，或检查模型配置。"
      />
    ) : null
  }

  const total = withImages.length
  const remaining = running + waiting
  const eta = remaining * (avgSeconds || FALLBACK_SECONDS)

  return (
    <Alert
      type="info"
      message={
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <Space>
            <Text strong>
              批改中 {done + failed} / {total}
            </Text>
            <Text type="secondary">预计还需 {formatDuration(eta)}</Text>
            {failed > 0 && <Text type="danger">失败 {failed} 份</Text>}
          </Space>
          <Progress
            percent={Math.round(((done + failed) / total) * 100)}
            status={running > 0 ? 'active' : 'normal'}
            style={{ width: '100%', marginBottom: 0 }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            批改是一份接一份进行的，关掉页面不影响后台继续批改。
          </Text>
        </Space>
      }
    />
  )
}
