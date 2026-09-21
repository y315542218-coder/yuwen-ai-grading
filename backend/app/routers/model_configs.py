from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..crypto import Cryptor
from ..database import get_db
from ..services.model_provider import PROVIDER_PRESETS, ModelProvider, ModelProviderError

router = APIRouter(prefix="/model-configs", tags=["model-configs"])


@router.get("/presets")
def list_presets():
    """前端下拉框用：厂商 -> 默认 base_url / model_name（技术方案第5节）。"""
    return PROVIDER_PRESETS


@router.get("", response_model=list[schemas.ModelConfigOut])
def list_configs(db: Session = Depends(get_db)):
    return db.query(models.ModelConfig).all()


@router.post("", response_model=schemas.ModelConfigOut)
def create_config(payload: schemas.ModelConfigIn, db: Session = Depends(get_db)):
    settings = get_settings()
    cryptor = Cryptor(settings.secret_key)

    # MVP阶段简化为“只有一个生效配置”，教师换模型即覆盖上一个。
    db.query(models.ModelConfig).update({"is_active": False})

    config = models.ModelConfig(
        provider=payload.provider,
        base_url=payload.base_url,
        model_name=payload.model_name,
        api_key_encrypted=cryptor.encrypt(payload.api_key),
        is_active=True,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.post("/{config_id}/test")
async def test_config(config_id: int, db: Session = Depends(get_db)):
    settings = get_settings()
    cryptor = Cryptor(settings.secret_key)
    config = db.get(models.ModelConfig, config_id)
    if config is None:
        raise HTTPException(404, "配置不存在")

    provider = ModelProvider(
        base_url=config.base_url,
        api_key=cryptor.decrypt(config.api_key_encrypted),
        model_name=config.model_name,
    )
    try:
        await provider.ping()
    except ModelProviderError as exc:
        raise HTTPException(400, f"连接测试失败：{exc}") from exc
    return {"ok": True}


@router.delete("/{config_id}")
def delete_config(config_id: int, db: Session = Depends(get_db)):
    config = db.get(models.ModelConfig, config_id)
    if config is None:
        raise HTTPException(404, "配置不存在")
    db.delete(config)
    db.commit()
    return {"ok": True}
