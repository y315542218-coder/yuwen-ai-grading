"""统一的多模态模型调用层。

DeepSeek / 豆包(火山方舟 Ark) / 千问(DashScope 兼容模式) 的多模态对话接口
都兼容或接近 OpenAI 的 Chat Completions 协议，因此这里只写一套客户端，
换模型只需要在“模型配置”里改 base_url / model_name / api_key。
"""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

import httpx

# 预置的厂商默认地址，方便教师在配置界面一键选择。
# 注意：批改扫描件必须用支持视觉的模型。DeepSeek 只有 deepseek-flash 支持读图，
# deepseek-v4-pro 不支持（见 https://api-docs.deepseek.com/guides/vision）。
PROVIDER_PRESETS: dict[str, dict[str, str]] = {
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-flash",
    },
    "doubao": {
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "default_model": "doubao-vision-pro-32k",
    },
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-vl-max",
    },
    "custom": {"base_url": "", "default_model": ""},
}


class ModelProviderError(RuntimeError):
    pass


class ModelProvider:
    def __init__(self, base_url: str, api_key: str, model_name: str, timeout: float = 120.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model_name = model_name
        self.timeout = timeout

    @staticmethod
    def _encode_image(image_path: str | Path) -> str:
        return base64.b64encode(Path(image_path).read_bytes()).decode("utf-8")

    def _build_messages(
        self, system_prompt: str, user_text: str, image_paths: list[str] | None
    ) -> list[dict[str, Any]]:
        content: list[dict[str, Any]] = [{"type": "text", "text": user_text}]
        for path in image_paths or []:
            b64 = self._encode_image(path)
            suffix = Path(path).suffix.lstrip(".").lower() or "png"
            content.append(
                {"type": "image_url", "image_url": {"url": f"data:image/{suffix};base64,{b64}"}}
            )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},
        ]

    async def chat(
        self,
        system_prompt: str,
        user_text: str,
        image_paths: list[str] | None = None,
        *,
        temperature: float = 0.1,
        response_format_json: bool = True,
    ) -> str:
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": self._build_messages(system_prompt, user_text, image_paths),
            "temperature": temperature,
        }
        if response_format_json:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
            except httpx.HTTPError as exc:
                raise ModelProviderError(f"请求模型接口失败：{exc}") from exc

        if resp.status_code >= 400:
            raise ModelProviderError(f"模型接口返回错误 {resp.status_code}：{resp.text[:500]}")

        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise ModelProviderError(f"模型返回格式异常：{data}") from exc

    async def ping(self) -> bool:
        """“测试连接”按钮使用：发一次最小请求验证 Key 是否有效。"""
        await self.chat(
            system_prompt="你是一个连通性测试助手。",
            user_text='请只回复 JSON：{"ok": true}',
            temperature=0,
        )
        return True
