"""首次启动时生成 backend/.env。

不能直接复制 .env.example：那里面的 SECRET_KEY 是个占位符，且随代码公开在仓库里。
它用来加密数据库中的 API Key，必须每台机器各自随机生成，否则拿到 app.db
的人可以用公开的占位符把 Key 解出来。
"""

import secrets
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
env_path = BACKEND / ".env"

if env_path.exists():
    print(".env 已存在，跳过")
    raise SystemExit

template = (BACKEND / ".env.example").read_text(encoding="utf-8")
lines = [
    f"SECRET_KEY={secrets.token_urlsafe(48)}"
    if line.startswith("SECRET_KEY=")
    else line
    for line in template.splitlines()
]
env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("已生成 .env，SECRET_KEY 为本机随机值")
