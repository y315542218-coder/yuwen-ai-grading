import { useEffect, useState } from 'react'
import { Button, Checkbox, Drawer, Modal, Space, Steps, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'

const { Title, Paragraph, Text } = Typography

const SEEN_KEY = 'pg1-onboarded'

const STEPS = [
  {
    title: '配置模型',
    page: '/model-config',
    desc: '粘贴你自己的 API Key。必须选支持读图的模型，DeepSeek 要用 deepseek-flash。',
  },
  {
    title: '建考试、传参考答案',
    page: '/exams',
    desc: '支持 Word / PDF / 文本 / 图片。总分记得按实际试卷填，别留着默认的 100。',
  },
  {
    title: '上传学生试卷',
    page: '/batch',
    desc: '正式考试用「批改试卷」按学生逐人传；小测验用「批量导入」一次全传、拖拽合并。',
  },
  {
    title: '批改并复核',
    page: '/submissions',
    desc: '点批量批改，完成后逐题查看。标了「待复核」的题是模型看不准的，请你亲自确认。',
  },
  {
    title: '看统计',
    page: '/statistics',
    desc: '分数分布、逐题得分率，还能生成班级学情分析和教学建议。',
  },
]

/** 首次启动的欢迎弹窗，以及右上角常驻的详细教程抽屉 */
export function useOnboarding() {
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setWelcomeOpen(true)
    } catch {
      // localStorage 不可用时就不弹，不影响使用
    }
  }, [])

  return { welcomeOpen, setWelcomeOpen, guideOpen, setGuideOpen }
}

export function WelcomeModal({
  open,
  onClose,
  onOpenGuide,
}: {
  open: boolean
  onClose: () => void
  onOpenGuide: () => void
}) {
  const [dontShow, setDontShow] = useState(true)

  const close = () => {
    if (dontShow) {
      try {
        localStorage.setItem(SEEN_KEY, '1')
      } catch {
        // 存不了就下次还会弹，可以接受
      }
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onCancel={close}
      width={560}
      title="欢迎使用语文试卷AI批改系统"
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Checkbox checked={dontShow} onChange={(e) => setDontShow(e.target.checked)}>
            不再显示
          </Checkbox>
          <Space>
            <Button
              onClick={() => {
                close()
                onOpenGuide()
              }}
            >
              查看详细教程
            </Button>
            <Button type="primary" onClick={close}>
              开始使用
            </Button>
          </Space>
        </Space>
      }
    >
      <Paragraph>
        上传参考答案和学生试卷，系统调用<b>你自己配置的</b> AI 模型完成批改，
        并给出班级学情分析。所有数据都存在这台电脑上。
      </Paragraph>
      <Paragraph type="secondary">五步走：</Paragraph>
      <Steps
        direction="vertical"
        size="small"
        current={-1}
        items={STEPS.map((s) => ({ title: s.title, description: s.desc }))}
      />
      <Paragraph type="warning" style={{ marginTop: 12, marginBottom: 0 }}>
        AI 判分会有波动，成绩对外公布前请先人工复核。
      </Paragraph>
    </Modal>
  )
}

export function GuideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer title="使用教程" open={open} onClose={onClose} width={520}>
      <Typography>
        <Title level={5}>完整流程</Title>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={STEPS.map((s) => ({
            title: (
              <Link to={s.page} onClick={onClose}>
                {s.title}
              </Link>
            ),
            description: s.desc,
          }))}
        />

        <Title level={5}>两种上传方式怎么选</Title>
        <Paragraph>
          <b>批改试卷</b>：先在「学生管理」建好名单，把学生加进考试，再逐人上传各自的试卷。
          适合正式考试——每份卷子从一开始就和学生对应好。
        </Paragraph>
        <Paragraph>
          <b>批量导入</b>：先把一摞扫描件全传进来，每张图先各成一份试卷，
          <b>把一张卡片拖到另一张上就能合并</b>成多页；多页传错了可以「拆分」。
          学生姓名事后再选，不选也能批改。适合小测验。
        </Paragraph>

        <Title level={5}>识别模式</Title>
        <Paragraph>
          模型会把大图压缩到约 1300×1300。4491×3173 的扫描件会被缩到 34%，
          括号里的拼音、圈划记号就糊了。
        </Paragraph>
        <Paragraph>
          <Tag>普通</Tag>整页发送，快且省，适合字大、作答清楚的简单测验。
          <br />
          <Tag color="geekblue">高清</Tag>每页切成小块，不被压缩，清晰度约 3 倍，
          代价是每份多约 0.03 元、略慢。密排的正式试卷建议开。
        </Paragraph>
        <Paragraph type="secondary">在批改页工具栏上随时切换。</Paragraph>

        <Title level={5}>AI 判错了怎么办</Title>
        <Paragraph>
          <b>改单份的分</b>：试卷详情页里逐题和作文的分数都能直接改，保存后总分自动重算。
        </Paragraph>
        <Paragraph>
          <b>改参考答案</b>：考试管理 → 点开考试 → 逐题参考答案可编辑。
          改完之后作为权威答案参与<b>后续所有批改</b>，适合发现答案本身有误的情况。
        </Paragraph>
        <Paragraph>
          标「<Tag color="orange">待复核</Tag>」的题是模型自己承认看不准的
          （字迹潦草、涂改严重），请优先看这些。
        </Paragraph>

        <Title level={5}>花多少钱</Title>
        <Paragraph>
          以 deepseek-flash、一份 2 页试卷计，约 0.07~0.10 元，一个 30 人班级约 2~3 元。
          大头是模型「思考」消耗的输出 token，可在模型配置页关掉思考模式换取速度和成本，
          但判分会粗一些。
        </Paragraph>

        <Title level={5}>数据在哪</Title>
        <Paragraph>
          全部在本机：批改结果在 <Text code>backend/data/app.db</Text>，
          图片在 <Text code>backend/storage/</Text>。
          备份的话复制 app.db 一个文件即可。
          <Text type="warning">该文件含你的 API Key，不要分享给别人。</Text>
        </Paragraph>
      </Typography>
    </Drawer>
  )
}
