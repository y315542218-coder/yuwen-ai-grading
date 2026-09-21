import { useEffect, useState } from 'react'
import { Button, Card, Input, Select, Space, Table, Typography, message } from 'antd'
import { api } from '../api/client'
import type { ClassGroup, Student } from '../types'

const { Title, Paragraph, Text } = Typography
const { TextArea } = Input

export default function StudentsPage() {
  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [filterClass, setFilterClass] = useState<number>()
  const [newClass, setNewClass] = useState('')
  const [namesText, setNamesText] = useState('')
  const [targetClass, setTargetClass] = useState<number>()
  const [saving, setSaving] = useState(false)

  const refresh = () => {
    api.listClasses().then(setClasses)
    api.listStudents(filterClass).then(setStudents)
  }

  useEffect(() => {
    refresh()
  }, [filterClass])

  const onCreateClass = async () => {
    if (!newClass.trim()) return
    await api.createClass(newClass.trim())
    setNewClass('')
    message.success('班级已创建')
    refresh()
  }

  const onAddStudents = async () => {
    const names = namesText
      .split(/[\n,，、\s]+/)
      .map((n) => n.trim())
      .filter(Boolean)
    if (names.length === 0) {
      message.warning('请输入学生姓名')
      return
    }
    setSaving(true)
    try {
      const created = await api.createStudentsBatch(names, targetClass)
      message.success(`已添加 ${created.length} 名学生`)
      setNamesText('')
      refresh()
    } finally {
      setSaving(false)
    }
  }

  const classNameOf = (id?: number | null) =>
    classes.find((c) => c.id === id)?.name ?? '未分班'

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%', maxWidth: 860 }}>
      <div>
        <Title level={3}>学生管理</Title>
        <Paragraph type="secondary">
          学生在这里提前建好，批改试卷时直接从名单里选人加入考试，不用每次重新录。
        </Paragraph>
      </div>

      <Card title="班级">
        <Space wrap>
          <Input
            placeholder="班级名称，例如 五年级(1)班"
            value={newClass}
            onChange={(e) => setNewClass(e.target.value)}
            onPressEnter={onCreateClass}
            style={{ width: 240 }}
          />
          <Button onClick={onCreateClass}>新建班级</Button>
          {classes.map((c) => (
            <Button
              key={c.id}
              size="small"
              danger
              onClick={async () => {
                await api.deleteClass(c.id)
                message.success('班级已删除，学生保留')
                refresh()
              }}
            >
              删除 {c.name}
            </Button>
          ))}
        </Space>
      </Card>

      <Card title="批量添加学生">
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Select
            placeholder="加入哪个班级（可不选）"
            style={{ width: 240 }}
            allowClear
            value={targetClass}
            onChange={setTargetClass}
            options={classes.map((c) => ({ label: c.name, value: c.id }))}
          />
          <div>
            <Text type="secondary">
              一行一个姓名，也可以用逗号、顿号或空格分隔，直接粘贴班级名单即可
            </Text>
            <TextArea
              rows={6}
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              placeholder={'张三\n李四\n王五'}
            />
          </div>
          <Button type="primary" onClick={onAddStudents} loading={saving}>
            添加
          </Button>
        </Space>
      </Card>

      <Card
        title="学生名单"
        extra={
          <Select
            placeholder="按班级筛选"
            style={{ width: 180 }}
            allowClear
            value={filterClass}
            onChange={setFilterClass}
            options={classes.map((c) => ({ label: c.name, value: c.id }))}
          />
        }
      >
        <Table
          rowKey="id"
          dataSource={students}
          size="small"
          columns={[
            { title: 'ID', dataIndex: 'id', width: 60 },
            { title: '姓名', dataIndex: 'name' },
            { title: '班级', render: (_, r: Student) => classNameOf(r.class_id) },
            {
              title: '操作',
              width: 80,
              render: (_, r: Student) => (
                <Button
                  size="small"
                  danger
                  onClick={async () => {
                    await api.deleteStudent(r.id)
                    refresh()
                  }}
                >
                  删除
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  )
}
