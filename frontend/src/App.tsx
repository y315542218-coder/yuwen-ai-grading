import { Layout, Menu } from 'antd'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import ModelConfigPage from './pages/ModelConfigPage'
import ExamsPage from './pages/ExamsPage'
import ExamDetailPage from './pages/ExamDetailPage'
import StudentsPage from './pages/StudentsPage'
import SubmissionsPage from './pages/SubmissionsPage'
import BatchImportPage from './pages/BatchImportPage'
import StatisticsPage from './pages/StatisticsPage'
import SubmissionDetailPage from './pages/SubmissionDetailPage'

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
  const selectedKey = NAV_ITEMS.find((item) => location.pathname.startsWith(item.key))?.key ?? '/submissions'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginRight: 40 }}>
          语文试卷AI批改系统
        </div>
      </Header>
      <Layout>
        <Sider width={180} theme="light">
          <Menu mode="inline" selectedKeys={[selectedKey]} items={NAV_ITEMS} style={{ height: '100%' }} />
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
  )
}

export default App
