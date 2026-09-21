import { Button, ConfigProvider, Layout, Menu, Space, Tooltip, theme as antdTheme } from 'antd'
import { MoonOutlined, QuestionCircleOutlined, SunOutlined } from '@ant-design/icons'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import ModelConfigPage from './pages/ModelConfigPage'
import ExamsPage from './pages/ExamsPage'
import ExamDetailPage from './pages/ExamDetailPage'
import StudentsPage from './pages/StudentsPage'
import SubmissionsPage from './pages/SubmissionsPage'
import BatchImportPage from './pages/BatchImportPage'
import StatisticsPage from './pages/StatisticsPage'
import SubmissionDetailPage from './pages/SubmissionDetailPage'
import { GuideDrawer, WelcomeModal, useOnboarding } from './components/Onboarding'
import { useThemeMode } from './theme'

const { Header, Content, Sider } = Layout

const NAV_ITEMS = [
  { key: '/model-config', label: <Link to="/model-config">模型配置</Link> },
  { key: '/exams', label: <Link to="/exams">考试管理</Link> },
  { key: '/students', label: <Link to="/students">学生管理</Link> },
  { key: '/submissions', label: <Link to="/submissions">批改试卷</Link> },
  { key: '/batch', label: <Link to="/batch">批量导入</Link> },
  { key: '/statistics', label: <Link to="/statistics">成绩统计</Link> },
]

function App() {
  const location = useLocation()
  const { mode, toggle } = useThemeMode()
  const { welcomeOpen, setWelcomeOpen, guideOpen, setGuideOpen } = useOnboarding()
  const dark = mode === 'dark'

  const selectedKey =
    NAV_ITEMS.find((item) => location.pathname.startsWith(item.key))?.key ?? '/submissions'

  return (
    <ConfigProvider
      theme={{ algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center', paddingInline: 24 }}>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 600, flex: 1 }}>
            语文试卷AI批改系统
          </div>
          <Space>
            <Button
              type="text"
              style={{ color: '#fff' }}
              icon={<QuestionCircleOutlined />}
              onClick={() => setGuideOpen(true)}
            >
              使用教程
            </Button>
            <Tooltip title={dark ? '切换到日间模式' : '切换到夜间模式'}>
              <Button
                type="text"
                style={{ color: '#fff' }}
                icon={dark ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggle}
              />
            </Tooltip>
          </Space>
        </Header>
        <Layout>
          <Sider width={180} theme={dark ? 'dark' : 'light'}>
            <Menu
              mode="inline"
              theme={dark ? 'dark' : 'light'}
              selectedKeys={[selectedKey]}
              items={NAV_ITEMS}
              style={{ height: '100%' }}
            />
          </Sider>
          <Content style={{ padding: 24 }}>
            <Routes>
              <Route path="/" element={<SubmissionsPage />} />
              <Route path="/model-config" element={<ModelConfigPage />} />
              <Route path="/exams" element={<ExamsPage />} />
              <Route path="/exams/:id" element={<ExamDetailPage />} />
              <Route path="/students" element={<StudentsPage />} />
              <Route path="/submissions" element={<SubmissionsPage />} />
              <Route path="/batch" element={<BatchImportPage />} />
              <Route path="/statistics" element={<StatisticsPage />} />
              <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>

      <WelcomeModal
        open={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
        onOpenGuide={() => setGuideOpen(true)}
      />
      <GuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
    </ConfigProvider>
  )
}

export default App
