# 语文试卷AI批改系统

技术方案见 [项目技术方案文档_V0.1.md](./项目技术方案文档_V0.1.md)，
批改规则/评分规范见 [语文试卷AI批改工作流与评分规范_V1.0.md](./语文试卷AI批改工作流与评分规范_V1.0.md)。

## 目录结构

```
backend/   FastAPI 后端：数据模型、批改工作流编排、模型调用层
frontend/  React + Ant Design 前端：模型配置 / 试卷管理 / 批改结果查看
```

## 一键启动（推荐）

双击项目根目录的 **`start.bat`**，它会自动完成：

1. 检查并创建后端虚拟环境、安装 Python 依赖（仅首次）
2. 生成后端配置文件 `.env`（仅首次）
3. 检查并安装前端依赖（仅首次）
4. 在两个独立窗口分别启动后端和前端，并自动打开浏览器

关闭对应的命令行窗口即可停止服务。

> 注意：`start.bat` 和 `scripts/` 下的批处理文件必须保持 **CRLF 换行 + GBK 编码**，
> 这是 Windows cmd 的硬性要求，用 LF 换行会导致变量赋值失效、脚本行为异常。

## 手动运行

### 后端

```bash
cd backend
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt   # Windows
cp .env.example .env
./.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

首次启动会自动在 `backend/data/app.db` 建好 SQLite 数据库，上传的扫描件存在 `backend/storage/`（均已加入 .gitignore，不会被提交）。

### 前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 ，开发环境下前端会通过 Vite 代理把 `/api/*` 转发到后端的 `http://127.0.0.1:8000`。

## 核心流程

```
教师上传参考答案（Word/文本/图片）
        ↓
上传学生扫描件（按页数自动分组，一份试卷可以有多张图片）
        ↓
每份试卷的所有图片 + 参考答案 + 评分规则  →  一次 API 调用
        ↓
存下模型返回的批改结果 → 页面上对照原卷查看
```

程序本身不做 OCR、不做切题、不做评分规则引擎。评分规则写在
`backend/app/services/prompts.py` 的提示词里，要调整评分尺度改那个文件即可。

## 已完成

- 模型配置界面：选厂商（DeepSeek/豆包/千问/自定义）→ 粘贴 API Key → 测试连接
- 考试管理：上传参考答案（Word/文本自动提取文字，图片直接作为参考图）+ 补充评分说明
- 批量上传扫描件，按"每份试卷页数"自动分组，每份独立记录、独立批改
- 批改结果页：总分、各大题得分、逐题得分与原因、作文评价、待复核标记，可对照原卷图片
- 班级、学生的基础CRUD接口（为P1功能预留）

## 下一步

- 班级系统目前只有基础CRUD和"试卷绑定学生"接口，还没有成绩历史和班级统计页面。
- 错题解析与学习指导生成（中优先级）、家校同步（最低优先级，建议微信小程序）尚未开始。
