import { useState } from 'react'
import { Segmented, Tooltip, message } from 'antd'
import { ScanOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { api } from '../api/client'
import type { Exam } from '../types'

/** 识别模式切换：普通=整页发送，高清=切块发送不被压缩。放在批改页工具栏，随时可改。 */
export default function ModeSwitch({
  exam,
  onChanged,
}: {
  exam?: Exam
  onChanged: (exam: Exam) => void
}) {
  const [saving, setSaving] = useState(false)
  if (!exam) return null

  return (
    <Tooltip
      title={
        exam.hires_tiles
          ? '高清识别模式：每页切成小块发送，不被模型压缩，清晰度约3倍，能看清括号里的拼音和圈划记号。每份多约0.03元，略慢。'
          : '普通模式：整页发送，会被压缩到约1300×1300，小字容易糊。快且省，适合字大的简单测验。'
      }
    >
      <Segmented
        size="small"
        disabled={saving}
        value={exam.hires_tiles ? 'hires' : 'normal'}
        onChange={async (v) => {
          setSaving(true)
          try {
            const updated = await api.updateExam(exam.id, { hires_tiles: v === 'hires' })
            onChanged(updated)
            message.success(v === 'hires' ? '已切换到高清识别模式' : '已切换到普通模式')
          } finally {
            setSaving(false)
          }
        }}
        options={[
          { label: '普通', value: 'normal', icon: <ThunderboltOutlined /> },
          { label: '高清', value: 'hires', icon: <ScanOutlined /> },
        ]}
      />
    </Tooltip>
  )
}
