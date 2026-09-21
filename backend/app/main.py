from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import Base, engine
from .routers import classes, exams, model_configs, submissions

Base.metadata.create_all(bind=engine)

settings = get_settings()

app = FastAPI(title="语文试卷AI批改系统", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(model_configs.router)
app.include_router(exams.router)
app.include_router(submissions.router)
app.include_router(classes.router)


@app.get("/health")
def health():
    return {"status": "ok"}
