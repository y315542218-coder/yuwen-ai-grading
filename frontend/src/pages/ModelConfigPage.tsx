import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Select, Space, Table, Tag, Typography, message } from 'antd'
import { api } from '../api/client'
import type { ModelConfig, ProviderPreset } from '../types'

const { Title, Paragraph } = Typography

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  doubao: '豆包（火山方舟）',
  qwen: '千问（DashScope）',
  custom: '自定义（OpenAI兼容接口）',
}

export default function ModelConfigPage() {
  const [presets, setPresets] = useState<Record<string, ProviderPreset>>({})
  const [configs, setConfigs] = useState<ModelConfig[]>([])
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [form] = Form.useForm()

  const refresh = () => {
    api.listModelConfigs().then(setConfigs)
  }

  useEffect(() => {
    api.getPresets().then((data) => {
      setPresets(data)
      const preset = data[form.getFieldValue('provider')]
      if (preset) {
        form.setFieldsValue({ base_url: preset.base_url, model_name: preset.default_model })
      }
    })
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onProviderChange = (provider: string) => {
    const preset = presets[provider]
    if (preset) {
      form.setFieldsValue({ base_url: preset.base_url, model_name: preset.default_model })
    }
  }

  const onSave = async (values: {
    provider: string
    base_url: string
    model_name: string
    api_key: string
  }) => {
    setSaving(true)
    try {
      await api.createModelConfig(values)
      message.success('保存成功，已设为当前使用的模型')
      form.resetFields(['api_key'])
      refresh()
    } catch (e) {
      message.error(`保存失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const onTest = async (id: number) => {
    setTestingId(id)
    try {
      await api.testModelConfig(id)
      message.success('连接测试成功')
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message: string }
      message.error(err.response?.data?.detail ?? err.message)
    } finally {
      setTestingId(null)
    }
  }

  const onDelete = async (id: number) => {
    await api.deleteModelConfig(id)
    refresh()
  }

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%', maxWidth: 640 }}>
      <div>
        <Title level={3}>模型配置</Title>
        <Paragraph type="secondary">
          选择你正在使用的多模态模型厂商，粘贴 API Key 即可，地址和模型名会自动填好。
          当前只支持同时生效一个模型，保存新的配置会替换上一个。
        </Paragraph>
      </div>

      <Card>
        <Form form={form} layout="vertical" onFinish={onSave} initialValues={{ provider: 'deepseek' }}>
          <Form.Item label="模型厂商" name="provider" rules={[{ required: true }]}>
            <Select onChange={onProviderChange}>
              {Object.keys(PROVIDER_LABELS).map((key) => (
                <Select.Option key={key} value={key}>
                  {PROVIDER_LABELS[key]}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="接口地址 (base_url)" name="base_url" rules={[{ required: true }]}>
            <Input placeholder="https://api.example.com/v1" />
          </Form.Item>
          <Form.Item
            label="模型名称"
            name="model_name"
            rules={[{ required: true }]}
            extra="请以你实际开通的模型名称为准（不同厂商/套餐名称可能不同）"
          >
            <Input placeholder="例如 deepseek-vl2" />
          </Form.Item>
          <Form.Item label="API Key" name="api_key" rules={[{ required: true }]}>
            <Input.Password placeholder="把 API Key 粘贴到这里" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存并启用
          </Button>
        </Form>
      </Card>

      <Card title="已保存的配置">
        <Table
          rowKey="id"
          dataSource={configs}
          pagination={false}
          columns={[
            { title: '厂商', dataIndex: 'provider', render: (p: string) => PROVIDER_LABELS[p] ?? p },
            { title: '模型', dataIndex: 'model_name' },
            { title: '地址', dataIndex: 'base_url', ellipsis: true },
            {
              title: '状态',
              dataIndex: 'is_active',
              render: (active: boolean) =>
                active ? <Tag color="green">使用中</Tag> : <Tag>未启用</Tag>,
            },
            {
              title: '操作',
              render: (_, record: ModelConfig) => (
                <Space>
                  <Button
                    size="small"
                    loading={testingId === record.id}
                    onClick={() => onTest(record.id)}
                  >
                    测试连接
                  </Button>
                  <Button size="small" danger onClick={() => onDelete(record.id)}>
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
